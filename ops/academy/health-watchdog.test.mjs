import test from 'node:test';
import assert from 'node:assert/strict';
import {projectHealth,watchAcademy,hostProbe,appProbe,watchdogExitCode} from './health-watchdog.mjs';
const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',GITHUB_REPOSITORY:'B2B-net-S-A/COMPASS',GITHUB_REF:'refs/heads/main',HETZNER_HOST:'178.104.220.48',HETZNER_USER:'root',HETZNER_SSH_KEY:'synthetic-test-key'};
test('projects only aggregate codes, dropping arbitrary endpoint content',()=>{
 assert.deepEqual(projectHealth(JSON.stringify({status:'degraded',alerts:[{code:'scanner_unavailable',severity:'warning',secret:'not-exported'}],secret:'not-exported'})),{status:'degraded',alerts:[{code:'scanner_unavailable',severity:'warning'}]});
 for(const raw of ['{}','{"status":"healthy","alerts":[{"code":"unsafe\nvalue","severity":"critical"}]}','{"status":"healthy","alerts":[{"code":"failure","severity":"critical"}]}'])assert.throws(()=>projectHealth(raw));
});
test('warnings and critical alerts both fail the workflow',()=>{
 assert.equal(watchdogExitCode({status:'healthy'}),0);
 assert.equal(watchdogExitCode({status:'degraded'}),1);
 assert.equal(watchdogExitCode({status:'unhealthy'}),1);
});
test('rejects missing config, untrusted branch and self-hosted before SSH',async()=>{
 for(const change of [{HETZNER_SSH_KEY:''},{GITHUB_REF:'refs/heads/other'},{RUNNER_ENVIRONMENT:'self-hosted'}])await assert.rejects(watchAcademy({env:{...env,...change},run:()=>{throw new Error('must not execute');}}),/configuration|context/);
});
test('uses pinned host identity and fixed read-only source, never tokens in args',async()=>{
 let called=false;
 const result=await watchAcademy({env,run:async(args,input)=>{called=true;assert(args.includes('StrictHostKeyChecking=yes'));assert(args.includes('root@178.104.220.48'));assert(!args.join(' ').includes('synthetic-test-key'));assert.equal(input,hostProbe);return '{"status":"healthy","alerts":[]}';}});
 assert(called);assert.equal(result.status,'healthy');
 assert(hostProbe.includes('is-active'));assert(hostProbe.includes('is-enabled'));assert(hostProbe.includes('statfs'));assert(!hostProbe.includes("'restart'"));
 assert(appProbe.includes("redirect:'error'"));assert(appProbe.includes('/api/cron/academy-health'));assert(!appProbe.includes('process.stdout.write(secret'));
});

// Run the exact source sent to the app container. Testing only projectHealth
// would miss an earlier appProbe step discarding invalid or critical evidence.
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const unavailable={status:'unhealthy',alerts:[{code:'health_endpoint_unavailable',severity:'critical'}]};
async function runAppProbe({body,ok=true,fetchError,jsonError}={}){
 let output='';
 const fetch=async(url,options)=>{
  assert.equal(url,'http://127.0.0.1:10000/api/cron/academy-health');
  assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer synthetic-secret');
  if(fetchError)throw fetchError;
  return {ok,json:async()=>{if(jsonError)throw jsonError;return body;}};
 };
 await new AsyncFunction('fetch','process',appProbe)(fetch,{env:{CRON_SECRET:'synthetic-secret'},stdout:{write:value=>{output+=value;}}});
 assert(!output.includes('synthetic-secret'));assert(!output.includes('private-value'));
 return projectHealth(output);
}
test('actual app probe keeps valid healthy, warning and critical states without raw content',async()=>{
 for(const [status,alerts,ok]of [
  ['healthy',[],true],
  ['degraded',[{code:'scanner_unavailable',severity:'warning',details:'private-value'}],true],
  ['unhealthy',[{code:'materials_exhausted',severity:'critical',details:'private-value'}],false],
 ]){
  assert.deepEqual(await runAppProbe({body:{status,alerts,details:'private-value'},ok}),{status,alerts:alerts.map(({code,severity})=>({code,severity}))});
 }
});
for(const [name,body]of [
 ['missing alerts',{status:'healthy'}],
 ['non-array alerts',{status:'healthy',alerts:'private-value'}],
 ['null alert',{status:'healthy',alerts:[null]}],
 ['malformed critical code',{status:'healthy',alerts:[{code:'private-value',severity:'critical'}]}],
 ['coerced alert code',{status:'degraded',alerts:[{code:['scanner_unavailable'],severity:'warning'}]}],
 ['invalid severity',{status:'healthy',alerts:[{code:'scanner_unavailable',severity:'private-value'}]}],
 ['missing severity',{status:'healthy',alerts:[{code:'scanner_unavailable'}]}],
 ['healthy with warning',{status:'healthy',alerts:[{code:'scanner_unavailable',severity:'warning'}]}],
 ['healthy with critical',{status:'healthy',alerts:[{code:'materials_exhausted',severity:'critical'}]}],
 ['degraded with critical',{status:'degraded',alerts:[{code:'materials_exhausted',severity:'critical'}]}],
 ['degraded without alerts',{status:'degraded',alerts:[]}],
 ['unhealthy without critical',{status:'unhealthy',alerts:[{code:'scanner_unavailable',severity:'warning'}]}],
 ['unhealthy without alerts',{status:'unhealthy',alerts:[]}],
 ['oversized alert list',{status:'degraded',alerts:Array.from({length:26},()=>({code:'scanner_unavailable',severity:'warning'}))}],
 ['unknown status',{status:'private-value',alerts:[]}],
 ['null body',null],
])test(`actual app probe fails closed: ${name}`,async()=>assert.deepEqual(await runAppProbe({body}),unavailable));
test('actual app probe fails closed on HTTP or transport failure without emitting raw errors',async()=>{
 assert.deepEqual(await runAppProbe({body:{status:'healthy',alerts:[]},ok:false}),unavailable);
 assert.deepEqual(await runAppProbe({fetchError:new Error('private-value synthetic-secret')}),unavailable);
 assert.deepEqual(await runAppProbe({jsonError:new Error('private-value invalid JSON')}),unavailable);
});
