import {createHash,randomUUID} from 'node:crypto';
import {open,readFile,rename,unlink,lstat} from 'node:fs/promises';
import {join} from 'node:path';

const fail=code=>{throw new Error(code);};
const token=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(value);
export function validateOwner(owner){
 if(!owner||typeof owner!=='object'||Object.keys(owner).sort().join(',')!=='attempt,nonce,runId,sha'
  ||!/^\d{1,30}$/.test(owner.runId)||typeof owner.runId!=='string'
  ||!/^\d{1,10}$/.test(owner.attempt)||typeof owner.attempt!=='string'
  ||typeof owner.sha!=='string'||!/^[a-f0-9]{40}$/.test(owner.sha)
  ||owner.nonce!==createHash('sha256').update(`${owner.runId}:${owner.attempt}:${owner.sha}`).digest('hex'))fail('invalid_owner');
 return owner;
}
function sameOwner(left,right){return ['runId','attempt','sha','nonce'].every(key=>left[key]===right[key]);}
export function validateMarker(value){
 if(!value||value.version!==1||!['deploy','update'].includes(value.kind))fail('invalid_marker');
 if(value.kind==='deploy'){
  validateOwner(value.owner);
  if(!['pausing','paused','resuming'].includes(value.phase)||!Array.isArray(value.triggers)||!Array.isArray(value.deployments)
   ||value.triggers.length>100||value.deployments.length>100)fail('invalid_marker');
  const triggerIds=new Set(),deploymentIds=new Set();
  for(const item of value.deployments){
   if(!token(item.uuid)||deploymentIds.has(item.uuid)||!['pending','finished','failed','cancelled'].includes(item.status))fail('invalid_marker');
   deploymentIds.add(item.uuid);
  }
  for(const item of value.triggers){
   if(!/^[0-9]{1,3}-[0-9]{1,3}$/.test(item.nonce)||triggerIds.has(item.nonce)||!['pending','bound'].includes(item.state))fail('invalid_marker');
   if(item.state==='bound'&&!deploymentIds.has(item.deploymentUuid))fail('invalid_marker');
   triggerIds.add(item.nonce);
  }
 }else if(!token(value.id)||!['stopping','updating','restoring','blocked'].includes(value.phase))fail('invalid_marker');
 return value;
}

/** The CLI holds the host flock for this entire operation. Tests inject a store
 * and runtime; the state machine never invokes Docker, SSH or production APIs.
 */
