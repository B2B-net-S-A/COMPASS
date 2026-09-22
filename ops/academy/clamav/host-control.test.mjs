import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm,readFile,writeFile,chmod,symlink,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {control,fileStore} from './host-control-core.mjs';
import {hostRuntime} from './host-control.mjs';

function owner(runId='123',attempt='1'){
 const sha='a'.repeat(40);return {runId,attempt,sha,nonce:createHash('sha256').update(`${runId}:${attempt}:${sha}`).digest('hex')};
}
function fixture(){
 let marker=null;const calls=[],failing=new Set();
 const store={read:async()=>structuredClone(marker),write:async v=>{marker=structuredClone(v);calls.push('persist:'+v.phase);},remove:async()=>{marker=null;calls.push('remove');}};
 const runtime=Object.fromEntries(['stopUpdater','stopScanner','assertStopped','assertUpdaterStopped','update','startScanner','readiness'].map(name=>[name,async()=>{calls.push(name);if(failing.has(name))throw new Error('synthetic_failure');}]));
 return {call:(op,input={})=>control(op,input,{store,runtime}),marker:()=>marker,calls,failing};
}
async function bound(f,who=owner(),triggerNonce='1-1',deploymentUuid='deploy-one'){
 await f.call('begin-trigger',{owner:who,triggerNonce});await f.call('bind',{owner:who,triggerNonce,deploymentUuid});
}

