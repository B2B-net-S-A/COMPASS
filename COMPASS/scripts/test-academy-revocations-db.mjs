import assert from 'node:assert/strict';
import {createAcademyDatabase} from './lib/academy-db-fixture.mjs';
process.on('uncaughtException',error=>{console.error({message:error.message,where:error.where,query:error.query});process.exit(1)});
const f=await createAcademyDatabase({revocations:true});
const {db,ids,sql,actor,owner,rpc}=f;
let checks=0;
async function denied(...args){await f.expectDenied(...args);checks++;}
async function eq(query,value,params=[]){assert.equal((await sql(query,params)).rows[0].v,value);checks++;}
async function program(title,prerequisites=[]){
 await actor('trainer'); const c=await rpc('academy_create_course',[{title,category:'IT',delivery_mode:'self_paced',prerequisite_course_ids:prerequisites,completion_rules:{quiz_required:false,quiz_pass_percent:80,require_all_lessons:true,attendance_percent:80}}]);
 const lesson=(await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Evidence',0,'Evidence lesson') returning id",[c.course_id,c.version_id])).rows[0].id;
 await rpc('academy_submit_for_review',[c.course_id]);await actor('admin');await rpc('academy_review_course',[c.version_id,true,null]);return {...c,lesson};
}
try {
 await actor('admin');await rpc('academy_set_trainer',[ids.trainer,true]);
 const c=await program('Revocable certificate');
 await owner();await sql("update loyalty_rules set points=300 where code='course_completed_author_reward'");
 await actor('student');const enrollment=await rpc('academy_enroll',[c.course_id,null]);await rpc('academy_mark_lesson_complete',[enrollment,c.lesson]);
 const completion=(await sql('select * from course_completions where enrollment_id=$1',[enrollment])).rows[0];assert(completion.reward_tracking_complete);checks++;
 await denied('select academy_revoke_completion($1,$2)',[completion.id,'Not allowed decision'],/admin_required/);
 await denied('update course_completions set revoked_at=now() where id=$1',[completion.id],/permission denied/);
 await actor('admin');await denied('select academy_revoke_completion($1,$2)',[completion.id,'short'],/revocation_reason_required/);
 await denied('delete from course_completions where id=$1',[completion.id],/permission denied/);
 await owner();await denied("update course_completions set certificate_snapshot='{}' where id=$1",[completion.id],/completion_history_is_immutable/);
 await eq('select count(*)::int v from academy_completion_rewards where completion_id=$1',2,[completion.id]);
 const promotionsBefore=(await sql("select count(*)::int n from notifications where type='loyalty_tier_up'")).rows[0].n;
 const dependent=await program('Requires valid certificate',[c.course_id]);
 // A second independently retained evidence record for the same learner/course keeps one reward claim justified.
 await owner();const run=(await sql("insert into course_runs(course_id,version_id,title,capacity,status,created_by)values($1,$2,'Historical repeated cohort',10,'published',$3) returning id",[c.course_id,c.version_id,ids.trainer])).rows[0].id;
 const e2=(await sql("insert into course_enrollments(user_id,course_id,version_id,run_id,completed_at,completed_lessons)values($1,$2,$3,$4,now(),ARRAY[$5::uuid])returning id",[ids.student,c.course_id,c.version_id,run,c.lesson])).rows[0].id;
 const c2=(await sql("insert into course_completions(enrollment_id,user_id,course_id,version_id,completed_at,certificate_snapshot,reward_tracking_complete)values($1,$2,$3,$4,now(),$5,true)returning id",[e2,ids.student,c.course_id,c.version_id,completion.certificate_snapshot])).rows[0].id;
 await actor('admin');const first=await rpc('academy_revoke_completion',[completion.id,'Attendance was attributed to the wrong person']);assert.equal(first.rewards_state,'retained_valid_completion');checks++;
 await owner();await eq("select count(*)::int v from loyalty_transactions where status='reversed'",0);
 await actor('student');const priorDependent=await rpc('academy_enroll',[dependent.course_id,null]);assert(priorDependent);checks++;
 await actor('admin');const final=await rpc('academy_revoke_completion',[c2,'Second certificate also used incorrect evidence']);assert.equal(final.rewards_state,'reversed');assert.equal(final.reversed_transactions,2);checks+=2;
 const retry=await rpc('academy_revoke_completion',[c2,'Retry must not overwrite the original reason']);assert.equal(retry.id,final.id);assert.equal(retry.reason,final.reason);assert(retry.already_revoked);checks+=3;
 await owner();await eq('select count(*)::int v from academy_completion_revocations where completion_id=$1',1,[c2]);
 await eq("select count(*)::int v from academy_audit_events where action='COURSE_COMPLETION_REVOKED' and details->>'completion_id'=$1",1,[c2]);
 await eq("select count(*)::int v from loyalty_transactions where status='reversed'",2);
 await eq("select count(*)::int v from notifications where type='loyalty_tier_up'",promotionsBefore);
 await eq('select completed_at is not null and cardinality(completed_lessons)=1 v from course_enrollments where id=$1',true,[enrollment]);
 await eq("select count(*)::int v from academy_reward_claims where user_id=$1 and course_id=$2 and reward_kind='completion'",1,[ids.student,c.course_id]);
 await denied("update academy_completion_revocations set reason='Replacement reason' where completion_id=$1",[c2],/completion_history_is_immutable/);
 await denied('delete from academy_completion_rewards where completion_id=$1',[completion.id],/completion_history_is_immutable/);
 await eq('select loyalty_points=(select coalesce(sum(points),0) from loyalty_transactions where user_id=$1 and status=\'confirmed\') v from profiles where id=$1',true,[ids.trainer]);
 await actor('student');const again=await rpc('academy_complete_course',[enrollment]);assert.equal(again.completed,false);assert.equal(again.reason,'completion_revoked');checks+=2;
 await rpc('academy_mark_lesson_complete',[enrollment,c.lesson]);
 assert.equal(await rpc('academy_enroll',[dependent.course_id,null]),priorDependent);checks++;
 await denied('select academy_submit_survey($1,10,null,null)',[enrollment],/own_trusted_completion_required/);
 await denied('insert into course_ratings(user_id,course_id,rating)values($1,$2,5)',[ids.student,c.course_id],/row-level security/);
 const future=await program('New prerequisite enrollment',[c.course_id]);await actor('student');await denied('select academy_enroll($1,null)',[future.course_id],/prerequisites_not_completed/);
 await owner();const path=(await sql("insert into learning_paths(title,slug,description,status,author_id)values('Revoked proof path','revoked-proof','','published',$1)returning id",[ids.admin])).rows[0].id;
 await sql('insert into learning_path_courses(path_id,course_id,order_index)values($1,$2,0)',[path,c.course_id]);
 await actor('student');await rpc('academy_enroll_path',[path]);assert.equal((await rpc('academy_complete_path',[path])).completed,false);checks++;
 await actor('admin');const ownEnrollment=await rpc('academy_enroll',[c.course_id,null]);await rpc('academy_mark_lesson_complete',[ownEnrollment,c.lesson]);
 const ownId=(await sql('select id from course_completions where enrollment_id=$1',[ownEnrollment])).rows[0].id;
 await denied('select academy_revoke_completion($1,$2)',[ownId,'I cannot revoke my own certificate'],/independent_admin_required/);
 const old=(await sql('select id from course_completions where course_id=$1 and user_id=$2',[f.legacy,ids.student])).rows[0].id;
 const oldDecision=await rpc('academy_revoke_completion',[old,'Legacy evidence was verified as incorrect']);assert(oldDecision.manual_reward_review_required);assert.equal(oldDecision.rewards_state,'manual_review');checks+=2;
 await actor('other');await eq('select count(*)::int v from academy_completion_revocations',0);
 await actor('internal');await denied('select academy_revoke_completion($1,$2)',[ownId,'Wrong global role cannot revoke'],/admin_required/);
 if(f.engine==='postgres'){
  // Independent TCP sessions prove author balance serialization under concurrent awards.
  const concurrent=await program('Concurrent author reward');
  await actor('student');const ea=await rpc('academy_enroll',[concurrent.course_id,null]);
  await actor('other');const eb=await rpc('academy_enroll',[concurrent.course_id,null]);
  const [a,b]=await Promise.all([f.connectSession('student'),f.connectSession('other')]);
  try{await Promise.all([a.rpc('academy_mark_lesson_complete',[ea,concurrent.lesson]),b.rpc('academy_mark_lesson_complete',[eb,concurrent.lesson])]);
   await owner();await eq('select loyalty_points=(select coalesce(sum(points),0) from loyalty_transactions where user_id=$1 and status=\'confirmed\') v from profiles where id=$1',true,[ids.trainer]);
   await eq("select count(*)::int v from loyalty_transactions where user_id=$1 and source_id=$2 and source_type='course_completed_author_reward' and status='confirmed'",2,[ids.trainer,concurrent.course_id]);
  }finally{await a.db.close();await b.db.close();}
 } else console.log('Hosted-only: real concurrent author reward assertions deferred to PostgreSQL CI.');
 console.log(`Academy certificate revocation checks passed: ${checks}`);
}finally{await db.close();}
