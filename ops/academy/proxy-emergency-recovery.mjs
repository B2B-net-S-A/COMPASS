import {execFile} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

// Temporary, exact-incident recovery: two fixed network disconnections and one
// isolated short-lived container to refresh the Docker provider's cached routes.
// Never connect, force, restart, change labels or operate on the proxy/scanner.
export async function recoverProxy({docker,systemctl,health,markerPresent}){
 const resource='w136dv828ofipvjfnxrqi643',privateNetwork='compass-academy-private',defaultNetwork=resource+'_default';
 const expectedSha='d62a21c10732ea2ce3b9710be1cce1338a737e46';
 const fail=code=>{throw new Error(code);};
 const verifyHealth=async()=>{const value=await health();if(value.httpStatus!==200||value.status!=='healthy'||![expectedSha,expectedSha.slice(0,7)].includes(value.version))fail('expected_healthy_revision_required');return value;};
 const names=async container=>Object.keys(JSON.parse(await docker(['inspect','--format','{{json .NetworkSettings.Networks}}',container])));
 if(await markerPresent())fail('pause_marker_present');
 for(const timer of ['compass-academy-materials.timer','compass-academy-sync.timer']){
  if((await systemctl(['show',timer,'--property=ActiveState','--value'])).trim()!=='inactive')fail('workers_must_be_inactive');
 }
 const candidates=(await docker(['ps','--filter','label=com.docker.compose.service=app','--filter','status=running','--format','{{.Names}}'])).trim().split('\n')
  .filter(name=>new RegExp('^app-'+resource+'-[0-9]+$').test(name));
 if(candidates.length!==1)fail('expected_app_not_unique');const app=candidates[0];
 const proxy='coolify-proxy';
 const proxyImage=(await docker(['inspect','--format','{{.Config.Image}}',proxy])).trim();
 if(!/^(?:(?:docker\.io|index\.docker\.io)\/(?:library\/)?)?traefik(?::[a-zA-Z0-9_.-]+)?(?:@sha256:[a-f0-9]{64})?$/.test(proxyImage))fail('expected_traefik_proxy_required');
 const proxyState=JSON.parse(await docker(['inspect','--format','{{json .State}}',proxy]));
 if(!proxyState.Running||proxyState.Paused||proxyState.Restarting)fail('proxy_not_running');
 const label=(await docker(['inspect','--format','{{index .Config.Labels "traefik.docker.network"}}',app])).trim();
 if(label!==''&&label!=='<no value>')fail('routing_label_already_present');
 const appNetworks=await names(app),proxyNetworks=await names(proxy),shared=appNetworks.filter(name=>proxyNetworks.includes(name));
 if(shared.length!==1||shared[0]!==resource)fail('verified_public_network_required');
 const publicOnly=appNetworks.length===1&&appNetworks[0]===resource;
 if(!publicOnly&&JSON.stringify([...appNetworks].sort())!==JSON.stringify([resource,defaultNetwork,privateNetwork].sort()))fail('unexpected_app_networks');
 for(const [network,expected]of [[resource,'false'],[defaultNetwork,'false'],[privateNetwork,'true']]){
  if((await docker(['network','inspect','--format','{{.Internal}}',network])).trim()!==expected)fail('network_classification_changed');
 }
 await verifyHealth();
 const appImage=(await docker(['inspect','--format','{{.Image}}',app])).trim();
 if(!/^sha256:[a-f0-9]{64}$/.test(appImage))fail('immutable_app_image_required');
 const disconnected=[];
 for(const network of publicOnly?[]:[privateNetwork,defaultNetwork]){
  // Recheck application health and durable pause immediately before each mutation.
  if(await markerPresent())fail('pause_marker_present');await verifyHealth();
  await docker(['network','disconnect',network,app]);disconnected.push(network);
  const current=await names(app);
  if(!current.includes(resource)||current.includes(network)||current.some(name=>name!==resource&&!([privateNetwork,defaultNetwork].includes(name)&&!disconnected.includes(name))))fail('post_disconnect_network_verification_failed');
  await verifyHealth();
 }
 if(JSON.stringify(await names(app))!==JSON.stringify([resource]))fail('public_network_not_exclusive');
 if(await markerPresent())fail('pause_marker_present');await verifyHealth();
 // Traefik watches container start/die/health_status, not network-disconnect.
 // Use the verified running app's existing image, without network, writable FS,
 // mounts or supplied environment. Its stdout is deliberately not returned.
 await docker(['run','--rm','--pull=never','--name','compass-proxy-refresh-'+globalThis.crypto.randomUUID(),
  '--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
  '--memory','64m','--memory-swap','64m','--cpus','0.1','--pids-limit','32','--user','65534:65534',
  '--no-healthcheck','--log-driver','none','--label','traefik.enable=false',
  '--entrypoint','/usr/local/bin/node',appImage,'--version']);
 if(JSON.stringify(await names(app))!==JSON.stringify([resource]))fail('public_network_not_exclusive');
 await verifyHealth();
 return {ok:true,operation:'emergency_proxy_network_recovery',app,retainedNetwork:resource,disconnected,providerRefresh:true,version:expectedSha};
}

