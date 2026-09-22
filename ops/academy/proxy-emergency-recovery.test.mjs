import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recoverProxy,invokeRecovery,recoveryCommand,recoverySource} from './proxy-emergency-recovery.mjs';
const resource='w136dv828ofipvjfnxrqi643',privateNetwork='compass-academy-private',defaultNetwork=resource+'_default',app='app-'+resource+'-142156803733',sha='d62a21c10732ea2ce3b9710be1cce1338a737e46';
const image='sha256:'+'a'.repeat(64);
function fixture({marker=false,timer='inactive',version=sha,healthy=true,label='',shared=resource,internal=true,proxyImage='traefik:v3.6',disconnectFails=false,publicOnly=false,appImage=image,refreshFails=false}={}){
 const calls=[],networks=new Set(publicOnly?[resource]:[resource,defaultNetwork,privateNetwork]);
 return {calls,deps:{markerPresent:async()=>marker,systemctl:async args=>{calls.push(['systemctl',...args]);return timer;},health:async()=>({httpStatus:healthy?200:503,status:healthy?'healthy':'unhealthy',version}),docker:async args=>{
  calls.push(args);
  if(args[0]==='ps')return app;
  if(args[0]==='inspect'){
   if(args.includes('{{.Image}}'))return appImage;
   if(args.includes('{{.Config.Image}}'))return proxyImage;
   if(args.includes('{{json .State}}'))return JSON.stringify({Running:true,Paused:false,Restarting:false});
   if(args.some(arg=>arg.includes('traefik.docker.network')))return label;
   return JSON.stringify(Object.fromEntries((args.at(-1)===app?[...networks]:[shared,'coolify']).map(name=>[name,{}])));
  }
  if(args[0]==='network'&&args[1]==='inspect')return args.at(-1)===privateNetwork?String(internal):'false';
  if(args[0]==='network'&&args[1]==='disconnect'){
   assert.equal(args[3],app);assert([privateNetwork,defaultNetwork].includes(args[2]));assert.equal(args.length,4);
   if(disconnectFails)throw new Error('synthetic_failure');networks.delete(args[2]);return '';
  }
  if(args[0]==='run'){if(refreshFails)throw new Error('synthetic_refresh_failure');return 'v22.23.0\n';}
  assert.fail('Unexpected operation');
 }}};
}
test('exact healthy incident disconnects only the two unreachable networks and preserves public network',async()=>{
 const f=fixture(),result=await recoverProxy(f.deps);assert.equal(result.ok,true);assert.equal(result.retainedNetwork,resource);
 assert.deepEqual(f.calls.filter(args=>args[0]==='network'&&args[1]==='disconnect'),[['network','disconnect',privateNetwork,app],['network','disconnect',defaultNetwork,app]]);
 assert(!f.calls.some(args=>args.includes('--force')||args.includes('restart')||args.includes('connect')));
 assert.equal(result.providerRefresh,true);assert.equal(f.calls.filter(args=>args[0]==='run').length,1);
});
test('all mismatched incident preconditions refuse mutations',async()=>{
 for(const options of [{marker:true},{timer:'active'},{version:'f'.repeat(40)},{healthy:false},{label:resource},{shared:'another-network'},{internal:false},{proxyImage:'caddy:2'},{appImage:'app:latest'}]){
  const f=fixture(options);await assert.rejects(recoverProxy(f.deps));assert(!f.calls.some(args=>args[1]==='disconnect'||args[0]==='run'));
 }
});
test('unknown disconnect outcome never triggers retries or further mutations',async()=>{
 const f=fixture({disconnectFails:true});await assert.rejects(recoverProxy(f.deps));assert.equal(f.calls.filter(args=>args[1]==='disconnect').length,1);
 assert(!f.calls.some(args=>args[0]==='run'));
});
test('already recovered network runs exactly one constrained provider refresh from immutable existing image',async()=>{
 const f=fixture({publicOnly:true}),result=await recoverProxy(f.deps);
 assert.deepEqual(result.disconnected,[]);assert(!f.calls.some(args=>args[1]==='disconnect'));
 const runs=f.calls.filter(args=>args[0]==='run');assert.equal(runs.length,1);
 assert.match(runs[0][4],/^compass-proxy-refresh-[a-f0-9-]{36}$/);
 assert.deepEqual(runs[0],['run','--rm','--pull=never','--name',runs[0][4],
  '--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
  '--memory','64m','--memory-swap','64m','--cpus','0.1','--pids-limit','32','--user','65534:65534',
  '--no-healthcheck','--log-driver','none','--label','traefik.enable=false','--entrypoint','/usr/local/bin/node',image,'--version']);
 assert(!JSON.stringify(result).includes('v22.23.0'));
});
test('unknown provider refresh outcome is not retried and cannot report success',async()=>{
 const f=fixture({publicOnly:true,refreshFails:true});await assert.rejects(recoverProxy(f.deps));assert.equal(f.calls.filter(args=>args[0]==='run').length,1);
});
test('only the explicit fix-branch manual action can reach pinned SSH; source has no secret access',async()=>{
 const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'B2B-net-S-A/COMPASS',GITHUB_REF:'refs/heads/fix/academy-proxy-network',GITHUB_EVENT_NAME:'workflow_dispatch',RECOVERY_ACTION:'academy-proxy-recover',HETZNER_HOST:'178.104.220.48',HETZNER_USER:'root',HETZNER_SSH_KEY:'TEST_PRIVATE_KEY'};
 for(const delta of [{GITHUB_REF:'refs/heads/main'},{GITHUB_EVENT_NAME:'push'},{RECOVERY_ACTION:'list'}])await assert.rejects(invokeRecovery({env:{...env,...delta},run:()=>assert.fail('SSH denied')}),/context_denied/);
 await invokeRecovery({env,run:async(args,source)=>{assert(args.includes('StrictHostKeyChecking=yes'));assert.equal(args.at(-1),recoveryCommand);assert.equal(source,recoverySource);assert(!source.includes('CRON_SECRET'));return JSON.stringify({ok:true,operation:'emergency_proxy_network_recovery'});}});
 assert.match(recoveryCommand,/flock --exclusive --wait 30 9/);
});
