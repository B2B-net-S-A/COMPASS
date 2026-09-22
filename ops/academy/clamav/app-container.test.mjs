import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discoverAcademyApp} from './app-container.mjs';

const id='b'.repeat(64),otherId='c'.repeat(64),name='app-w136dv828ofipvjfnxrqi643-142156803733';
const row=(containerId=id,containerName=name,state='running')=>`${containerId}\t${containerName}\t${state}\n`;
function fixture({listing=row(),state={},invalidJson=false,fail=false}={}){
 const calls=[];
 const run=async(command,args,options)=>{
  calls.push({command,args,options});assert.equal(command,'docker');
  assert.deepEqual(args.slice(0,2),['--host','unix:///var/run/docker.sock']);
  assert.equal(options.timeout,3000);assert.equal(options.maxBuffer,65536);
  if(fail)throw new Error('arbitrary Docker error with PRIVATE environment');
  if(args[2]==='ps'){
   assert.deepEqual(args.slice(3),['--no-trunc','--filter','status=running','--filter','label=com.docker.compose.service=app','--format','{{.ID}}\t{{.Names}}\t{{.State}}']);
   return {stdout:listing};
  }
  assert.equal(args[2],'inspect');assert.equal(args[3],'--format');assert.equal(args.at(-1),id);
  assert(!args[4].includes('.Config.Env'));assert(args[4].includes('com.docker.compose.service'));
  return {stdout:invalidJson?'invalid':JSON.stringify({id,name:`/${name}`,service:'app',running:true,paused:false,restarting:false,...state})};
 };
 return {run,calls};
}

test('discovers a uniquely running Coolify app by exact resource scope and full immutable ID',async()=>{
 const f=fixture({listing:row(otherId,'app-another-resource-123')+row()+row('d'.repeat(64),'compass-app')});
 assert.deepEqual(await discoverAcademyApp(f),{id,name});assert.equal(f.calls.length,2);
});

test('zero, stopped, legacy and similarly prefixed resources do not authorize an app',async()=>{
 for(const listing of ['',row(id,name,'exited'),row(id,'compass-app'),row(id,'app-w136dv828ofipvjfnxrqi643x-123'),row(id,'app-w136dv828ofipvjfnxrqi643-123-extra'),row(id,'other-app-w136dv828ofipvjfnxrqi643-123')]){
  const f=fixture({listing});await assert.rejects(discoverAcademyApp(f),/academy_app_not_found/);assert.equal(f.calls.length,1);
 }
});

test('overlapping running deployments fail closed instead of selecting newest or first',async()=>{
 const f=fixture({listing:row()+row(otherId,'app-w136dv828ofipvjfnxrqi643-142156803734')});
 await assert.rejects(discoverAcademyApp(f),/academy_app_ambiguous/);assert.equal(f.calls.length,1);
});

test('re-inspection rejects changed identity, incorrect service, pause, stop and restart races',async()=>{
 for(const state of [{id:otherId},{name:'/renamed-container'},{service:'clamd'},{service:null},{running:false},{paused:true},{restarting:true}]){
  await assert.rejects(discoverAcademyApp(fixture({state})),/academy_app_not_ready/);
 }
});

test('malformed Docker responses and transport failures expose only static errors',async()=>{
 for(const listing of ['short\t'+name+'\trunning\n',row()+'unexpected output\n'])await assert.rejects(discoverAcademyApp(fixture({listing})),/academy_app_discovery_invalid/);
 await assert.rejects(discoverAcademyApp(fixture({invalidJson:true})),/academy_app_discovery_invalid/);
 await assert.rejects(discoverAcademyApp(fixture({fail:true})),{message:'academy_app_discovery_failed'});
});