export async function control(op,input,{store,runtime,now=()=>new Date().toISOString(),id=randomUUID}){
 let marker=await store.read();if(marker)validateMarker(marker);
 const save=async value=>{marker={...value,updatedAt:now()};validateMarker(marker);await store.write(marker);};
 const success=extra=>({ok:true,op,...extra});
 const stopped=async()=>{await runtime.stopUpdater();await runtime.stopScanner();await runtime.assertStopped();};
 if(op==='status')return success({paused:!!marker,kind:marker?.kind??null,phase:marker?.phase??null,owner:marker?.kind==='deploy'?marker.owner:null});
 if(op==='seed'){
  if(marker?.kind==='deploy')fail('seed_blocked_by_deployment');
  await save({version:1,kind:'update',id:marker?.id??id(),phase:'stopping',createdAt:marker?.createdAt??now()});
  try{
   // Does not need the app's future external network or start a daemon.
   await runtime.stopSeedProcesses();await save({...marker,phase:'updating'});await runtime.update();
   await runtime.stopSeedProcesses();await store.remove();return success({scannerStarted:false});
  }catch{
   await runtime.stopSeedProcesses().catch(()=>{});await save({...marker,phase:'blocked'});fail('seed_failed');
  }
 }
 if(op==='update'){
  if(marker?.kind==='deploy')return success({deferred:true});
  await save({version:1,kind:'update',id:marker?.id??id(),phase:'stopping',createdAt:marker?.createdAt??now()});
  let updateError;
  try{
   await stopped();await save({...marker,phase:'updating'});await runtime.update();
  }catch{updateError=new Error('update_failed');}
  try{
   // Killing the docker CLI need not kill its container. Stop it explicitly.
   await runtime.stopUpdater();await runtime.assertUpdaterStopped();
   await save({...marker,phase:'restoring'});await runtime.startScanner();await runtime.readiness();
   await store.remove();
  }catch{
   await runtime.stopScanner().catch(()=>{});await save({...marker,phase:'blocked'});fail('scanner_restore_failed');
  }
  if(updateError)throw updateError;
  return success({deferred:false});
 }
 const owner=validateOwner(input?.owner);
 if(op==='pause'){
  const owned=marker?.kind==='deploy'&&sameOwner(marker.owner,owner);
  if(marker?.kind==='deploy'&&!owned){
   // A failed first build may leave no private network for resume. Permit a
   // fresh run only after every recorded trigger/build has a known outcome.
   if(!['paused','resuming'].includes(marker.phase)||marker.deployments.length===0
    ||marker.deployments.some(d=>d.status==='pending')||marker.triggers.some(t=>t.state==='pending'))fail('pause_owned_by_another_run');
  }
  // An update marker with no flock holder is an interrupted update. Take over
  // durably, then stop its potentially orphaned container before acknowledging.
  await save(owned?{...marker,phase:'pausing'}:
   {version:1,kind:'deploy',owner,phase:'pausing',triggers:[],deployments:[],createdAt:now()});
  await stopped();await save({...marker,phase:'paused'});return success();
 }
 if(marker?.kind!=='deploy'||!sameOwner(marker.owner,owner))fail('pause_owner_mismatch');
 if(op==='resume'){
  if(marker.triggers.some(t=>t.state==='pending'))fail('trigger_outcome_unknown');
  if(marker.deployments.some(d=>d.status==='pending'))fail('deployment_not_terminal');
  if(marker.phase==='pausing')fail('pause_not_acknowledged');
  await save({...marker,phase:'resuming'});
  try{
   await runtime.stopUpdater();await runtime.assertUpdaterStopped();
   await runtime.startScanner();await runtime.readiness();await store.remove();return success();
  }catch{
   await runtime.stopScanner().catch(()=>{});await save({...marker,phase:'paused'});fail('scanner_restore_failed');
  }
 }
 if(marker.phase!=='paused')fail('pause_not_acknowledged');
 if(op==='terminal'){
  if(!token(input.deploymentUuid)||!['finished','failed','cancelled'].includes(input.status))fail('invalid_terminal');
  const deployment=marker.deployments.find(d=>d.uuid===input.deploymentUuid);
  if(!deployment)fail('deployment_not_bound');
  if(deployment.status!=='pending'&&deployment.status!==input.status)fail('terminal_status_conflict');
  deployment.status=input.status;await save(marker);return success();
 }
 if(!/^[0-9]{1,3}-[0-9]{1,3}$/.test(input.triggerNonce??''))fail('invalid_trigger_nonce');
 const trigger=marker.triggers.find(t=>t.nonce===input.triggerNonce);
 if(op==='begin-trigger'){
  if(marker.triggers.some(t=>t.state==='pending'))fail('trigger_outcome_unknown');
  if(marker.deployments.some(d=>d.status==='pending'))fail('deployment_not_terminal');
  if(trigger)fail('trigger_nonce_reused');
  if(marker.triggers.length>=100)fail('trigger_limit');
  await stopped();
  marker.triggers.push({nonce:input.triggerNonce,state:'pending'});await save(marker);return success();
 }
 if(!trigger)fail('trigger_not_started');
 if(op==='bind'){
  if(!token(input.deploymentUuid)
   ||(trigger.state==='bound'&&trigger.deploymentUuid!==input.deploymentUuid))fail('deployment_bind_conflict');
  trigger.state='bound';trigger.deploymentUuid=input.deploymentUuid;
  if(!marker.deployments.some(d=>d.uuid===input.deploymentUuid))marker.deployments.push({uuid:input.deploymentUuid,status:'pending'});
  await save(marker);return success();
 }
 fail('invalid_operation');
}

export function fileStore(directory){
 const file=join(directory,'pause.json');
 async function checkDirectory(){
  const stat=await lstat(directory);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0)fail('unsafe_control_directory');
  if(typeof process.getuid==='function'&&stat.uid!==process.getuid())fail('unsafe_control_owner');
 }
 async function syncDirectory(){const handle=await open(directory,'r');try{await handle.sync();}finally{await handle.close();}}
 return {
  async read(){
   await checkDirectory();
   try{
    const stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>65536||(stat.mode&0o077)!==0)fail('unsafe_marker');
    return validateMarker(JSON.parse(await readFile(file,'utf8')));
   }catch(error){if(error.code==='ENOENT')return null;throw error;}
  },
  async write(value){
   await checkDirectory();validateMarker(value);
   const temporary=join(directory,`.pause-${randomUUID()}.tmp`);const handle=await open(temporary,'wx',0o600);
   try{await handle.writeFile(JSON.stringify(value)+'\n');await handle.sync();}finally{await handle.close();}
   await rename(temporary,file);await syncDirectory();
  },
  async remove(){await checkDirectory();await unlink(file);await syncDirectory();},
 };
}
