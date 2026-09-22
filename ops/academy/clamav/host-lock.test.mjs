import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const enabled=process.platform==='linux'&&process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_ENVIRONMENT==='github-hosted';
const owner={runId:'123',attempt:'1',sha:'a'.repeat(40)};
owner.nonce=createHash('sha256').update(`${owner.runId}:${owner.attempt}:${owner.sha}`).digest('hex');
const source=new URL('./host-control-core.mjs',import.meta.url).href;
const worker=`import {control,fileStore} from ${JSON.stringify(source)};
import {appendFile} from 'node:fs/promises';
const data=JSON.parse(process.argv[1]);
const runtime=Object.fromEntries(['stopUpdater','stopScanner','assertStopped','assertUpdaterStopped','update','startScanner','readiness'].map(name=>[name,async()=>{
 await appendFile(data.directory+'/events',data.op+':'+name+'\\n');
 if(name==='update'){process.stdout.write('updating\\n');await new Promise(r=>setTimeout(r,data.delay));}
}]));
try{const result=await control(data.op,data.input,{store:fileStore(data.directory),runtime});process.stdout.write(JSON.stringify(result)+'\\n');}
catch(error){process.stderr.write(error.message);process.exitCode=1;}`;
function start(directory,op,input={},delay=0){
 const child=spawn('flock',['--no-fork','--exclusive','--wait','5',join(directory,'control.lock'),process.execPath,'--input-type=module','-e',worker,JSON.stringify({directory,op,input,delay})],{stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';const ready=new Promise((resolve,reject)=>{
  child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.includes('updating\n'))resolve();});
  child.once('error',reject);child.once('exit',()=>{if(!stdout.includes('updating\n'))reject(new Error('updater_did_not_start'));});
 });void ready.catch(()=>{});
 child.stderr.on('data',chunk=>{stderr+=chunk;});
 const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal,stdout,stderr}));});
 return {child,ready,done};
}
test('hosted Linux flock serializes a real updater/pause race without running Docker',{skip:!enabled,timeout:15000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'academy-flock-'));await chmod(directory,0o700);
 try{
  const update=start(directory,'update',{},250);await update.ready;
  const pause=start(directory,'pause',{owner});
  assert.equal((await update.done).code,0);assert.equal((await pause.done).code,0);
  const events=(await readFile(join(directory,'events'),'utf8')).trim().split('\n');
  assert(events.indexOf('pause:stopUpdater')>events.indexOf('update:readiness'));
  const deferred=await start(directory,'update').done;assert.equal(deferred.code,0);assert.match(deferred.stdout,/"deferred":true/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('killed lock holder leaves durable state; next pause acquires the real flock and stops orphan runtime',{skip:!enabled,timeout:15000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'academy-flock-'));await chmod(directory,0o700);
 try{
  const update=start(directory,'update',{},10000);await update.ready;update.child.kill('SIGKILL');await update.done;
  assert.equal(JSON.parse(await readFile(join(directory,'pause.json'),'utf8')).kind,'update');
  assert.equal((await start(directory,'pause',{owner}).done).code,0);
  const marker=JSON.parse(await readFile(join(directory,'pause.json'),'utf8'));assert.equal(marker.kind,'deploy');assert.equal(marker.phase,'paused');
  const events=await readFile(join(directory,'events'),'utf8');assert.match(events,/pause:stopUpdater\npause:stopScanner\npause:assertStopped/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
