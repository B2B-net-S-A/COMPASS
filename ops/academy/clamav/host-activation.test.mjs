import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {activateHost,activationTimers,executeActivationCommand} from './activate-host.mjs';
import {checkActivationApp} from './activation-app-check.mjs';
const sha='a'.repeat(40),appId='b'.repeat(64),scannerId='c'.repeat(64),appName='app-w136dv828ofipvjfnxrqi643-142156803733';
test('native command adapter preserves explicit Compose defaults and stdin without shell expansion',async()=>{
 const {stdout}=await executeActivationCommand(process.execPath,['-e','let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(JSON.stringify({value:process.env.ACADEMY_CLAMAV_STATE_DIR,input:s})))'],{
  env:{ACADEMY_CLAMAV_STATE_DIR:'/var/lib/compass-academy'},input:'literal $(no-command)'});
 assert.deepEqual(JSON.parse(stdout),{value:'/var/lib/compass-academy',input:'literal $(no-command)'});
});
function fixture({pause=null,internal=true,extra=false,labels='compass-academy-clamd clamd',running=true,appVersion=sha,ready=true,failEnable=false,firstPreviouslyActive=false,firstManuallyActive=false,wrongNetworkApp=false}={}){
 const calls=[];
 const run=async(command,args,options={})=>{
  calls.push({command,args,options});
  if(command==='docker'){
   assert.deepEqual(args.slice(0,2),['--host','unix:///var/run/docker.sock']);
   if(args.includes('ps'))return {stdout:`${appId}\t${appName}\trunning\n`};
   if(args.includes('network'))return {stdout:JSON.stringify([{Name:'compass-academy-private',Internal:internal,Containers:{[wrongNetworkApp?'e'.repeat(64):appId]:{Name:appName},[scannerId]:{Name:'compass-academy-clamd-clamd-1'},...(extra?{['d'.repeat(64)]:{Name:'unrelated-app'}}:{})}}])};
   if(args.some(x=>x.startsWith('{"id":')))return {stdout:JSON.stringify({id:appId,name:`/${appName}`,service:'app',running,paused:false,restarting:false})};
   if(args.includes('inspect'))return {stdout:args.some(x=>x.includes('.Config.Labels'))?labels:JSON.stringify({Running:running,Paused:false,Restarting:false})};
   if(args.includes('exec'))return {stdout:JSON.stringify({ok:true,version:appVersion})};
   assert.fail('Unexpected Docker operation');
  }
  assert.equal(command,'systemctl');
  if(args[0]==='show'){
   const existing=firstPreviouslyActive&&args[1]===activationTimers[0];
   const active=existing||(firstManuallyActive&&args[1]===activationTimers[0]);
   return {stdout:`LoadState=loaded\nActiveState=${active?'active':'inactive'}\nUnitFileState=${existing?'enabled':'disabled'}\n`};
  }
  if(args[0]==='enable'&&failEnable)throw new Error('synthetic partial activation');
  if(args[0]==='is-active')return {stdout:'active\nactive\nactive\n'};
  if(args[0]==='is-enabled')return {stdout:'enabled\nenabled\nenabled\n'};
  assert(['enable','disable','stop'].includes(args[0]));return {stdout:''};
 };
 return {calls,dependencies:{run,store:{read:async()=>pause},readiness:async()=>{calls.push({command:'readiness',args:[]});if(!ready)throw new Error('scanner_not_ready');}}};
}
test('activation verifies isolated runtime and exact deployed SHA before enabling only three timers',async()=>{
 const f=fixture();assert.deepEqual(await activateHost({sha},f.dependencies),{ok:true,op:'activate',sha,timers:activationTimers});
 const exec=f.calls.find(c=>c.args.includes('exec'));
 assert.deepEqual(exec.args.slice(2),['exec','--interactive',appId,'node','--input-type=module','-',sha]);
 assert(exec.options.input.includes('process.env'));assert(!exec.args.some(arg=>arg.includes('CRON_SECRET')));
 const enable=f.calls.findIndex(c=>c.command==='systemctl'&&c.args[0]==='enable');
 assert(enable>f.calls.indexOf(exec));assert(enable>f.calls.findIndex(c=>c.command==='readiness'));
 assert.deepEqual(f.calls[enable].args,['enable','--now',...activationTimers]);
 assert(f.calls.filter(c=>c.command==='systemctl').every(c=>!c.args.some(arg=>arg.includes('cleanup'))));
});
test('pending pause, invalid input, wrong network/members/runtime/version all prevent timer mutations',async()=>{
 for(const options of [{pause:{kind:'deploy'}},{internal:false},{extra:true},{wrongNetworkApp:true},{labels:'another-project clamd'},{running:false},{appVersion:'d'.repeat(40)},{ready:false}]){
  const f=fixture(options);await assert.rejects(activateHost({sha},f.dependencies));
  assert(!f.calls.some(c=>c.command==='systemctl'&&['enable','disable','stop'].includes(c.args[0])));
 }
 for(const input of [{sha:'a'.repeat(7)},{sha,command:'start'},{sha:'A'.repeat(40)}]){
  const f=fixture();await assert.rejects(activateHost(input,f.dependencies),/invalid_expected_sha/);assert.equal(f.calls.length,0);
 }
});
test('partial systemctl failure rolls back only new timers and preserves pre-existing active schedules',async()=>{
 const f=fixture({failEnable:true,firstPreviouslyActive:true});await assert.rejects(activateHost({sha},f.dependencies),/timer_activation_failed/);
 assert.deepEqual(f.calls.find(c=>c.command==='systemctl'&&c.args[0]==='disable').args,['disable',...activationTimers.slice(1)]);
 assert.deepEqual(f.calls.find(c=>c.command==='systemctl'&&c.args[0]==='stop').args,['stop',...activationTimers.slice(1)]);
 const manual=fixture({failEnable:true,firstManuallyActive:true});await assert.rejects(activateHost({sha},manual.dependencies),/timer_activation_failed/);
 assert.deepEqual(manual.calls.find(c=>c.command==='systemctl'&&c.args[0]==='disable').args,['disable',...activationTimers]);
 assert.deepEqual(manual.calls.find(c=>c.command==='systemctl'&&c.args[0]==='stop').args,['stop',...activationTimers.slice(1)]);
});
test('in-container check keeps secrets private, requires configured AV and refuses stale or unhealthy app',async()=>{
 const secret='test-only-credential',env={CRON_SECRET:secret,ACADEMY_CLAMAV_HOST:'academy-clamd',ACADEMY_CLAMAV_PORT:'3310',ACADEMY_TEAMS_ENABLED:'false',ACADEMY_MATERIAL_CLEANUP_ENABLED:'false'};
 const requests=[];
 const response=(status='healthy',version=sha)=>async(url,options)=>{requests.push({url,options});return {ok:true,json:async()=>({status,version,secret})};};
 for(const version of [sha,sha.slice(0,7)]){
  const result=await checkActivationApp(sha,{env,fetchRequest:response('healthy',version)});assert.deepEqual(result,{ok:true,version});assert(!JSON.stringify(result).includes(secret));
 }
 assert(requests.every(r=>r.url==='http://127.0.0.1:10000/api/health'&&r.options.redirect==='error'&&!r.options.headers));
 for(const invalid of [{...env,CRON_SECRET:''},{...env,ACADEMY_CLAMAV_HOST:'other'},{...env,ACADEMY_CLAMAV_PORT:'3311'}])await assert.rejects(checkActivationApp(sha,{env:invalid,fetchRequest:response()}),/app_configuration_not_ready/);
 await assert.rejects(checkActivationApp(sha,{env,fetchRequest:response('unhealthy')}),/deployed_sha_not_ready/);
 await assert.rejects(checkActivationApp(sha,{env,fetchRequest:response('healthy','d'.repeat(40))}),/deployed_sha_not_ready/);
 assert.equal(env.ACADEMY_TEAMS_ENABLED,'false');assert.equal(env.ACADEMY_MATERIAL_CLEANUP_ENABLED,'false');
});
test('activation wrapper is fixed-path Linux/root with the same exclusive maintenance lock',async()=>{
 const shell=await readFile(new URL('./activate-host.sh',import.meta.url),'utf8');
 assert.match(shell,/export PATH=\/opt\/compass-academy-node\/bin:/);assert.match(shell,/"\$\(uname -s\)" != Linux/);assert.match(shell,/"\$\(id -u\)" != 0/);
 assert.match(shell,/flock --exclusive --wait 330 9/);assert.match(shell,/exec node \/opt\/compass-academy\/activate-host\.mjs/);
 assert(!/apt|npm install|CRON_SECRET|systemctl/.test(shell));
});
