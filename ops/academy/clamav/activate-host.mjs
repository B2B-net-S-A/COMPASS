import {execFile} from 'node:child_process';
import {readFile,lstat} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {fileStore} from './host-control-core.mjs';
import {hostRuntime} from './host-control.mjs';
const directory=dirname(fileURLToPath(import.meta.url));
export const activationTimers=['compass-academy-materials.timer','compass-academy-sync.timer','compass-academy-clamav-update.timer'];
export function executeActivationCommand(command,args,{input='',timeout=30000,env=process.env}={}){
 return new Promise((resolve,reject)=>{
  const child=execFile(command,args,{encoding:'utf8',timeout,maxBuffer:65536,env},(error,stdout)=>{
   if(error)reject(new Error('activation_command_failed'));else resolve({stdout});
  });
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
export async function activateHost(input,{run=executeActivationCommand,store=fileStore('/var/lib/compass-academy-control'),readiness}={}){
 if(!input||Object.keys(input).join(',')!=='sha'||typeof input.sha!=='string'||!/^[a-f0-9]{40}$/.test(input.sha))throw new Error('invalid_expected_sha');
 if(await store.read())throw new Error('scanner_paused');
 const docker=(args,options)=>run('docker',['--host','unix:///var/run/docker.sock',...args],options);
 const {stdout:rawNetwork}=await docker(['network','inspect','compass-academy-private']);
 const networks=JSON.parse(rawNetwork),network=networks[0];
 if(networks.length!==1||network.Name!=='compass-academy-private'||network.Internal!==true)throw new Error('private_network_not_ready');
 const members=Object.entries(network.Containers??{});
 if(members.length!==2||members.some(([id])=>!/^[a-f0-9]{64}$/.test(id)))throw new Error('private_network_members_invalid');
 const app=members.filter(([,value])=>value.Name==='compass-app');
 if(app.length!==1)throw new Error('private_network_members_invalid');
 const scanner=members.find(([id])=>id!==app[0][0]);
 const {stdout:labels}=await docker(['inspect','--format','{{index .Config.Labels "com.docker.compose.project"}} {{index .Config.Labels "com.docker.compose.service"}}',scanner[0]]);
 if(labels.trim()!=='compass-academy-clamd clamd')throw new Error('private_network_members_invalid');
 for(const [id]of members){
  const {stdout:rawState}=await docker(['inspect','--format','{{json .State}}',id]);const state=JSON.parse(rawState);
  if(!state.Running||state.Paused||state.Restarting)throw new Error('container_not_ready');
 }
 await (readiness??(()=>hostRuntime({run}).readiness()))();
 const appCode=await readFile(join(directory,'activation-app-check.mjs'),'utf8');
 const {stdout:rawApp}=await docker(['exec','--interactive','compass-app','node','--input-type=module','-',input.sha],{input:appCode,timeout:20000});
 const appResult=JSON.parse(rawApp);
 if(appResult.ok!==true||![input.sha,input.sha.slice(0,7)].includes(appResult.version))throw new Error('deployed_sha_not_ready');
 const before=[];
 for(const timer of activationTimers){
  const {stdout}=await run('systemctl',['show',timer,'--property=LoadState,ActiveState,UnitFileState']);
  const state=Object.fromEntries(stdout.trim().split('\n').map(line=>line.split('=')));
  if(state.LoadState!=='loaded'||!['enabled','disabled'].includes(state.UnitFileState)||!['active','inactive','failed'].includes(state.ActiveState))throw new Error('timer_not_ready');
  before.push({timer,enabled:state.UnitFileState==='enabled',active:state.ActiveState==='active'});
 }
 try{
  await run('systemctl',['enable','--now',...activationTimers]);
  for(const [command,expected]of [['is-active','active'],['is-enabled','enabled']]){
   const {stdout}=await run('systemctl',[command,...activationTimers]);
   const states=stdout.trim().split('\n');if(states.length!==3||states.some(state=>state!==expected))throw new Error('timer_activation_not_confirmed');
  }
 }catch{
  // Undo only newly enabled/started timers, retaining any prior active schedules.
  // In-flight workers remain bounded; never kill the updater or public app here.
  try{
   const disable=before.filter(state=>!state.enabled).map(state=>state.timer);
   const stop=before.filter(state=>!state.active).map(state=>state.timer);
   if(disable.length)await run('systemctl',['disable',...disable]);
   if(stop.length)await run('systemctl',['stop',...stop]);
  }catch{throw new Error('activation_failed_rollback_incomplete');}
  throw new Error('timer_activation_failed');
 }
 return {ok:true,op:'activate',sha:input.sha,timers:activationTimers};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.platform!=='linux'||process.getuid?.()!==0||process.argv.length!==2)throw new Error('linux_host_root_required');
  await lstat('/proc/self/fd/9');const chunks=[];let bytes=0;
  for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>1024)throw new Error('input_too_large');chunks.push(chunk);}
  const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));process.stdout.write(JSON.stringify(await activateHost(input))+'\n');
 }catch(error){process.stderr.write(JSON.stringify({ok:false,error:/^[a-z_]{1,80}$/.test(error.message)?error.message:'host_activation_failed'})+'\n');process.exitCode=1;}
}
