import {execFile} from 'node:child_process';
import {mkdtemp,writeFile,rm,appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const host='178.104.220.48';
const hostKey='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFrtYvLwQUrw3GhnJs/y0LKt5maZ6qZVWpnb3bL9CRft';
export const allowedRefs=['refs/heads/main','refs/heads/feat/academy-enterprise','refs/heads/fix/academy-proxy-network'];

// Fixed read-only probe. Raw inspect data never leaves the host. No env or logs.
export const proxyProbeSource=String.raw`
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {isIP} from 'node:net';
const execute=promisify(execFile);
const validName=value=>typeof value==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(value);
async function docker(args){return (await execute('docker',['--host','unix:///var/run/docker.sock',...args],{encoding:'utf8',timeout:8000,maxBuffer:65536})).stdout.trim();}
async function memberships(container){
 const data=JSON.parse(await docker(['inspect','--format','{{json .NetworkSettings.Networks}}',container]));
 return Object.entries(data).map(([name,value])=>{if(!validName(name)||!isIP(value.IPAddress))throw new Error('invalid_network');return {name,ip:value.IPAddress};});
}
try{
 const appNetworks=await memberships('compass-app'),proxyNetworks=await memberships('coolify-proxy');
 const labels=JSON.parse(await docker(['inspect','--format','{{json .Config.Labels}}','compass-app']));
 const networkLabel=labels['traefik.docker.network']??null;
 if(networkLabel!==null&&!validName(networkLabel))throw new Error('invalid_network_label');
 const servicePorts=[];
 for(const [key,value]of Object.entries(labels)){
  const match=/^traefik\.http\.services\.([a-zA-Z0-9_.-]{1,128})\.loadbalancer\.server\.port$/.exec(key);
  if(match&&/^[0-9]{1,5}$/.test(value)&&Number(value)>0&&Number(value)<=65535)servicePorts.push({service:match[1],port:Number(value)});
 }
 const names=[...new Set([...appNetworks,...proxyNetworks].map(value=>value.name))];
 if(names.length>30)throw new Error('network_count_limit');
 const networks=[];
 for(const name of names){const internal=await docker(['network','inspect','--format','{{.Internal}}',name]);if(!['true','false'].includes(internal))throw new Error('invalid_network');networks.push({name,internal:internal==='true'});}
 let health={httpStatus:null,status:'unavailable',version:null};
 try{
  const response=await fetch('http://127.0.0.1:10000/api/health',{redirect:'error',signal:AbortSignal.timeout(10000)}),body=await response.json();
  health={httpStatus:response.status,status:['healthy','degraded','unhealthy'].includes(body.status)?body.status:'unknown',version:typeof body.version==='string'&&/^[a-f0-9]{7,40}$/.test(body.version)?body.version:null};
 }catch{}
 process.stdout.write(JSON.stringify({app:{networks:appNetworks,routingNetwork:networkLabel,servicePorts,health},proxy:{networks:proxyNetworks},networks,sharedNetworks:appNetworks.filter(item=>proxyNetworks.some(proxy=>proxy.name===item.name)).map(item=>item.name)})+'\n');
}catch{process.stderr.write('proxy_probe_failed\n');process.exitCode=1;}
`;
function ssh(args,input){
 return new Promise((resolve,reject)=>{
  const child=execFile('ssh',args,{encoding:'utf8',timeout:60000,maxBuffer:16384,env:{PATH:process.env.PATH,LANG:'C'}},(error,stdout)=>error?reject(new Error('proxy_probe_unavailable')):resolve(stdout));
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
export async function collectProxyReadiness({env=process.env,run=ssh}={}){
 const report={operation:'fixed_read_only_proxy_networks',checkedAt:new Date().toISOString(),inspection:'unavailable'};
 if(env.GITHUB_ACTIONS!=='true'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='B2B-net-S-A/COMPASS'||!allowedRefs.includes(env.GITHUB_REF))return {...report,reason:'execution_context_not_allowed'};
 if(env.HETZNER_HOST!==host||env.HETZNER_USER!=='root'||!env.HETZNER_SSH_KEY)return {...report,reason:'ssh_configuration_unavailable'};
 const directory=await mkdtemp(join(tmpdir(),'academy-proxy-probe-'));
 try{
  const key=join(directory,'key'),known=join(directory,'known_hosts');
  await writeFile(key,env.HETZNER_SSH_KEY.trim()+'\n',{mode:0o600});await writeFile(known,`${host} ${hostKey}\n`,{mode:0o600});
  const output=await run(['-i',key,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o',`UserKnownHostsFile=${known}`,'-o','ConnectTimeout=15','-o','LogLevel=ERROR',`root@${host}`,'/opt/compass-academy-node/bin/node --input-type=module'],proxyProbeSource);
  const data=JSON.parse(output);
  if(!data.app||!data.proxy||!Array.isArray(data.networks)||!Array.isArray(data.sharedNetworks))throw new Error('invalid_projection');
  return {...report,inspection:'complete',...data};
 }catch{return {...report,reason:'ssh_or_probe_unavailable'};}
 finally{await rm(directory,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const json=JSON.stringify(await collectProxyReadiness(),null,2);process.stdout.write(json+'\n');
 if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`\n## App/proxy networks (read only)\n\n\`\`\`json\n${json}\n\`\`\`\n`);
}
