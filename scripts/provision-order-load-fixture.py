"""Run on the WayYaam VPS. Creates only explicitly marked, isolated test fixtures.
Prints private credentials: redirect stdout into a mode-0600 file, never CI logs.
"""
import argparse,base64,hashlib,hmac,json,os,pathlib,secrets,subprocess,time,urllib.request,uuid
p=argparse.ArgumentParser();p.add_argument('--clients',type=int,default=10);p.add_argument('--apply',action='store_true');a=p.parse_args()
if not a.apply or not 1<=a.clients<=300:raise SystemExit('Requires --apply and 1..300 clients')
STORE=pathlib.Path('/root/wayyaam-order-load-20261030.json');state=json.loads(STORE.read_text()) if STORE.exists() else {'actors':{}}
def sql(s):
 return subprocess.check_output(['docker','exec','-i','supabase-db','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-At'],input=s.encode()).decode().strip()
def quote(x):return "'"+str(x).replace("'","''")+"'"
def ident(x):return str(uuid.uuid5(uuid.NAMESPACE_URL,'wayyaam-load-20261030/'+x))
envs=json.loads(subprocess.check_output(['docker','inspect','supabase-storage']))[0]['Config']['Env'];secret=next(x.split('=',1)[1] for x in envs if x.startswith('AUTH_JWT_SECRET='))
def jwt(role,sub=None,email=None):
 def enc(x):return base64.urlsafe_b64encode(json.dumps(x,separators=(',',':')).encode()).rstrip(b'=')
 body={'role':role,'aud':'authenticated','iss':'supabase','iat':int(time.time()),'exp':int(time.time())+900}
 if sub:body.update(sub=sub,email=email)
 raw=enc({'alg':'HS256','typ':'JWT'})+b'.'+enc(body)
 return (raw+b'.'+base64.urlsafe_b64encode(hmac.new(secret.encode(),raw,hashlib.sha256).digest()).rstrip(b'=')).decode()
service=jwt('service_role')
authip=next(iter(json.loads(subprocess.check_output(['docker','inspect','supabase-auth']))[0]['NetworkSettings']['Networks'].values()))['IPAddress']
def save():
 STORE.write_text(json.dumps(state));STORE.chmod(0o600)
for key in ['restaurant']+[f'driver-{i}' for i in range(1,6)]+[f'client-{i:03}' for i in range(1,a.clients+1)]:
 if key in state['actors']:continue
 email='loadtest-20261030-'+key+'@loadtest.invalid';pw=secrets.token_urlsafe(32)
 found=sql('select id from auth.users where email='+quote(email)+';')
 if found and sql('select raw_app_meta_data->>'+quote('load_test_run')+' from auth.users where id='+quote(found)+';')!='20261030':raise SystemExit('Refusing to reuse an unrelated Auth account')
 if not found:
  req=urllib.request.Request('http://'+authip+':9999/admin/users',data=json.dumps({'email':email,'password':pw,'email_confirm':True,'app_metadata':{'load_test_run':'20261030'}}).encode(),headers={'Authorization':'Bearer '+service,'Content-Type':'application/json'},method='POST')
  with urllib.request.urlopen(req,timeout=20) as r:found=json.load(r)['id']
 n=len(state['actors'])+1
 state['actors'][key]={'authId':found,'userId':ident(key),'password':pw,'email':email,'phone':'700000'+f'{n:05}','clientSession':secrets.token_hex(32)};save()
