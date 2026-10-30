"""Compare visibility for every existing actor before/after a migration, then ROLLBACK."""
import json,pathlib,subprocess,sys
SSH=['ssh','-i',str(pathlib.Path.home()/'.ssh/codex_wayyaam_deploy_20260806'),'-o','ConnectTimeout=12','root@155.212.210.45']
def run(sql):
 return subprocess.run(SSH+['docker exec -i supabase-db psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -At'],input=sql,text=True,capture_output=True,check=True).stdout
actors=json.loads(run("select json_agg(id) from auth.users;"));tables=['catalogs','categories','products','product_images','tags','bookable_resources','catalog_sections','catalog_theme_settings','product_option_groups','product_options']
q=["begin; create temp table access_before(actor text, relation text, digest text); grant all on access_before to anon,authenticated;"]
for phase in ['before','after']:
 for actor in [None]+actors:
  role='authenticated' if actor else 'anon';claims={'role':role,**({'sub':actor} if actor else {})}
  q+=['reset role;',f"set local role {role};",f"select set_config('request.jwt.claims','{json.dumps(claims)}',true);"]
  for table in tables:
   key='catalog_id' if table=='catalog_theme_settings' else 'id'
   # Access is compared by row identity; concurrent edits to descriptions do not invalidate the audit.
   digest=f"(select md5(coalesce(string_agg({key}::text,',' order by {key}::text),'')) from public.{table})"
   if phase=='before':q.append(f"insert into access_before values ('{actor}','{table}',{digest});")
   else:q.append(f"do $check$ begin if {digest} is distinct from (select digest from access_before where actor='{actor}' and relation='{table}') then raise exception 'visibility changed: {table} actor {actor}'; end if; end $check$;")
 q.append('reset role;')
 if phase=='before':q.append(pathlib.Path(sys.argv[1]).read_text())
q+=['rollback;']
try:run('\n'.join(q))
except subprocess.CalledProcessError as e:print(e.stderr,file=sys.stderr);sys.exit(1)
print(f'PASS: {len(actors)+1} actors x {len(tables)} relations, identical visibility; migration rolled back')