test('pause persists before stopping both processes, retries safely and compares the complete owner',async()=>{
 const f=fixture(),who=owner();await f.call('pause',{owner:who});
 assert.deepEqual(f.calls,['persist:pausing','stopUpdater','stopScanner','assertStopped','persist:paused']);
 const before=structuredClone(f.marker());await assert.rejects(f.call('pause',{owner:owner('124')}),/another_run/);
 assert.deepEqual(f.marker(),before);await f.call('pause',{owner:who});assert.equal(f.marker().phase,'paused');
 await assert.rejects(f.call('pause',{owner:{...who,nonce:'b'.repeat(64)}}),/invalid_owner/);
 f.failing.add('assertStopped');await assert.rejects(f.call('pause',{owner:who}));assert.equal(f.marker().phase,'pausing');
 await assert.rejects(f.call('begin-trigger',{owner:who,triggerNonce:'1-1'}),/not_acknowledged/);
});
test('unknown trigger, including HTTP 429, blocks resume and retries until an actual deployment is reconciled',async()=>{
 const f=fixture(),who=owner();await f.call('pause',{owner:who});await f.call('begin-trigger',{owner:who,triggerNonce:'1-1'});
 for(const nonce of ['1-1','1-2'])await assert.rejects(f.call('begin-trigger',{owner:who,triggerNonce:nonce}),/outcome_unknown/);
 await assert.rejects(f.call('resume',{owner:who}),/outcome_unknown/);
 // No mutation follows HTTP429: it can mean another build is still running.
 assert.equal(f.marker().triggers[0].state,'pending');
 await f.call('bind',{owner:who,triggerNonce:'1-1',deploymentUuid:'queue-build'});
 await f.call('terminal',{owner:who,deploymentUuid:'queue-build',status:'failed'});
 await bound(f,who,'1-2');assert.equal(f.marker().triggers[1].state,'bound');
 await assert.rejects(f.call('bind',{owner:who,triggerNonce:'1-1',deploymentUuid:'later'}),/bind_conflict/);
});
test('UUID binding is CAS and all deployment attempts must be terminal before resume',async()=>{
 const f=fixture(),who=owner();await f.call('pause',{owner:who});await bound(f);
 await f.call('bind',{owner:who,triggerNonce:'1-1',deploymentUuid:'deploy-one'});
 await assert.rejects(f.call('bind',{owner:who,triggerNonce:'1-1',deploymentUuid:'wrong'}),/bind_conflict/);
 await assert.rejects(f.call('resume',{owner:who}),/not_terminal/);
 await assert.rejects(f.call('begin-trigger',{owner:who,triggerNonce:'2-1'}),/not_terminal/);
 await f.call('terminal',{owner:who,deploymentUuid:'deploy-one',status:'failed'});
 await bound(f,who,'2-1','deploy-two');await assert.rejects(f.call('resume',{owner:who}),/not_terminal/);
 await f.call('terminal',{owner:who,deploymentUuid:'deploy-two',status:'finished'});
 await assert.rejects(f.call('terminal',{owner:who,deploymentUuid:'deploy-one',status:'finished'}),/status_conflict/);
 await f.call('resume',{owner:who});assert.equal(f.marker(),null);
 assert.deepEqual(f.calls.slice(-5),['persist:resuming','stopUpdater','assertUpdaterStopped','startScanner','readiness','remove'].slice(-5));
});
test('stale completion cannot resume a newer run; failed readiness keeps the durable marker and stops the scanner',async()=>{
 const f=fixture(),old=owner(),next=owner('124');await f.call('pause',{owner:old});await f.call('resume',{owner:old});
 await f.call('pause',{owner:next});const before=structuredClone(f.marker());
 await assert.rejects(f.call('resume',{owner:old}),/owner_mismatch/);assert.deepEqual(f.marker(),before);
 f.failing.add('readiness');await assert.rejects(f.call('resume',{owner:next}),/restore_failed/);
 assert.equal(f.marker().phase,'paused');assert.equal(f.calls.at(-2),'stopScanner');
 f.failing.clear();await f.call('resume',{owner:next});assert.equal(f.marker(),null);
});
test('updater defers without touching runtime during deployment; update and restore failures fail closed',async()=>{
 const f=fixture();await f.call('pause',{owner:owner()});f.calls.length=0;
 assert.deepEqual(await f.call('update'),{ok:true,op:'update',deferred:true});assert.deepEqual(f.calls,[]);
 await f.call('resume',{owner:owner()});f.calls.length=0;
 await f.call('update');assert.equal(f.marker(),null);
 assert(f.calls.indexOf('assertStopped')<f.calls.indexOf('update'));
 assert(f.calls.indexOf('assertUpdaterStopped')<f.calls.indexOf('startScanner'));
 f.failing.add('update');await assert.rejects(f.call('update'),/update_failed/);assert.equal(f.marker(),null);
 f.failing.add('readiness');await assert.rejects(f.call('update'),/restore_failed/);assert.equal(f.marker().kind,'update');assert.equal(f.marker().phase,'blocked');
 f.failing.clear();await f.call('pause',{owner:owner('999')});assert.equal(f.marker().kind,'deploy');
});
test('persistent marker survives process/store recreation and rejects corruption or symlinks',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'academy-control-'));await chmod(directory,0o700);
 try{
  const runtime=fixture();const deps={store:fileStore(directory),runtime:Object.fromEntries(['stopUpdater','stopScanner','assertStopped'].map(name=>[name,async()=>{}]))};
  await control('pause',{owner:owner()},deps);
  assert.equal((await fileStore(directory).read()).owner.runId,'123');
  assert.equal((await stat(join(directory,'pause.json'))).mode&0o777,0o600);
  const raw=await readFile(join(directory,'pause.json'),'utf8');
  await writeFile(join(directory,'pause.json'),'broken');await assert.rejects(fileStore(directory).read());
  await writeFile(join(directory,'pause.json'),raw);await fileStore(directory).remove();
  await writeFile(join(directory,'other'),raw);await symlink(join(directory,'other'),join(directory,'pause.json'));
  await assert.rejects(fileStore(directory).read(),/unsafe_marker/);assert.equal(runtime.calls.length,0);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('runtime commands stay on local Docker and fixed scanner services; never stop the public app',async()=>{
 const calls=[];const runtime=hostRuntime({run:async(cmd,args,options)=>{calls.push({cmd,args,options});return{stdout:''};},env:{PATH:'/usr/bin'}});
 await runtime.stopUpdater();await runtime.stopScanner();await runtime.assertStopped();await runtime.update();await runtime.startScanner();
 for(const c of calls){assert.equal(c.cmd,'docker');assert.deepEqual(c.args.slice(0,2),['--host','unix:///var/run/docker.sock']);assert(!c.args.includes('app'));}
 assert(calls.some(c=>c.args.includes('--exit-code-from')&&c.args.at(-1)==='freshclam'));
 assert(!calls.some(c=>c.args.includes('run')));assert.equal(calls[0].options.env.ACADEMY_CLAMAV_STATE_DIR,'/var/lib/compass-academy');
});
test('runtime detects orphaned or paused containers and rejects stale loaded signatures',async()=>{
 const runtime=hostRuntime({run:async(_cmd,args)=>({stdout:args.includes('ps')?'a'.repeat(64):JSON.stringify({Running:false,Paused:true,Restarting:false})})});
 await assert.rejects(runtime.assertUpdaterStopped(),/not_stopped/);
 for(const version of ['ClamAV 1.4.6','ClamAV 1.4.6/123/Tue Jan 01 00:00:00 2000']){
  await assert.rejects(hostRuntime({run:async()=>({stdout:version})}).readiness(),/not_ready/);
 }
 const now=new Date().toUTCString().replace(/^[^,]+, /,'').replace(/ GMT$/,'');
 await hostRuntime({run:async()=>({stdout:`ClamAV 1.4.6/123/${now}\n`})}).readiness();
});