catalog=ident('catalog');restaurant=ident('restaurant-row');category=ident('category')
existing=sql(f"select count(*) from public.users where id in ({','.join(quote(x['userId']) for x in state['actors'].values())}) and not is_test;")
if existing!='0':raise SystemExit('Refusing to modify a non-test actor')
q=['begin;']
for key,x in state['actors'].items():
 role='driver' if key.startswith('driver') else 'restaurant_admin' if key=='restaurant' else 'client';name='НАГРУЗОЧНЫЙ ТЕСТ '+key
 q+=[f"insert into public.users(id,auth_user_id,name,phone,email,role,is_test) values ({quote(x['userId'])},{quote(x['authId'])},{quote(name)},{quote(x['phone'])},{quote(x['email'])},{quote(role)},true) on conflict (id) do nothing;",f"insert into public.profiles(id,email,full_name,is_test) values ({quote(x['authId'])},{quote(x['email'])},{quote(name)},true) on conflict(id) do update set is_test=true;"]
 if role=='client':
  account=ident('account-'+key);x['accountId']=account
  q+=[f"insert into public.client_accounts(id,auth_user_id,name,phone,phone_normalized,password_hash,is_test) values ({quote(account)},{quote(x['authId'])},{quote(name)},{quote(x['phone'])},{quote(x['phone'])},extensions.crypt({quote(x['password'])},extensions.gen_salt('bf',4)),true) on conflict(id) do nothing;",f"insert into public.client_account_sessions(id,account_id,token_hash,expires_at) values ({quote(ident('session-'+key))},{quote(account)},extensions.digest({quote(x['clientSession'])},'sha256'),now()+interval '2 hours') on conflict(id) do update set expires_at=excluded.expires_at;"]
 if role=='driver':
  x['driverId']=ident('driver-row-'+key)
  q+=[f"insert into public.drivers(id,user_id,name,phone,email,is_test,is_active,is_online,status,city_name,service_settlements,max_active_deliveries,legal_activation_status) values ({quote(x['driverId'])},{quote(x['userId'])},{quote(name)},{quote(x['phone'])},{quote(x['email'])},true,true,true,'online','Грозный',array['Тестовый район WayYaam'],1,'active') on conflict(id) do update set is_online=true,status='online' where public.drivers.is_test;"]
patch={'id':catalog,'slug':'loadtest-20261030','name':'НАГРУЗОЧНЫЙ ТЕСТ — не заказывать','is_test':True,'is_template':False,'status':'published','whatsapp':'','instagram_url':'','logo_url':'','banner_url':'','address':'Тестовая кухня','map_url':''}
q+=[f"insert into public.catalogs select (jsonb_populate_record(null::public.catalogs,to_jsonb(c)||{quote(json.dumps(patch))}::jsonb)).* from public.catalogs c where id='c714eca4-e8b3-4926-a245-01930cd109ee' on conflict(id) do nothing;",f"insert into public.catalog_members(catalog_id,user_id,role) values ({quote(catalog)},{quote(state['actors']['restaurant']['authId'])},'owner') on conflict do nothing;",f"insert into public.categories(id,catalog_id,name,slug) values ({quote(category)},{quote(catalog)},'Тестовые блюда','loadtest') on conflict(id) do nothing;",f"insert into public.restaurants(id,catalog_id,name,slug,is_test,address_line,lat,lng) values ({quote(restaurant)},{quote(catalog)},'НАГРУЗОЧНЫЙ ТЕСТ','loadtest-20261030',true,'Тестовая кухня',43.3178,45.6986) on conflict(id) do nothing;",f"insert into public.restaurant_delivery_settings(catalog_id,enable_orders,enable_delivery,use_own_courier,use_platform_drivers,fallback_to_platform_drivers,qr_required,primary_city,service_settlements,delivery_area_mode) values ({quote(catalog)},true,true,true,false,false,true,'Грозный',array['Тестовый район WayYaam'],'settlements') on conflict(catalog_id) do nothing;"]
x=state['actors']['restaurant']
q.append(f"insert into public.clients(id,owner_user_id,catalog_id,company_name,email,is_test,primary_city,service_settlements) values ({quote(ident('business'))},{quote(x['authId'])},{quote(catalog)},'НАГРУЗОЧНЫЙ ТЕСТ',{quote(x['email'])},true,'Грозный',array['Тестовый район WayYaam']) on conflict(id) do nothing;")
for i in range(10):q.append(f"insert into public.products(id,catalog_id,category_id,title,slug,price,status,is_unlimited,stock_count) values ({quote(ident('product-'+str(i)))},{quote(catalog)},{quote(category)},'Тестовое блюдо {i}','loadtest-{i}',100,'active',true,100000) on conflict(id) do nothing;")
for key,x in state['actors'].items():
 if key.startswith('driver'):q.append(f"insert into public.restaurant_couriers(restaurant_id,driver_id,is_active,courier_type) values ({quote(restaurant)},{quote(x['driverId'])},true,'independent') on conflict do nothing;")
q.append('commit;');sql('\n'.join(q));save()
# Fail closed if any pre-existing identifier was not a test actor.
valid=sql(f"select bool_and(is_test) from public.users where id in ({','.join(quote(x['userId']) for x in state['actors'].values())});")
if valid!='t':raise SystemExit('Fixture isolation verification failed')
result={'catalogId':catalog,'slug':'loadtest-20261030','restaurantId':restaurant,'products':[ident('product-'+str(i)) for i in range(10)],'actors':{}}
for key,x in state['actors'].items():result['actors'][key]={**x,'token':jwt('authenticated',x['authId'],x['email'])}
print(json.dumps(result))
