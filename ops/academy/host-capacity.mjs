import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const execute = promisify(execFile);
const trustedHost = '178.104.220.48';
// Public host key from the user's existing known_hosts entry; no trust-on-first-use.
const hostKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFrtYvLwQUrw3GhnJs/y0LKt5maZ6qZVWpnb3bL9CRft';
export function parseCapacity(text) {
    const integers=['memoryTotalKiB','memoryAvailableKiB','swapTotalKiB','swapFreeKiB','cpuCount','filesystemTotalKiB','filesystemAvailableKiB','hostUid','nodeMajor','composeMajor','composeMinor','flockAvailable','systemdAvailable','unitShowExitCode'];
    const values={};
    for(const line of text.trim().split('\n')) {
        const [name,number,...extra]=line.split('=');
        if(extra.length || Object.hasOwn(values,name))throw new Error('unknown_capacity_schema');
        if(name==='loadAverage1') {if(!/^\d+(?:\.\d+)?$/.test(number))throw new Error('unknown_capacity_schema');}
        else if(!integers.includes(name)||!/^\d+$/.test(number))throw new Error('unknown_capacity_schema');
        const value=Number(number);if(!Number.isFinite(value)||value<0||value>Number.MAX_SAFE_INTEGER)throw new Error('invalid_capacity');
        values[name]=value;
    }
    if(integers.some(key=>!Object.hasOwn(values,key))||!Object.hasOwn(values,'loadAverage1'))throw new Error('incomplete_capacity');
    if(values.flockAvailable>1||values.systemdAvailable>1||values.nodeMajor>999||values.composeMajor>999||values.composeMinor>999||(values.composeMajor===0&&values.composeMinor!==0)||values.unitShowExitCode>255)throw new Error('invalid_prerequisite');
    if(values.memoryAvailableKiB>values.memoryTotalKiB||values.swapFreeKiB>values.swapTotalKiB||values.filesystemAvailableKiB>values.filesystemTotalKiB||values.cpuCount<1)throw new Error('invalid_capacity');
    return values;
}
export async function collectHostCapacity({env=process.env,run=execute}={}) {
    const report={operation:'fixed_read_only_ssh_capacity',checkedAt:new Date().toISOString(),inspection:'unavailable',capacity:null,scannerPlacement:'not_established',limits:['Point-in-time available memory is not a reserved resource budget or peak-load measurement.','No container limits, process lists, environment, filesystem contents or logs are read.','No scanner is started and no network, grants or host configuration are changed.']};
    if(env.GITHUB_ACTIONS!=='true'||env.RUNNER_ENVIRONMENT!=='github-hosted'||env.GITHUB_REPOSITORY!=='B2B-net-S-A/COMPASS')return {...report,reason:'execution_context_not_allowed'};
    if(!env.HETZNER_HOST||!env.HETZNER_USER||!env.HETZNER_SSH_KEY)return {...report,reason:'existing_ssh_credentials_unavailable'};
    if(env.HETZNER_HOST!==trustedHost||!/^[_a-z][_a-z0-9-]{0,31}$/.test(env.HETZNER_USER))return {...report,reason:'untrusted_ssh_target'};
    const directory=await mkdtemp(join(tmpdir(),'academy-capacity-'));
    try {
        const key=join(directory,'key'),known=join(directory,'known_hosts');
        await writeFile(key,env.HETZNER_SSH_KEY.trim()+'\n',{mode:0o600});
        await writeFile(known,`${trustedHost} ${hostKey}\n`,{mode:0o600});
        const command=await readFile(new URL('./capacity-readonly.sh',import.meta.url),'utf8');
        const {stdout}=await run('ssh',['-i',key,'-o','IdentitiesOnly=yes','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o',`UserKnownHostsFile=${known}`,'-o','ConnectTimeout=15','-o','ConnectionAttempts=1','-o','LogLevel=ERROR',`${env.HETZNER_USER}@${trustedHost}`,command],{timeout:25000,maxBuffer:8192,encoding:'utf8',env:{PATH:process.env.PATH,LANG:'C'}});
        return {...report,inspection:'complete',capacity:parseCapacity(stdout)};
    } catch {return {...report,reason:'ssh_or_probe_unavailable'};}
    finally {await rm(directory,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
    const report=await collectHostCapacity();const json=JSON.stringify(report,null,2);console.log(json);
    if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,`\n## Host capacity (read only)\n\n\`\`\`json\n${json}\n\`\`\`\n`);
}
