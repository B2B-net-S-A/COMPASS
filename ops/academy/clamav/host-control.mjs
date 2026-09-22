import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,lstat} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
import {control,fileStore} from './host-control-core.mjs';
const execute=promisify(execFile),directory=dirname(fileURLToPath(import.meta.url));

export function hostRuntime({run=execute,env=process.env}={}){
 const daemon=join(directory,'compose.daemon.proposal.yml'),updater=join(directory,'compose.update.proposal.yml');
 const runtimeEnv={...env,ACADEMY_CLAMAV_STATE_DIR:env.ACADEMY_CLAMAV_STATE_DIR??'/var/lib/compass-academy',
  ACADEMY_CLAMAV_PRIVATE_NETWORK:env.ACADEMY_CLAMAV_PRIVATE_NETWORK??'compass-academy-private'};
 const command=async(args,timeout=330000)=>{
  try{return await run('docker',['--host','unix:///var/run/docker.sock',...args],{timeout,maxBuffer:65536,encoding:'utf8',env:runtimeEnv});}
  catch{throw new Error('scanner_runtime_failed');}
 };
 const compose=(file,args,timeout)=>command(['compose','-f',file,...args],timeout);
 async function seedContainers(project,service){
  const {stdout}=await command(['ps','--all','--quiet','--filter',`label=com.docker.compose.project=${project}`,'--filter',`label=com.docker.compose.service=${service}`]);
  const ids=stdout.trim().split(/\s+/).filter(Boolean);
  if(ids.some(id=>!/^[a-f0-9]{12,64}$/.test(id)))throw new Error('invalid_container_id');
  return ids;
 }
 async function assertStopped(file,service){
  const {stdout}=await compose(file,['ps','--all','--quiet',service]);
  for(const id of stdout.trim().split(/\s+/).filter(Boolean)){
   if(!/^[a-f0-9]{12,64}$/.test(id))throw new Error('invalid_container_id');
   const {stdout:state}=await command(['inspect','--format','{{json .State}}',id]);
   const parsed=JSON.parse(state);if(parsed.Running||parsed.Paused||parsed.Restarting)throw new Error('scanner_not_stopped');
  }
 }
 return {
  // Seed runs before the app deployment creates its private network. Label-scoped
  // Docker stop/inspect avoids resolving the daemon Compose's external network.
  stopSeedProcesses:async()=>{
   for(const [project,service,seconds]of [['compass-academy-clam-update','freshclam','30'],['compass-academy-clamd','clamd','300']]){
    for(const id of await seedContainers(project,service))await command(['stop','--time',seconds,id]);
    for(const id of await seedContainers(project,service)){
     const {stdout}=await command(['inspect','--format','{{json .State}}',id]);const parsed=JSON.parse(stdout);
     if(parsed.Running||parsed.Paused||parsed.Restarting)throw new Error('scanner_not_stopped');
    }
   }
  },
  stopScanner:()=>compose(daemon,['stop','--timeout','300','clamd']),
  stopUpdater:()=>compose(updater,['stop','--timeout','30','freshclam']),
  assertStopped:async()=>{await assertStopped(updater,'freshclam');await assertStopped(daemon,'clamd');},
  assertUpdaterStopped:()=>assertStopped(updater,'freshclam'),
  // `up` gives this fixed service a stable identity discoverable after a killed
  // client. One-off `run --rm` containers can be missed by a later compose stop.
  update:async()=>{
   await compose(updater,['up','--abort-on-container-exit','--exit-code-from','freshclam','freshclam'],610000);
  },
  startScanner:()=>compose(daemon,['up','--detach','--wait','--wait-timeout','180','clamd'],210000),
  readiness:async()=>{
   const {version}=JSON.parse(await readFile(join(directory,'image-lock.json'),'utf8'));
   const {stdout}=await compose(daemon,['exec','-T','clamd','clamdscan','--config-file=/etc/clamav/health.conf','--version'],15000);
   const match=/^ClamAV (\d+\.\d+\.\d+)\/(\d+)\/([^\r\n]+)\s*$/.exec(stdout);
   const date=match?Date.parse(`${match[3]} UTC`):NaN;
   if(!match||match[1]!==version||!Number.isFinite(date)||date>Date.now()+300000||Date.now()-date>48*3600000)throw new Error('scanner_not_ready');
  },
 };
}

async function main(){
 if(process.platform!=='linux'||process.getuid?.()!==0)throw new Error('linux_host_root_required');
 // The public entry point is host-control.sh, which owns fd 9 under flock.
 // Refuse direct invocation with an absent descriptor; files are root-owned.
 await lstat('/proc/self/fd/9');
 const state='/var/lib/compass-academy-control';
 const chunks=[];let size=0;
 for await(const chunk of process.stdin){size+=chunk.length;if(size>8192)throw new Error('input_too_large');chunks.push(chunk);}
 const raw=Buffer.concat(chunks).toString('utf8').trim(),input=raw?JSON.parse(raw):{};
 const result=await control(process.argv[2],input,{store:fileStore(state),runtime:hostRuntime()});
 process.stdout.write(JSON.stringify(result)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 main().catch(error=>{
  const safe=/^[a-z_]{1,80}$/.test(error.message)?error.message:'host_control_failed';
  process.stderr.write(JSON.stringify({ok:false,error:safe})+'\n');process.exitCode=1;
 });
}
