import {execFile} from 'node:child_process';
import {mkdtemp,writeFile,rm,appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const host='178.104.220.48';
const hostKey='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFrtYvLwQUrw3GhnJs/y0LKt5maZ6qZVWpnb3bL9CRft';
export const appProbe=String.raw`
${projectHealth.toString()}
try {
 const secret=process.env.CRON_SECRET;
 if(typeof secret!=='string'||!secret.trim()||/[\r\n]/.test(secret))throw new Error('unavailable');
 const response=await fetch('http://127.0.0.1:10000/api/cron/academy-health',{headers:{Authorization:'Bearer '+secret},redirect:'error',signal:AbortSignal.timeout(20000)});
 const body=await response.json();
 // Validate before projecting: dropping malformed evidence would turn a broken
 // endpoint or critical alert into a healthy empty report.
 const report=projectHealth(JSON.stringify(body));
 if(!response.ok&&report.status!=='unhealthy')throw new Error('invalid_http_health');
 process.stdout.write(JSON.stringify(report)+'\n');
}catch{process.stdout.write('{"status":"unhealthy","alerts":[{"code":"health_endpoint_unavailable","severity":"critical"}]}\n');}
`;
export const hostProbe=String.raw`
import {execFile} from 'node:child_process';
import {statfs} from 'node:fs/promises';
import {discoverAcademyApp} from '/opt/compass-academy/app-container.mjs';
function run(command,args,input=''){return new Promise((resolve,reject)=>{const child=execFile(command,args,{encoding:'utf8',timeout:25000,maxBuffer:16384},(error,stdout)=>error?reject(new Error('probe_failed')):resolve(stdout));child.stdin.on('error',()=>{});child.stdin.end(input);});}
try{
 const app=await discoverAcademyApp();
 const report=JSON.parse(await run('docker',['--host','unix:///var/run/docker.sock','exec','--interactive',app.id,'node','--input-type=module','-'],APP_PROBE));
 const timers=['compass-academy-materials.timer','compass-academy-sync.timer','compass-academy-clamav-update.timer'];
 for(const [command,expected]of [['is-active','active'],['is-enabled','enabled']]){
  try{const values=(await run('systemctl',[command,...timers])).trim().split('\n');if(values.length!==3||values.some(v=>v!==expected))throw new Error('timer');}
  catch{report.status='unhealthy';report.alerts.push({code:'scheduler_'+command.replace('-','_'),severity:'critical'});}
 }
 const disk=await statfs('/var/lib/docker');const available=disk.bavail*disk.bsize;
 if(available<5*1024**3||disk.bavail/disk.blocks<0.1){report.status='unhealthy';report.alerts.push({code:'host_disk_low',severity:'critical'});}
 process.stdout.write(JSON.stringify(report)+'\n');
}catch{process.stdout.write('{"status":"unhealthy","alerts":[{"code":"host_probe_unavailable","severity":"critical"}]}\n');}
` .replace('APP_PROBE',JSON.stringify(appProbe));
export function projectHealth(raw){
 const data=JSON.parse(raw);
 if(!data||typeof data!=='object'||Array.isArray(data)||!['healthy','degraded','unhealthy'].includes(data.status)||!Array.isArray(data.alerts)||data.alerts.length>25)throw new Error('invalid_health_report');
 const alerts=data.alerts.map(a=>{if(!a||typeof a!=='object'||Array.isArray(a)||typeof a.code!=='string'||!/^[a-z_]{1,80}$/.test(a.code)||!['warning','critical'].includes(a.severity))throw new Error('invalid_health_report');return {code:a.code,severity:a.severity};});
 const expected=alerts.some(a=>a.severity==='critical')?'unhealthy':alerts.length?'degraded':'healthy';
 if(data.status!==expected)throw new Error('inconsistent_health_report');
 return {status:data.status,alerts};
}
export function watchdogExitCode(report){return report.status==='healthy'?0:1;}
function ssh(args,input){return new Promise((resolve,reject)=>{const child=execFile('ssh',args,{encoding:'utf8',timeout:60000,maxBuffer:32768,env:{PATH:process.env.PATH,LANG:'C'}},(error,stdout)=>error?reject(new Error('watchdog_unavailable')):resolve(stdout));child.stdin.on('error',()=>{});child.stdin.end(input);});}
export async function watchAcademy({env=process.env,run=ssh}={}){
 if(env.GITHUB_ACTIONS!=='true'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='B2B-net-S-A/COMPASS'||env.GITHUB_REF!=='refs/heads/main')throw new Error('execution_context_not_allowed');
 if(env.HETZNER_HOST!==host||env.HETZNER_USER!=='root'||!env.HETZNER_SSH_KEY)throw new Error('ssh_configuration_unavailable');
 const directory=await mkdtemp(join(tmpdir(),'academy-health-'));
 try{
  const key=join(directory,'key'),known=join(directory,'known_hosts');
  await writeFile(key,env.HETZNER_SSH_KEY.trim()+'\n',{mode:0o600});await writeFile(known,`${host} ${hostKey}\n`,{mode:0o600});
  return projectHealth(await run(['-i',key,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o',`UserKnownHostsFile=${known}`,'-o','ConnectTimeout=15','-o','LogLevel=ERROR',`root@${host}`,'/opt/compass-academy-node/bin/node --input-type=module'],hostProbe));
 }finally{await rm(directory,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const report=await watchAcademy();process.stdout.write(JSON.stringify(report)+'\n');
  for(const alert of report.alerts)process.stdout.write(`::${alert.severity==='critical'?'error':'warning'}::Academy: ${alert.code}. Operator techniczny: sprawdz panel Teams i synchronizacja oraz runbook.\n`);
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`\nAcademy operations: **${report.status}**. [Panel](https://compass.dynaminds.pl/admin/learning/integrations). ${report.alerts.map(a=>a.code).join(', ')}\n`);
  // A warning needs an actionable workflow result, not only an annotation.
  if(watchdogExitCode(report))process.exitCode=1;
 }catch{process.stderr.write('::error::Academy health unavailable; operator must inspect the monitor.\n');process.exitCode=1;}
}
