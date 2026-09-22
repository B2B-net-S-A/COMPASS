import assert from 'node:assert/strict';
import {createAcademyDatabase} from './lib/academy-db-fixture.mjs';
process.on('uncaughtException',error=>{console.error({message:error.message,where:error.where,query:error.query});process.exit(1)});
const f=await createAcademyDatabase({rollout:true});
const {db,ids,actor,owner,rpc,sql,legacy}=f;let checks=0;
async function denied(...args){await f.expectDenied(...args);checks++;}
try{
 await actor('student');assert.deepEqual(await rpc('academy_rollout_access'),{mode:'closed',allowed:false,isPilot:false});checks++;
 assert.equal((await sql('select * from courses')).rows.length,0);checks++;
 assert.equal((await sql('select * from course_enrollments')).rows.length,0);checks++;
 assert.equal((await sql('select * from academy_rollout_settings')).rows.length,0);checks++;
 await denied('select academy_enroll($1,null)',[legacy],/academy_access_required/);
 await denied("select academy_set_rollout('open','{}')",[],/admin_required/);
 await actor('admin');assert.equal((await rpc('academy_rollout_access')).allowed,true);checks++;
 await denied("select academy_set_rollout('pilot',ARRAY[$1::uuid])",[ids.internal],/pilot_requires_active_academy_accounts/);
 await denied("select academy_set_rollout('pilot','{}')",[],/pilot_requires_accounts/);
 await denied("select academy_set_rollout('pilot',ARRAY[NULL::uuid])",[],/invalid_rollout_settings/);
 await denied("update academy_rollout_settings set mode='open'",[],/permission denied/);
 await rpc('academy_set_trainer',[ids.trainer,true]);
 await rpc('academy_set_rollout',['pilot',[ids.student,ids.trainer]]);
 await actor('student');assert.deepEqual(await rpc('academy_rollout_access'),{mode:'pilot',allowed:true,isPilot:true});checks++;
 assert((await sql('select * from course_enrollments')).rows.length>0);checks++;
 await actor('other');assert.equal((await rpc('academy_rollout_access')).allowed,false);checks++;
 await actor('trainer');assert.equal(await rpc('academy_is_trainer'),true);checks++;
 const c=await rpc('academy_create_course',[{title:'Pilot-only draft',category:'IT',delivery_mode:'live'}]);
 await actor('admin');await rpc('academy_set_rollout',['closed',[]]);
 await actor('trainer');assert.equal(await rpc('academy_can_manage_course',[c.course_id]),false);checks++;
 await denied('select academy_update_course($1,$2)',[c.course_id,{title:'Closed edit'}]);
 await f.service();assert.equal(await rpc('academy_can_edit_course_as',[c.course_id,ids.trainer]),false);checks++;
 await actor('admin');await rpc('academy_set_rollout',['open',[]]);
 await actor('trainer');assert.equal(await rpc('academy_can_manage_course',[c.course_id]),true);checks++;
 await actor('internal');assert.equal((await rpc('academy_rollout_access')).allowed,false);checks++;
 await owner();await sql("update profiles set employment_status='exited' where id=$1",[ids.student]);
 await actor('student');assert.equal(await rpc('academy_can_access'),false);checks++;
 await actor('admin');const before=(await sql("select count(*)::int n from academy_audit_events where action='ACADEMY_ROLLOUT_CHANGED'")).rows[0].n;
 await rpc('academy_set_rollout',['open',[]]);assert.equal((await sql("select count(*)::int n from academy_audit_events where action='ACADEMY_ROLLOUT_CHANGED'")).rows[0].n,before);checks++;
 await actor('', 'anon');await denied('select academy_rollout_access()',[],/permission denied/);
 console.log(`Academy rollout checks passed: ${checks}`);
}finally{await db.close();}
