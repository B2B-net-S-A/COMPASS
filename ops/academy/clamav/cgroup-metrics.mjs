import {execFile} from 'node:child_process';
import {readFile,appendFile} from 'node:fs/promises';
import {promisify} from 'node:util';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const run=promisify(execFile);
const root='/sys/fs/cgroup';
const integer=value=>{if(!/^\d+$/.test(value))throw new Error('invalid_cgroup_metric');const n=Number(value);if(!Number.isSafeInteger(n))throw new Error('invalid_cgroup_metric');return n;};

export function parseInspect(raw){
 const fields=raw.trim().split(' ');
 if(fields.length!==7||!/^\w{64}$/.test(fields[0])||fields[2]!=='true')throw new Error('container_not_running');
 const [id,pid,,memory,memorySwap,restarts,pids]=fields;
 const value={id,pid:integer(pid),memory:integer(memory),memorySwap:integer(memorySwap),restarts:integer(restarts),pids:integer(pids)};
 if(!value.pid||!value.memory||value.memorySwap!==value.memory||value.restarts||value.pids<1)throw new Error('container_limits_invalid');
 return value;
}

export function cgroupDirectory(membership,id){
 const matches=membership.trim().split('\n').filter(line=>line.startsWith('0::'));
 if(matches.length!==1)throw new Error('cgroup_v2_required');
 const relative=matches[0].slice(3);
 if(!relative.startsWith('/')||relative.split('/').includes('..')||!relative.includes(id))throw new Error('unexpected_cgroup');
 const directory=resolve(root,`.${relative}`);
 if(!directory.startsWith(root+sep))throw new Error('unexpected_cgroup');
 return directory;
}

export function parseCounters(raw,required){
 const result={};
 for(const line of raw.trim().split('\n')){
  const parts=line.trim().split(/\s+/);
  if(parts.length!==2||Object.hasOwn(result,parts[0]))throw new Error('invalid_cgroup_metric');
  result[parts[0]]=integer(parts[1]);
 }
 for(const key of required)if(!Object.hasOwn(result,key))throw new Error('missing_cgroup_metric');
 return result;
}

export function evaluateMetrics({phase,inspect,metrics}){
 const peak=integer(metrics.peak.trim()),max=integer(metrics.max.trim()),swap=integer(metrics.swap.trim());
 const events=parseCounters(metrics.events,['oom','oom_kill']);
 const cpu=parseCounters(metrics.cpu,['usage_usec']);
 if(max!==inspect.memory||!peak||peak>max||swap||events.oom||events.oom_kill)throw new Error('scanner_capacity_gate_failed');
 return {phase,memoryPeakBytes:peak,memoryMaxBytes:max,memoryPeakPercent:Math.round(peak/max*1000)/10,swapBytes:swap,oom:events.oom,oomKill:events.oom_kill,cpuUsageUsec:cpu.usage_usec};
}

export async function measure(container,phase){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_ENVIRONMENT!=='github-hosted')throw new Error('hosted_ci_required');
 if(!['academy-clamav-gate','academy-clamav-update'].includes(container)||!['update','baseline','limits'].includes(phase))throw new Error('unexpected_container');
 const {stdout}=await run('docker',['inspect','--format','{{.Id}} {{.State.Pid}} {{.State.Running}} {{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{.RestartCount}} {{.HostConfig.PidsLimit}}',container],{timeout:10000,maxBuffer:1024});
 const inspect=parseInspect(stdout);
 const membership=await readFile(`/proc/${inspect.pid}/cgroup`,'utf8');
 const directory=cgroupDirectory(membership,inspect.id);
 const [peak,max,swap,events,cpu]=await Promise.all(['memory.peak','memory.max','memory.swap.current','memory.events','cpu.stat'].map(file=>readFile(join(directory,file),'utf8')));
 return evaluateMetrics({phase,inspect,metrics:{peak,max,swap,events,cpu}});
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const report=await measure(process.argv[2],process.argv[3]);
  process.stdout.write(JSON.stringify(report)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`\nClamAV ${report.phase}: peak ${report.memoryPeakBytes}/${report.memoryMaxBytes} bytes (${report.memoryPeakPercent}%), swap ${report.swapBytes}, OOM ${report.oom}, OOM kills ${report.oomKill}, CPU ${report.cpuUsageUsec} usec.\n`);
 }catch(error){process.stderr.write(`ClamAV cgroup gate failed: ${error instanceof Error?error.message:'unknown'}\n`);process.exitCode=1;}
}
