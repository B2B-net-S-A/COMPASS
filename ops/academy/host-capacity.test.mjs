import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { collectHostCapacity, parseCapacity } from './host-capacity.mjs';
const output='memoryTotalKiB=4096000\nmemoryAvailableKiB=1500000\nswapTotalKiB=0\nswapFreeKiB=0\ncpuCount=2\nloadAverage1=0.50\nfilesystemTotalKiB=40000000\nfilesystemAvailableKiB=20000000\nhostUid=0\nnodeMajor=22\nflockAvailable=1\nsystemdAvailable=1\n';
const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'B2B-net-S-A/COMPASS',HETZNER_HOST:'178.104.220.48',HETZNER_USER:'root',HETZNER_SSH_KEY:'PRIVATE_KEY_SENTINEL'};
test('capacity projection accepts only complete numeric counters',()=>{
 assert.equal(parseCapacity(output).memoryAvailableKiB,1500000);
 assert.equal(parseCapacity(output).nodeMajor,22);
 assert.throws(()=>parseCapacity(output.replace('flockAvailable=1','flockAvailable=2')));
 for(const invalid of [output+'secret=value\n',output.replace('cpuCount=2\n',''),output+'cpuCount=3\n',output.replace('1500000','9999999')])assert.throws(()=>parseCapacity(invalid));
});
test('fixed host-key verified SSH command reads only capacity and never emits key or target',async()=>{
 let seen=false,keyPath;
 const report=await collectHostCapacity({env,run:async(binary,args,options)=>{
  seen=true;assert.equal(binary,'ssh');assert(args.includes('StrictHostKeyChecking=yes'));assert(args.includes('BatchMode=yes'));assert(args.includes('IdentitiesOnly=yes'));
  assert(!args.includes('StrictHostKeyChecking=no'));assert.equal(options.timeout,25000);assert.equal(options.maxBuffer,8192);assert.equal(options.env.HETZNER_SSH_KEY,undefined);
  keyPath=args[1];assert.equal(await readFile(keyPath,'utf8'),env.HETZNER_SSH_KEY+'\n');
  const known=args.find(arg=>arg.startsWith('UserKnownHostsFile=')).split('=')[1];assert.match(await readFile(known,'utf8'),/^178\.104\.220\.48 ssh-ed25519 /);
  const command=args.at(-1);assert.match(command,/\/proc\/meminfo/);assert.match(command,/df -Pk/);assert(!/docker |sudo |printenv|\.env|curl |wget /.test(command));
  return {stdout:output};
 }});
 assert(seen);assert.equal(report.inspection,'complete');assert.equal(report.scannerPlacement,'not_established');
 assert(!JSON.stringify(report).includes(env.HETZNER_SSH_KEY));assert(!JSON.stringify(report).includes(env.HETZNER_HOST));await assert.rejects(readFile(keyPath));
});
test('credentials remain unused outside the reviewed hosted origin context and known host',async()=>{
 for(const overrides of [{GITHUB_ACTIONS:'false'},{RUNNER_ENVIRONMENT:'self-hosted'},{GITHUB_REPOSITORY:'attacker/repo'},{HETZNER_HOST:'attacker.test'},{HETZNER_USER:'root -oProxyCommand=bad'},{HETZNER_SSH_KEY:''}]){
  const result=await collectHostCapacity({env:{...env,...overrides},run:()=>assert.fail('SSH must not be attempted')});assert.equal(result.inspection,'unavailable');
 }
});
test('SSH failures and malformed output do not leak raw diagnostics',async()=>{
 for(const run of [async()=>{throw new Error('PRIVATE_KEY_SENTINEL host-specific failure');},async()=>({stdout:'secret=PRIVATE_KEY_SENTINEL'})]){
  const report=await collectHostCapacity({env,run});assert.equal(report.reason,'ssh_or_probe_unavailable');assert(!JSON.stringify(report).includes('PRIVATE_KEY_SENTINEL'));
 }
});
