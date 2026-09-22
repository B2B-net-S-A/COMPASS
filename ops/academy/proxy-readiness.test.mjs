import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {collectProxyReadiness,proxyProbeSource} from './proxy-readiness.mjs';
const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'B2B-net-S-A/COMPASS',GITHUB_REF:'refs/heads/fix/academy-proxy-network',HETZNER_HOST:'178.104.220.48',HETZNER_USER:'root',HETZNER_SSH_KEY:'TEST_PRIVATE_KEY'};
test('fixed pinned SSH transports only read-only projection source and cleans up its key',async()=>{
 let keyPath;
 const data={app:{networks:[{name:'observed-public',ip:'10.0.0.2'}],routingNetwork:null,servicePorts:[{service:'observed-app',port:10000}],health:{httpStatus:200,status:'healthy',version:'d62a21c'}},proxy:{networks:[{name:'observed-public',ip:'10.0.0.3'}]},networks:[{name:'observed-public',internal:false}],sharedNetworks:['observed-public']};
 const result=await collectProxyReadiness({env,run:async(args,source)=>{
  keyPath=args[1];assert.equal(await readFile(keyPath,'utf8'),'TEST_PRIVATE_KEY\n');assert(args.includes('StrictHostKeyChecking=yes'));
  assert.equal(args.at(-1),'/opt/compass-academy-node/bin/node --input-type=module');assert.equal(source,proxyProbeSource);
  assert(!/\.Config\.Env|docker logs|network connect|network disconnect|restart|compose up|CRON_SECRET/.test(source));
  assert.match(source,/const ip=value\.IPAddress\|\|null/);
  assert.match(source,/\['ps','--filter','name=coolify-proxy','--filter','status=running','--format','\{\{\.Names\}\}'\]/);
  return JSON.stringify(data);
 }});
 assert.equal(result.inspection,'complete');assert.deepEqual(result.sharedNetworks,['observed-public']);assert(!JSON.stringify(result).includes('TEST_PRIVATE_KEY'));await assert.rejects(readFile(keyPath));
});
test('fixed stage failures are diagnostic without forwarding raw host error text',async()=>{
 for(const stage of ['app_networks','proxy_discovery','proxy_networks','app_labels','network_internal']){
  const result=await collectProxyReadiness({env,run:async()=>JSON.stringify({probeFailed:true,stage,raw:'TEST_PRIVATE_KEY'})});
  assert.equal(result.reason,`probe_${stage}`);assert(!JSON.stringify(result).includes('TEST_PRIVATE_KEY'));
 }
});
test('denied contexts and raw errors never expose credentials or diagnostics',async()=>{
 for(const delta of [{GITHUB_REF:'refs/heads/other'},{GITHUB_REPOSITORY:'attacker/repo'},{HETZNER_USER:'other'},{HETZNER_HOST:'other'},{RUNNER_ENVIRONMENT:'self-hosted'}]){
  const result=await collectProxyReadiness({env:{...env,...delta},run:()=>assert.fail('must not call SSH')});assert.equal(result.inspection,'unavailable');
 }
 const result=await collectProxyReadiness({env,run:async()=>{throw new Error('TEST_PRIVATE_KEY raw failure');}});assert.equal(result.inspection,'unavailable');assert(!JSON.stringify(result).includes('TEST_PRIVATE_KEY'));
});
