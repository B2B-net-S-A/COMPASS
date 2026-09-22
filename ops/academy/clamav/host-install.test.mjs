import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat,mkdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {installHostFiles,runtimeFiles,unitFiles} from './install-host.mjs';
import {requestWorker} from './worker-request.mjs';
const text=name=>readFile(new URL(name,import.meta.url),'utf8');
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'academy-install-')),calls=[];
 const run=async(command,args)=>{
  calls.push([command,args]);assert.equal(command,'systemctl');
  if(args[0]==='show')return {stdout:'LoadState=not-found\nActiveState=inactive\nUnitFileState=\n'};
  assert.deepEqual(args,['daemon-reload']);return {stdout:''};
 };
 return {root,calls,options:{root,run,rootUid:process.getuid(),rootGid:process.getgid(),engineUid:process.getuid(),engineGid:process.getgid()},close:()=>rm(root,{recursive:true,force:true})};
}
test('installs exact manifest and inactive units; repeat install preserves pause/signatures',async()=>{
 const f=await fixture();try{
  assert.deepEqual(await installHostFiles(f.options),{ok:true,installed:runtimeFiles.length+unitFiles.length,activated:false});
  const target=join(f.root,'opt/compass-academy'),control=join(f.root,'var/lib/compass-academy-control');
  for(const name of runtimeFiles){assert.equal(await readFile(join(target,name),'utf8'),await text(name));assert.equal((await stat(join(target,name))).mode&0o777,name.endsWith('.sh')?0o755:0o644);}
  assert.equal((await stat(control)).mode&0o777,0o700);
  const marker=JSON.stringify({kind:'deploy',phase:'triggering',owner:'preserved'});
  await writeFile(join(control,'pause.json'),marker,{mode:0o600});
  await writeFile(join(f.root,'var/lib/compass-academy/signatures/daily.cvd'),'existing signed DB');
  await installHostFiles(f.options);
  assert.equal(await readFile(join(control,'pause.json'),'utf8'),marker);
  assert.equal(await readFile(join(f.root,'var/lib/compass-academy/signatures/daily.cvd'),'utf8'),'existing signed DB');
  const report=JSON.parse(await readFile(join(target,'installed-files.json'),'utf8'));assert.equal(report.activated,false);
  assert(report.files.every(file=>/^[a-f0-9]{64}$/.test(file.sha256)));
  assert(f.calls.every(([command,args])=>command==='systemctl'&&['show','daemon-reload'].includes(args[0])));
 }finally{await f.close();}
});
test('refuses active or enabled schedules and fails closed on an unavailable systemd',async()=>{
 for(const properties of ['LoadState=loaded\nActiveState=active\nUnitFileState=disabled','LoadState=loaded\nActiveState=inactive\nUnitFileState=enabled']){
  const f=await fixture();try{await assert.rejects(installHostFiles({...f.options,run:async()=>({stdout:properties})}),/schedulers_before_install/);}
  finally{await f.close();}
 }
 const f=await fixture();try{await assert.rejects(installHostFiles({...f.options,run:async()=>{throw new Error('systemd unavailable');}}),/systemd_unit_inspection_failed/);}
 finally{await f.close();}
});
test('nonzero systemctl show accepts only explicit inactive missing units, never bus errors',async()=>{
 for(const code of [1,4]){
  const f=await fixture();try{
   const result=await installHostFiles({...f.options,run:async(command,args)=>{
    if(args[0]==='show')throw Object.assign(new Error('unit missing'),{code,stdout:'LoadState=not-found\nActiveState=inactive\nUnitFileState=\n'});
    return f.options.run(command,args);
   }});assert.equal(result.activated,false);
  }finally{await f.close();}
 }
 for(const stdout of ['', 'LoadState=unknown\nActiveState=inactive\n', 'LoadState=not-found\nActiveState=active\n', 'LoadState=not-found\nActiveState=inactive\nUnitFileState=enabled\n']){
  const f=await fixture();try{await assert.rejects(installHostFiles({...f.options,run:async()=>{throw Object.assign(new Error('failed bus or unknown unit'),{code:1,stdout});}}),/systemd_unit_inspection_failed/);}
  finally{await f.close();}
 }
});
test('rejects symlink destinations and parents without overwriting their targets',async()=>{
 const f=await fixture();try{
  await installHostFiles(f.options);const target=join(f.root,'opt/compass-academy/host-control.sh'),sentinel=join(f.root,'sentinel');
  await writeFile(sentinel,'untouched');await rm(target);await symlink(sentinel,target);
  await assert.rejects(installHostFiles(f.options),/unsafe_install_file/);assert.equal(await readFile(sentinel,'utf8'),'untouched');
 }finally{await f.close();}
 const g=await fixture();try{await mkdir(join(g.root,'actual'));await symlink(join(g.root,'actual'),join(g.root,'opt'));
  await assert.rejects(installHostFiles(g.options),/unsafe_install_parent/);
 }finally{await g.close();}
});
test('worker credentials stay within the request, URLs are fixed and redirects fail',async()=>{
 const secret='test-only-secret';const requests=[];
 for(const worker of ['materials','sync']){
  const result=await requestWorker(worker,{env:{CRON_SECRET:secret},fetchRequest:async(url,options)=>{
   requests.push({url,options});return {ok:true,status:200,json:async()=>({ok:true,privateValue:secret})};
  }});
  assert.deepEqual(result,{ok:true,worker,status:200});assert(!JSON.stringify(result).includes(secret));
 }
 assert.deepEqual(requests.map(x=>x.url),['http://127.0.0.1:10000/api/cron/academy-materials','http://127.0.0.1:10000/api/cron/academy-sync']);
 assert(requests.every(({options})=>options.headers.Authorization===`Bearer ${secret}`&&options.redirect==='error'&&options.signal instanceof AbortSignal));
 await assert.rejects(requestWorker('cleanup',{env:{CRON_SECRET:secret}}),/invalid_worker/);
 await assert.rejects(requestWorker('materials',{env:{}}),/cron_secret_missing/);
 assert.equal((await requestWorker('materials',{env:{CRON_SECRET:secret},fetchRequest:async()=>({ok:false,status:503,json:async()=>({ok:true})})})).ok,false);
 assert.equal((await requestWorker('sync',{env:{CRON_SECRET:secret},fetchRequest:async()=>({ok:true,status:200,json:async()=>({ok:false})})})).ok,false);
});
test('host worker uses locks and bounded stdin Node; installer never activates anything',async()=>{
 const worker=await text('worker-host.sh'),installer=await text('install-host.sh');
 assert.match(worker,/flock --exclusive --nonblock 8/);assert.match(worker,/flock --shared --nonblock 9/);assert.match(worker,/pause\.json/);
 assert.match(worker,/timeout --signal=TERM --kill-after=10/);
 assert.match(worker,/docker --host unix:\/\/\/var\/run\/docker\.sock exec --interactive compass-app/);
 assert.match(worker,/node --input-type=module - "\$worker" < \/opt\/compass-academy\/worker-request\.mjs/);
 assert(!/\$\{?CRON_SECRET|--env|-e CRON_SECRET/.test(worker));
 assert.match(installer,/process\.versions\.node/);assert.match(installer,/compose version --short/);
 assert(!/apt|npm install|systemctl (?:start|enable)|docker .* (?:up|pull|run)/.test(installer));
 for(const [name,timeout]of [['materials',350],['sync',230],['clamav-update',1800]]){
  const service=await text(`systemd/compass-academy-${name}.service`),timer=await text(`systemd/compass-academy-${name}.timer`);
  assert.match(service,new RegExp(`TimeoutStartSec=${timeout}\\n`));assert.match(service,/Type=oneshot/);assert.match(service,/NoNewPrivileges=yes/);
  assert(!/EnvironmentFile|CRON_SECRET|Restart=/.test(service));assert(!/\[Install\]/.test(service));
  assert.match(timer,/OnUnitInactiveSec=/);assert(!/Persistent=true/.test(timer));
 }
 assert(unitFiles.every(name=>!name.includes('cleanup')));
});
