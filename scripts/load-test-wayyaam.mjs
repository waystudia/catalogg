// Read-only mixed API journeys. Optional short-lived authenticated tokens stay outside reports.
// node scripts/load-test-wayyaam.mjs --roles /private/roles.json --duration 20 --levels 10,20,30,50,75,100,150
import fs from 'node:fs';
import { setTimeout as pause } from 'node:timers/promises';
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => i % 2 ? pairs : [...pairs, [arg.replace(/^--/, ''), all[i + 1]]], []));
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split('\n').filter(x => /^[A-Z_]+=/.test(x)).map(x => { const i=x.indexOf('='); return [x.slice(0,i),x.slice(i+1).replace(/^['"]|['"]$/g,'')]; }));
const base = env.VITE_SUPABASE_URL;
if (base !== 'https://api.wayyaam.ru') throw new Error('Unexpected production API');
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const roles = args.roles ? JSON.parse(fs.readFileSync(args.roles, 'utf8')) : {};
const duration = Number(args.duration || 20) * 1000;
const levels = (args.levels || '10,20,30,50,75,100,150').split(',').map(Number);
const output = args.output || 'output/performance-20261030/load-results.jsonl';
fs.mkdirSync(output.slice(0, output.lastIndexOf('/')), { recursive: true });
const catalogs = [
 ['mangal','c714eca4-e8b3-4926-a245-01930cd109ee'], ['finik','8bdb983f-3fe4-4ad5-8738-352eb5ae02c3'],
 ['coffee-shop','bda6fd08-3799-4279-81d1-bd201a912976'], ['confectionery','ab554ca3-64f9-4aef-9fab-0e22aaa3d093'],
 ['barakat','4e76b194-c2fa-464a-adb9-d5c336a94fd0'], ['rizih','12bc99da-90e8-4fe9-8b7f-b2488d94ac7c']
];
const menu = (id) => [
 ['categories','id,slug,name,description,image_url,icon'], ['products','id,category_id,title,status,price,description,ingredients,weight,serving,stock_count,is_unlimited,is_popular,is_new,is_promo,custom_fields'],
 ['product_images','product_id,url,sort_order'], ['tags','id,slug,name,icon,color'], ['bookable_resources','id,title,capacity,image_url,is_active,capacity_text,resource_type,price'],
 ['product_option_groups','id,product_id,name,required,min_selected,max_selected,is_active'], ['product_options','id,group_id,name,price_delta,is_default,is_active'],
 ['catalog_theme_settings','settings'],
 ...['photo-quality','restaurant-gallery','product-choices','product-config','catalog-info'].map(k=>['catalog_sections','settings,enabled',k])
].map(([table,select,k])=>({path:`${table}?select=${select}&catalog_id=eq.${id}${k?'&key=eq.'+k:''}`}));
const journeys = catalogs.map(([name,id]) => ({ name, calls:menu(id) }));
if (roles.driver) journeys.push({name:'driver',calls:['get_current_driver_dashboard_data','get_current_driver_delivery_handoffs'].map(name=>({path:'rpc/'+name,token:roles.driver,method:'POST'}))});
if (roles.restaurant) journeys.push({name:'restaurant-orders',calls:[{path:`orders?select=*,deliveries(*),order_items(*)&catalog_id=eq.${catalogs[0][1]}&order=created_at.desc`,token:roles.restaurant},{path:`restaurant_delivery_settings?select=*&catalog_id=eq.${catalogs[0][1]}`,token:roles.restaurant}]});
const request = async (call) => {
 const start=performance.now();
 try {
  const response=await fetch(`${base}/rest/v1/${call.path}`,{method:call.method||'GET',headers:{apikey:key,Authorization:`Bearer ${call.token||key}`,'Content-Type':'application/json'},...(call.method?{body:'{}'}:{}),signal:AbortSignal.timeout(15000)});
  const body=await response.arrayBuffer(); return {ms:performance.now()-start,status:response.status,bytes:body.byteLength};
 } catch(error) {return {ms:performance.now()-start,status:0,bytes:0,error:error.cause?.code || error.name};}
};
for(const journey of journeys){
 const warmup=await Promise.all(journey.calls.map(request));
 if(warmup.some(x=>x.status!==200))throw new Error(`Warmup failed for ${journey.name}: ${warmup.map(x=>x.status)}`);
}
const quantile=(a,p)=>a.length?a[Math.min(a.length-1,Math.floor(a.length*p))]:0;
for(const users of levels){
 const start=performance.now(), deadline=start+duration, results=[], completed=[], names={};
 await Promise.all(Array.from({length:users},async(_,index)=>{
  let turn=index;
  while(performance.now()<deadline){
   const journey=journeys[turn++%journeys.length], began=performance.now();
   const calls=await Promise.all(journey.calls.map(request)); results.push(...calls);completed.push(performance.now()-began);
   const state=names[journey.name]??={journeys:0,errors:0};state.journeys++;state.errors+=Number(calls.some(x=>x.status!==200));
   await pause(1000);
  }
 }));
 const elapsed=(performance.now()-start)/1000, times=results.map(x=>x.ms).sort((a,b)=>a-b), journeyTimes=completed.sort((a,b)=>a-b);
 const errors=results.filter(x=>x.status!==200).length,statuses={};for(const r of results)statuses[r.status]=(statuses[r.status]||0)+1;
 const record={users,activeSeconds:duration/1000,elapsedSeconds:elapsed,requests:results.length,rps:results.length/elapsed,p50:quantile(times,.5),p95:quantile(times,.95),journeyP95:quantile(journeyTimes,.95),errors,errorPercent:100*errors/results.length,statuses,errorTypes:results.filter(x=>x.error).reduce((all,x)=>({...all,[x.error]:(all[x.error]||0)+1}),{}),journeys:names};
 fs.appendFileSync(output,JSON.stringify(record)+'\n');console.log(JSON.stringify(record));
 if(record.errorPercent>5){console.log('Stopped: errors exceeded 5%.');break;}
 await pause(3000);
}
