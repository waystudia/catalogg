import json,subprocess,time,threading,pathlib,datetime,os,argparse
parser=argparse.ArgumentParser();parser.add_argument('--seconds',type=int,default=1200);parser.add_argument('--stop-file',default='/tmp/wayyaam-load-monitor-stop-20261030');args=parser.parse_args();end=time.monotonic()+args.seconds
stop=pathlib.Path(args.stop_file)
lock=threading.Lock()
def emit(x):
 x['at']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 with lock: print(json.dumps(x),flush=True)
def sql(q):
 return subprocess.check_output(['docker','exec','supabase-db','psql','-U','postgres','-d','postgres','-Atc',q],text=True,timeout=15).strip()
def snapshot(label):
 q="select coalesce(json_agg(s),'[]') from (select userid::text,queryid::text,calls,total_exec_time,total_plan_time,rows,shared_blks_hit,shared_blks_read,temp_blks_written,left(query,1800) query from pg_stat_statements where dbid=(select oid from pg_database where datname='postgres')) s"
 emit({'kind':'pg-statements','label':label,'data':json.loads(sql(q))})
def containers():
 ids=subprocess.check_output(['docker','ps','--format','{{.ID}} {{.Names}}','--no-trunc'],text=True)
 items=[];old={}
 for line in ids.splitlines():
  ident,name=line.split();base=pathlib.Path('/sys/fs/cgroup/system.slice/docker-'+ident+'.scope')
  if base.exists():items.append((name,base))
 while time.monotonic()<end and not stop.exists():
  for name,base in items:
   try:
    values=dict(x.split() for x in (base/'cpu.stat').read_text().splitlines());usage=int(values['usage_usec']);now=time.monotonic()
    if name in old:
     last,then=old[name];emit({'kind':'container','data':{'Name':name,'CPUPerc':str((usage-last)/(now-then)/10000)+'%','memoryBytes':int((base/'memory.current').read_text())}})
    old[name]=(usage,now)
   except FileNotFoundError:pass
  time.sleep(2)
def cpu():return list(map(int,pathlib.Path('/proc/stat').read_text().splitlines()[0].split()[1:]))
snapshot('before')
threading.Thread(target=containers,daemon=True).start()
a=cpu(); oldswap={};tick=0
while time.monotonic()<end and not stop.exists():
 time.sleep(2);b=cpu();d=[y-x for x,y in zip(a,b)];a=b
 total=sum(d[:8]); mem={k:int(v.split()[0]) for k,v in (line.split(':',1) for line in pathlib.Path('/proc/meminfo').read_text().splitlines())}
 vm=dict(line.split() for line in pathlib.Path('/proc/vmstat').read_text().splitlines());sw={k:int(vm[k]) for k in ['pswpin','pswpout']}
 emit({'kind':'host','cpuBusy':100*(1-(d[3]+d[4])/total),'cpuWait':100*d[4]/total,'cpuSteal':100*d[7]/total,'memAvailableMiB':mem['MemAvailable']/1024,'swapUsedMiB':(mem['SwapTotal']-mem['SwapFree'])/1024,'swapInPages':sw['pswpin']-oldswap.get('pswpin',sw['pswpin']),'swapOutPages':sw['pswpout']-oldswap.get('pswpout',sw['pswpout']),'load':pathlib.Path('/proc/loadavg').read_text().strip()});oldswap=sw;tick+=1
 if tick%3==0:
  q="select json_build_object('active',(select count(*) from pg_stat_activity where state='active' and pid<>pg_backend_pid()),'connections',(select count(*) from pg_stat_activity),'waits',(select coalesce(json_agg(t),'[]') from (select wait_event_type,wait_event,count(*) n from pg_stat_activity where state='active' and pid<>pg_backend_pid() group by 1,2)t))"
  try:emit({'kind':'pg-activity','data':json.loads(sql(q))})
  except Exception as e:emit({'kind':'monitor-error','message':type(e).__name__})
snapshot('after')