export const recoverySource=`
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {lstat} from 'node:fs/promises';
const execute=promisify(execFile);
const recoverProxy=${recoverProxy.toString()};
async function command(binary,args){return (await execute(binary,args,{encoding:'utf8',timeout:15000,maxBuffer:65536})).stdout;}
try{
 if(process.platform!=='linux'||process.getuid()!==0)throw new Error('linux_root_required');
 await lstat('/proc/self/fd/9');
 const result=await recoverProxy({
  docker:args=>command('docker',['--host','unix:///var/run/docker.sock',...args]),
  systemctl:args=>command('systemctl',args),
  markerPresent:async()=>{try{await lstat('/var/lib/compass-academy-control/pause.json');return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}},
  health:async()=>{const response=await fetch('http://127.0.0.1:10000/api/health',{redirect:'error',signal:AbortSignal.timeout(10000)});const body=await response.json();return {httpStatus:response.status,status:body.status,version:body.version};},
 });process.stdout.write(JSON.stringify(result)+'\\n');
}catch(error){process.stdout.write(JSON.stringify({ok:false,error:/^[a-z_]{1,80}$/.test(error.message)?error.message:'recovery_command_failed_outcome_requires_inspection'})+'\\n');process.exitCode=1;}
`;
export const recoveryCommand="bash -c 'set -euo pipefail; umask 077; export PATH=/opt/compass-academy-node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin; control=/var/lib/compass-academy-control; [[ $(id -u) = 0 && $(uname -s) = Linux && -d $control && ! -L $control && $(stat -c %u:%a $control) = 0:700 && ! -L $control/control.lock ]]; exec 9>$control/control.lock; flock --exclusive --wait 30 9; exec /opt/compass-academy-node/bin/node --input-type=module'";
function ssh(args,input){return new Promise((resolve,reject)=>{
 const child=execFile('ssh',args,{encoding:'utf8',timeout:180000,maxBuffer:16384,env:{PATH:process.env.PATH,LANG:'C'}},(error,stdout)=>{
  if(error){const failure=new Error('emergency_recovery_failed_verify_current_state');try{const safe=JSON.parse(stdout);if(safe.ok===false&&/^[a-z_]{1,80}$/.test(safe.error))failure.message=safe.error;}catch{}reject(failure);}else resolve(stdout);
 });child.stdin.on('error',()=>{});child.stdin.end(input);
});}
export async function invokeRecovery({env=process.env,run=ssh}={}){
 if(env.GITHUB_ACTIONS!=='true'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='B2B-net-S-A/COMPASS'||env.GITHUB_REF!=='refs/heads/fix/academy-proxy-network'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.RECOVERY_ACTION!=='academy-proxy-recover')throw new Error('recovery_context_denied');
 if(env.HETZNER_HOST!=='178.104.220.48'||env.HETZNER_USER!=='root'||!env.HETZNER_SSH_KEY)throw new Error('recovery_ssh_configuration_denied');
 const directory=await mkdtemp(join(tmpdir(),'academy-proxy-recovery-'));
 try{
  const key=join(directory,'key'),known=join(directory,'known_hosts');
  await writeFile(key,env.HETZNER_SSH_KEY.trim()+'\n',{mode:0o600});await writeFile(known,'178.104.220.48 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFrtYvLwQUrw3GhnJs/y0LKt5maZ6qZVWpnb3bL9CRft\n',{mode:0o600});
  const output=await run(['-i',key,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o',`UserKnownHostsFile=${known}`,'-o','ConnectTimeout=15','-o','LogLevel=ERROR','root@178.104.220.48',recoveryCommand],recoverySource);
  const result=JSON.parse(output);if(result.ok!==true||result.operation!=='emergency_proxy_network_recovery')throw new Error('recovery_not_confirmed');return result;
 }finally{await rm(directory,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{process.stdout.write(JSON.stringify(await invokeRecovery())+'\n');}
 catch(error){process.stderr.write(JSON.stringify({ok:false,error:/^[a-z_]{1,80}$/.test(error.message)?error.message:'emergency_recovery_failed_verify_current_state'})+'\n');process.exitCode=1;}
}
