// Isolated, real API lifecycle. Provision scripts/provision-order-load-fixture.py first.
// Credentials stay in --fixture; results contain no tokens, passwords or QR values.
import fs from 'node:fs';
import https from 'node:https';
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';
const args=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,all)=>i%2?a:[...a,[x.slice(2),all[i+1]]],[]));
if(!args.fixture || !args.output)throw new Error('Pass --fixture and --output');
const fixture=JSON.parse(fs.readFileSync(args.fixture,'utf8'));
if(fixture.slug!=='loadtest-20261030')throw new Error('Unexpected fixture');
const env=Object.fromEntries(fs.readFileSync('.env.local','utf8').split('\n').filter(x=>/^[A-Z_]+=/.test(x)).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1).replace(/^['"]|['"]$/g,'')];}));
const base=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_ANON_KEY;
if(base!=='https://api.wayyaam.ru')throw new Error('Unexpected API');
const agent=new https.Agent({keepAlive:true,maxSockets:128,maxFreeSockets:64});
const metrics=[],failures=[],orders=[];let retries=0;
const call=(path,body,actor,allowFailure=false)=>new Promise((resolve,reject)=>{
 const start=performance.now();let queued=0,socketAt=0;
 const req=https.request(base+'/rest/v1/'+path,{agent,method:body===undefined?'GET':'POST',headers:{apikey:key,Authorization:'Bearer '+(actor?.token||key),'Content-Type':'application/json'},signal:AbortSignal.timeout(30000)},res=>{
  let raw='';res.on('data',b=>raw+=b);res.on('end',()=>{
   const m={endpoint:path.split('?')[0],ms:performance.now()-start,queueMs:queued,status:res.statusCode,expectedDenial:allowFailure&&res.statusCode>=400};metrics.push(m);
   let value;try{value=JSON.parse(raw);}catch{value=raw;}
   if(res.statusCode>=200&&res.statusCode<300)resolve(value);
   else if(allowFailure)resolve({denied:true,status:res.statusCode,message:value?.message});
   else reject(Object.assign(new Error(value?.message||'HTTP '+res.statusCode),{endpoint:m.endpoint,status:res.statusCode}));
  });res.on('error',reject);
 });
 req.on('socket',()=>{socketAt=performance.now();queued=socketAt-start;});
 req.on('error',err=>{metrics.push({endpoint:path.split('?')[0],ms:performance.now()-start,queueMs:queued,status:0,error:err.code});reject(Object.assign(err,{endpoint:path.split('?')[0]}));});
 req.end(body===undefined?undefined:JSON.stringify(body));
});
const transient=e=>[0,502,503,504].includes(e.status)||(!e.status&&['ETIMEDOUT','ECONNRESET','ABORT_ERR','EPIPE'].includes(e.code));
const rpc=async(name,body,actor,denied=false)=>{
 for(let attempt=0;;attempt++)try{return await call('rpc/'+name,body,actor,denied);}catch(e){
  if(attempt>=2||!name.startsWith('get_')||!transient(e))throw e;
  retries++;await pause(150*(attempt+1));
 }
};
const reconcile=async(name,body,actor)=>{
 const did=body.target_delivery_id,oid=body.target_order_id;
 if(!did&&!oid)return undefined;
 const fields='id,status,driver_id,pickup_qr_confirmed_at,driver_restaurant_order_payment_confirmed_at,driver_handed_to_client_at,client_received_at';
 const rows=did?await call(`deliveries?select=${fields}&id=eq.${did}`,undefined,restaurant):[];
 const d=rows[0];
 if(d){
  if(name==='complete_driver_delivery'&&d.status==='delivered'&&d.driver_id===actor?.driverId)return did;
  if(name==='accept_available_delivery'&&d.status==='assigned'&&d.driver_id===actor?.driverId)return did;
  if(name==='update_current_driver_delivery_status'&&d.status===body.next_status&&d.driver_id===actor?.driverId)return did;
  if(name==='confirm_delivery_pickup_qr'&&d.pickup_qr_confirmed_at)return true;
  if(name==='confirm_driver_pickup'&&['handed_over','on_the_way','arrived_to_client','delivered'].includes(d.status)&&d.driver_id===actor?.driverId)return true;
  if(name==='confirm_current_driver_restaurant_order_payment'&&d.driver_restaurant_order_payment_confirmed_at&&d.driver_id===actor?.driverId)return {reconciled:true};
  if(name==='confirm_driver_delivery_handoff'&&d.driver_handed_to_client_at&&d.driver_id===actor?.driverId)return {reconciled:true};
 }
 if(oid){
  const rows=await call(`orders?select=id,status,customer_phone,restaurant_payment_confirmed_at,deliveries(id,client_received_at)&id=eq.${oid}&catalog_id=eq.${fixture.catalogId}`,undefined,restaurant);const o=rows[0];
  const delivery=Array.isArray(o?.deliveries)?o.deliveries[0]:o?.deliveries;
  if(name==='update_restaurant_order_status'&&o?.status===body.next_status)return o.status;
  if(name==='confirm_restaurant_cash_payment'&&o?.restaurant_payment_confirmed_at)return true;
  if(name==='dispatch_restaurant_order_to_delivery'&&delivery?.id)return delivery.id;
  if(name==='confirm_client_order_receipt'&&delivery?.client_received_at&&o.customer_phone===actor?.phone&&Object.values(fixture.actors).some(x=>x.authId===actor?.authId&&x.clientSession===body.client_session_token))return {reconciled:true};
 }
 return undefined;
};
const checked=async(name,body,actor)=>{
 for(let attempt=0;;attempt++){
  try{const v=await rpc(name,body,actor);if(v===false||v==null){const state=await reconcile(name,body,actor);if(state!==undefined)return state;throw Object.assign(new Error(name+' returned no confirmation'),{endpoint:name});}return v;}
  catch(e){if(attempt>=2||!transient(e))throw e;retries++;await pause(150*(attempt+1));const state=await reconcile(name,body,actor);if(state!==undefined)return state;}
 }
};
const pool=(n)=>{let active=0;const queue=[];return async fn=>{if(active>=n)await new Promise(resolve=>queue.push(resolve));active++;try{return await fn();}finally{active--;queue.shift()?.();}};};
const restaurant=fixture.actors.restaurant,restaurantPool=pool(3),drivers=Array.from({length:5},(_,i)=>fixture.actors['driver-'+(i+1)]),lanes=drivers.map(()=>pool(1));
const quantile=(a,p)=>a.length?a.toSorted((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))]:0;
const levels=(args.levels||'10').split(',').map(Number),run=args.run||new Date().toISOString().replace(/[^0-9]/g,'');
let controls=0;
// Anonymous visitors cannot discover the seeded restaurant.
assert.equal(await rpc('get_catalog_menu_snapshot',{catalog_slug:fixture.slug}),null);controls++;
for(const users of levels){
 if(!Number.isInteger(users)||users<1||users>300)throw new Error('Invalid level');
 const clients=Array.from({length:users},(_,i)=>fixture.actors['client-'+String(i+1).padStart(3,'0')]);if(clients.some(x=>!x))throw new Error('Provision more clients');
 const startedAt=new Date().toISOString(),began=performance.now(),offset=metrics.length,failedBefore=failures.length,completed=[],created=[],queueTimes=[];
 console.log(JSON.stringify({event:'stage-start',users,startedAt}));
 await Promise.all(clients.map(async(client,i)=>{
  let orderId,deliveryId,step='menu';const t=performance.now();
  try{
   const menu=await rpc('get_catalog_menu_snapshot',{catalog_slug:fixture.slug},client);assert.equal(menu?.catalog?.id,fixture.catalogId);
   step='create';
   const body={target_catalog_id:fixture.catalogId,customer_name:'НАГРУЗОЧНЫЙ ТЕСТ '+(i+1),customer_phone:client.phone,fulfillment_type:'delivery',cabin_label:'',delivery_address:'ТЕСТ — фактическая доставка не требуется',delivery_city:'Грозный',delivery_settlement:'Тестовый район WayYaam',client_address_comment:'Только автоматический тест',comment:'НАГРУЗОЧНЫЙ ТЕСТ '+run+'\nКоординаты клиента: 43.3180,45.7000 (точность 10 м)',items:[{product_id:fixture.products[i%fixture.products.length],quantity:1,options:[]}],idempotency_key:`load-${run}-${users}-${i}`,payment_method:'cash',client_session_token:client.clientSession,target_general_consent_confirmed:true,target_user_agreement_version:'3.0',target_user_agreement_sha256:'3759c66b510a52c0acab71d7924ce3a7572b5ad33a4c098c62d805ae83093972',target_client_consent_version:'3.0',target_client_consent_sha256:'feb54a971da7e60ecce4e3881beedcdfe41964b6c04a79bff7ee632a5a0e7b5e',target_order_transfer_confirmed:true,target_order_transfer_version:'3.0',target_order_transfer_sha256:'b8526c815a6919a1b5df1f7bd7d7182de46fe9ff0d245026fd5262828f8645e7'};
   let result;
   // Only creation is retried automatically, using the identical idempotency key.
   try{result=await rpc('create_secure_client_platform_order',body,client);}catch(e){if(!transient(e))throw e;retries++;result=await rpc('create_secure_client_platform_order',body,client);}
   orderId=result.order_id;assert.ok(orderId);orders.push(orderId);created.push(performance.now()-t);
   if(args.controls==='true'&&i===0){const duplicate=await rpc('create_secure_client_platform_order',body,client);assert.equal(duplicate.order_id,orderId);controls++;}
   step='restaurant';
   await restaurantPool(async()=>{
    const visible=await call(`orders?select=id,is_test_order&catalog_id=eq.${fixture.catalogId}&id=eq.${orderId}`,undefined,restaurant);assert.equal(visible[0]?.is_test_order,true);
    for(const next_status of ['accepted','preparing','ready'])await checked('update_restaurant_order_status',{target_order_id:orderId,target_catalog_id:fixture.catalogId,next_status,status_reason:'automated isolated load test'},restaurant);
    deliveryId=await checked('dispatch_restaurant_order_to_delivery',{target_order_id:orderId,target_catalog_id:fixture.catalogId,route_to_restaurant_url_input:'',route_to_client_url_input:'',offered_fee_input:120,pricing_status_input:'offered'},restaurant);
   });
   const waiting=performance.now(),lane=i%5;
   await lanes[lane](async()=>{
    queueTimes.push(performance.now()-waiting);const driver=drivers[lane];step='accept';
    await checked('accept_available_delivery',{target_delivery_id:deliveryId,target_driver_id:driver.driverId},driver);
    if(args.controls==='true'&&i===0){
     assert.equal((await rpc('complete_driver_delivery',{target_delivery_id:deliveryId},driver,true)).message,'delivery_completion_confirmation_required');controls++;
     assert.equal((await rpc('update_current_driver_delivery_status',{target_delivery_id:deliveryId,next_status:'arrived_to_restaurant'},drivers[(lane+1)%5],true)).message,'Delivery is not assigned to current driver');controls++;
    }
    step='pickup';await checked('update_current_driver_delivery_status',{target_delivery_id:deliveryId,next_status:'arrived_to_restaurant'},driver);
    await checked('confirm_current_driver_restaurant_order_payment',{target_delivery_id:deliveryId},driver);
    await checked('confirm_restaurant_cash_payment',{target_order_id:orderId},restaurant);
    const qr=await checked('refresh_current_driver_pickup_qr',{target_delivery_id:deliveryId},driver);
    await checked('confirm_delivery_pickup_qr',{target_delivery_id:deliveryId,presented_token:qr.token},restaurant);
    await checked('confirm_driver_pickup',{target_delivery_id:deliveryId},driver);
    step='drive';for(const next_status of ['on_the_way','arrived_to_client'])await checked('update_current_driver_delivery_status',{target_delivery_id:deliveryId,next_status},driver);
    await checked('confirm_driver_delivery_handoff',{target_delivery_id:deliveryId},driver);
    step='receipt';
    if(args.controls==='true'&&i===0&&fixture.actors['client-002']){assert.equal((await rpc('confirm_client_order_receipt',{target_order_id:orderId,client_session_token:fixture.actors['client-002'].clientSession},fixture.actors['client-002'],true)).message,'client_handoff_order_forbidden');controls++;}
    await checked('confirm_client_order_receipt',{target_order_id:orderId,client_session_token:client.clientSession},client);
    step='complete';await checked('complete_driver_delivery',{target_delivery_id:deliveryId},driver);
    const final=await call(`orders?select=id,status,is_test_order,deliveries(status,is_test)&id=eq.${orderId}`,undefined,restaurant);
    assert.equal(final[0]?.status,'completed');assert.equal(final[0]?.is_test_order,true);const delivery=Array.isArray(final[0]?.deliveries)?final[0].deliveries[0]:final[0]?.deliveries;assert.equal(delivery?.status,'delivered');assert.equal(delivery?.is_test,true);
   });completed.push(performance.now()-t);
  }catch(e){failures.push({users,client:i+1,orderId,deliveryId,step,endpoint:e.endpoint,message:e.message,status:e.status});}
 }));
 const rows=metrics.slice(offset),errors=rows.filter(x=>x.status!==200&&!x.expectedDenial),endpoints={};for(const r of rows){(endpoints[r.endpoint]??=[]).push(r.ms);}
 const record={startedAt,endedAt:new Date().toISOString(),users,elapsedSeconds:(performance.now()-began)/1000,requests:rows.length,completed:completed.length,failed:failures.length-failedBefore,createP95:quantile(created,.95),requestP95:quantile(rows.map(x=>x.ms),.95),requestQueueP95:quantile(rows.map(x=>x.queueMs),.95),driverQueueP95:quantile(queueTimes,.95),lifecycleP50:quantile(completed,.5),lifecycleP95:quantile(completed,.95),httpErrors:errors.length,expectedDenials:rows.filter(x=>x.expectedDenial).length,statuses:rows.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),retries,controls,endpoints:Object.fromEntries(Object.entries(endpoints).map(([k,v])=>[k,{count:v.length,p95:quantile(v,.95)}]))};
 fs.appendFileSync(args.output,JSON.stringify(record)+'\n');fs.writeFileSync(args.output+'.failures.json',JSON.stringify(failures,null,2),{mode:0o600});fs.writeFileSync(args.output+'.orders.json',JSON.stringify(orders),{mode:0o600});console.log(JSON.stringify(record));
 if(record.failed>0){console.log('Stopped for diagnosis: incomplete lifecycle');process.exitCode=1;break;}
}
agent.destroy();
