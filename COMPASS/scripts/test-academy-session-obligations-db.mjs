// Focused obligation, cancellation, replacement and concurrency regression gate.
import assert from 'node:assert/strict';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';
process.on('uncaughtException',error=>{console.error({message:error.message,where:error.where,query:error.query});process.exit(1);});
const fixture = await createAcademyDatabase({ obligations: true, reviewSubmissions: true });
const { db, sql, actor, owner, service, rpc, ids } = fixture;
let checks=0;
const equal=(a,b)=>{assert.deepEqual(a,b);checks++;};
const denied=async(...args)=>{await fixture.expectDenied(...args);checks++;};
const time=h=>new Date(Date.now()+h*3600000).toISOString();
const input={title:'Required workshop',startsAt:time(24),endsAt:time(25),timeZone:'Europe/Warsaw',mode:'external_link',externalJoinUrl:'https://teams.microsoft.com/meet/123',required:true};
async function approve(version) {
 await actor('admin');const token=(await sql('select submission_id from course_versions where id=$1',[version])).rows[0].submission_id;
 await rpc('academy_review_course',[version,true,null,token]);
}
try {
 await actor('admin'); await rpc('academy_set_trainer',[ids.trainer,true]);
 const organizer=await rpc('academy_save_organizer',[{profileId:ids.internal,tenantId:'11111111-1111-4111-8111-111111111111',objectId:'22222222-2222-4222-8222-222222222222',enabled:true}]);
 await actor('trainer'); const {course_id:course,version_id:version}=await rpc('academy_create_course',[{title:'Frozen live obligations',category:'IT',delivery_mode:'live'}]);
 await rpc('academy_update_course',[course,{completion_rules:{quiz_required:false,require_all_lessons:false,attendance_percent:80}}]);
 await rpc('academy_submit_for_review',[course]);await approve(version);
 async function makeRun(title,sessions=[input]) {
  await actor('trainer');const run=await rpc('academy_create_run',[{courseId:course,versionId:version,title,capacity:3}]);
  const ids=[];for(const session of sessions)ids.push(await rpc('academy_save_session',[{...session,runId:run}]));
  await actor('admin');await rpc('academy_publish_run',[run]);return {run,sessions:ids};
 }
 const {run,sessions:[first,second]}=await makeRun('Two obligations',[input,{...input,title:'Second workshop'}]);
 await actor('student');const reg=await rpc('academy_register_run',[run]);
 let learner=(await rpc('academy_list_runs',[course,run]))[0].myRegistration.learnerProgress;
 equal(learner.completionState,'pending');equal(learner.readyToComplete,false);
 equal(learner.attendance.map(a=>[a.status,a.attendedSeconds,a.requiredSeconds,a.requiredForCompletion,a.requirementMet]),[
  ['unconfirmed',null,null,true,false],['unconfirmed',null,null,true,false]]);
 await denied('select academy_private.learner_run_progress($1)',[reg.enrollmentId]);
 await denied('select * from academy_private.run_obligations');
 await denied('select academy_replace_session($1,$2,$3,true)',[second,{...input,runId:run},'Unauthorized replacement']);
 await owner();equal((await sql('select count(*)::int n from academy_private.run_obligations where run_id=$1',[run])).rows[0].n,2);
 await denied('delete from course_sessions where id=$1',[second],/historię/);
 await denied('update course_sessions set required=false where id=$1',[second],/niezmienne/);
 await denied("update course_runs set status='draft' where id=$1",[run],/niezmienne/);
 await actor('trainer');
 await denied('select academy_save_session($1)',[{...input,runId:run,id:first,required:false}],/niezmienne/);
 await denied('select academy_save_session($1)',[{...input,runId:run}],/dodawać wymagań/);
 assert(await rpc('academy_save_session',[{...input,runId:run,required:false,title:'Optional Q&A'}]));checks++;
 await rpc('academy_save_session',[{...input,runId:run,id:first,startsAt:time(26),endsAt:time(27)}]);
 await owner();equal((await sql('select active_session_id from academy_private.run_obligations where original_session_id=$1',[first])).rows[0].active_session_id,first);
 await actor('trainer');await rpc('academy_cancel_session',[second,'Trainer unavailable; replacement to follow']);
 await owner();equal((await sql('select count(*)::int n from academy_private.run_obligations where run_id=$1',[run])).rows[0].n,2);
 const started=time(-2),ended=time(-1);
 await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1',[first,started,ended]);
 await actor('trainer');await rpc('academy_confirm_session_window',[first,started,ended]);
 equal((await rpc('academy_record_attendance',[{sessionId:first,enrollmentId:reg.enrollmentId,status:'present',attendedSeconds:3600,note:'Verified all teaching minutes'}])).completed,false);
 await actor('student');learner=(await rpc('academy_list_runs',[course,run]))[0].myRegistration.learnerProgress;
 equal(learner.attendance.find(a=>a.sessionId===first),{sessionId:first,status:'present',attendedSeconds:3600,thresholdPercent:80,requiredSeconds:2880,requiredForCompletion:true,requirementMet:true});
 equal(learner.attendance.find(a=>a.sessionId===second).requirementMet,false);
 equal(learner.attendance.find(a=>a.sessionId===second).requiredForCompletion,true);
 equal(JSON.stringify(learner).includes('Verified all teaching minutes'),false);
 await owner();equal(await rpc('academy_attendance_satisfied',[reg.enrollmentId]),false);
 await actor('student');equal((await rpc('academy_list_runs',[course,run]))[0].sessions.find(s=>s.id===second).canReplace,false);
 await actor('trainer');await denied('select academy_replace_session($1,$2,$3,false)',[second,{...input,runId:run},'Explicit external replacement'],/zewnętrznego organizatora/);
 const replacement=await rpc('academy_replace_session',[second,{...input,runId:run,required:false},'Explicit external replacement',true]);
 const dto=(await rpc('academy_list_runs',[course,run]))[0];
 equal(dto.sessions.find(s=>s.id===second).replacementSessionId,replacement);
 equal(dto.sessions.find(s=>s.id===replacement).replacesSessionId,second);
 equal(dto.sessions.find(s=>s.id===replacement).required,true);
 equal(dto.sessions.find(s=>s.id===second).canReplace,false);
 await denied('select academy_replace_session($1,$2,$3,true)',[second,{...input,runId:run},'Duplicate replacement rejected']);
 await owner();equal((await sql('select count(*)::int n from academy_private.run_obligations where run_id=$1',[run])).rows[0].n,2);
 equal((await sql('select active_session_id from academy_private.run_obligations where original_session_id=$1',[second])).rows[0].active_session_id,replacement);
 await sql("insert into session_attendance(session_id,enrollment_id,status,attended_seconds,source,reviewed_by,note)values($1,$2,'present',3600,'manual',$3,'Old evidence must not transfer')",[second,reg.enrollmentId,ids.trainer]);
 await owner();equal(await rpc('academy_attendance_satisfied',[reg.enrollmentId]),false);
 await actor('student');learner=(await rpc('academy_list_runs',[course,run]))[0].myRegistration.learnerProgress;
 equal(learner.attendance.find(a=>a.sessionId===second).requiredForCompletion,false);
 equal(learner.attendance.find(a=>a.sessionId===second).requirementMet,false);
 equal(learner.attendance.find(a=>a.sessionId===replacement).requiredForCompletion,true);
 equal(learner.attendance.find(a=>a.sessionId===replacement).attendedSeconds,null);
 await owner();await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1',[replacement,started,ended]);
 await actor('trainer');await rpc('academy_confirm_session_window',[replacement,started,ended]);
 equal((await rpc('academy_record_attendance',[{sessionId:replacement,enrollmentId:reg.enrollmentId,status:'present',attendedSeconds:3600,note:'Replacement teaching confirmed'}])).completed,true);
 await actor('student');const completed=(await rpc('academy_list_runs',[course,run]))[0].myRegistration;
 assert(completed.completedAt);checks++;equal(completed.completionRevokedAt,null);equal(completed.completionRevokedReason,null);
 equal(completed.learnerProgress.completionState,'completed');equal(completed.learnerProgress.attendanceSatisfied,true);
 await actor('trainer');await denied('select academy_cancel_session($1,$2)',[replacement,'Do not change issued completion']);
 await owner();equal((await sql("select count(*)::int n from academy_audit_events where action='ACADEMY_SESSION_REPLACED' and details->>'run_id'=$1",[run])).rows[0].n,1);
 equal((await sql('select count(*)::int n from academy_notification_receipts where dedupe_key like $1',[`session:${replacement}:1:%`])).rows[0].n,1);
 const completionId=(await sql('select id from course_completions where enrollment_id=$1',[reg.enrollmentId])).rows[0].id;
 await actor('admin');await rpc('academy_revoke_completion',[completionId,'Verified attendance decision was incorrect']);
 await actor('student');const revoked=(await rpc('academy_list_runs',[course,run]))[0].myRegistration;
 assert(revoked.completionRevokedAt);checks++;equal(revoked.completionRevokedReason,'Verified attendance decision was incorrect');equal(revoked.completedAt,completed.completedAt);
 equal(revoked.learnerProgress.completionState,'revoked');equal(revoked.learnerProgress.readyToComplete,false);

 // Own progress remains pinned to the approved enrollment version. The read RPC
 // cannot accept another enrollment id, bypass RLS, reveal notes, or issue a cert.
 await actor('trainer');const mixed=await rpc('academy_create_course',[{title:'Own blended progress',category:'IT',delivery_mode:'blended'}]);
 await rpc('academy_update_course',[mixed.course_id,{completion_rules:{quiz_required:true,quiz_pass_percent:75,require_all_lessons:true,attendance_percent:80}}]);
 const lessons=[];for(let i=0;i<2;i++)lessons.push((await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md)values($1,$2,$3,$4,'Private material')returning id",[mixed.course_id,mixed.version_id,`Required lesson ${i+1}`,i])).rows[0].id);
 const questions=Array.from({length:4},(_,i)=>({question_text:`Question ${i+1}`,options:Array.from({length:4},(_,j)=>({option_text:`Answer ${j+1}`,is_correct:j===0}))}));
 await rpc('academy_replace_quiz',[mixed.course_id,questions]);await rpc('academy_submit_for_review',[mixed.course_id]);await approve(mixed.version_id);
 await actor('trainer');const mixedRun=await rpc('academy_create_run',[{courseId:mixed.course_id,versionId:mixed.version_id,title:'Own progress edition',capacity:3}]);
 const mixedSession=await rpc('academy_save_session',[{...input,runId:mixedRun}]);await actor('admin');await rpc('academy_publish_run',[mixedRun]);
 await actor('student');const ownReg=await rpc('academy_register_run',[mixedRun]);await rpc('academy_mark_lesson_complete',[ownReg.enrollmentId,lessons[0]]);
 await actor('other');const otherReg=await rpc('academy_register_run',[mixedRun]);
 const quiz=(await sql('select * from academy_get_quiz($1)',[otherReg.enrollmentId])).rows;
 await rpc('academy_submit_quiz',[otherReg.enrollmentId,quiz.map(q=>({question_id:q.question_id,selected_option_id:q.options[0].id}))]);
 await owner();await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1',[mixedSession,started,ended]);
 await actor('trainer');await rpc('academy_confirm_session_window',[mixedSession,started,ended]);
 await rpc('academy_record_attendance',[{sessionId:mixedSession,enrollmentId:ownReg.enrollmentId,status:'present',attendedSeconds:2880,note:'Confidential student evidence'}]);
 await rpc('academy_record_attendance',[{sessionId:mixedSession,enrollmentId:otherReg.enrollmentId,status:'insufficient',attendedSeconds:30,note:'Confidential other evidence'}]);
 const next=await rpc('academy_begin_draft',[mixed.course_id]);await rpc('academy_update_course',[mixed.course_id,{completion_rules:{quiz_required:true,quiz_pass_percent:100,require_all_lessons:true,attendance_percent:95}}]);
 await rpc('academy_submit_for_review',[mixed.course_id]);await approve(next);
 await actor('student');const ownDTO=(await rpc('academy_list_runs',[mixed.course_id,mixedRun]))[0];learner=ownDTO.myRegistration.learnerProgress;
 equal(ownDTO.versionId,mixed.version_id);equal(ownDTO.myRegistration.enrollmentId,ownReg.enrollmentId);
 equal(learner.missingLessons,[{id:lessons[1],title:'Required lesson 2'}]);equal(learner.quizRequired,true);equal(learner.quizPassed,false);equal(learner.quizPassPercent,75);
 equal(learner.attendance[0].thresholdPercent,80);equal(learner.attendance[0].attendedSeconds,2880);equal(learner.attendance[0].requirementMet,true);
 equal(learner.attendanceSatisfied,true);equal(learner.readyToComplete,false);
 equal(Object.keys(learner.attendance[0]).sort(),['attendedSeconds','requiredForCompletion','requiredSeconds','requirementMet','sessionId','status','thresholdPercent'].sort());
 equal(JSON.stringify(ownDTO).includes(otherReg.enrollmentId),false);equal(JSON.stringify(ownDTO).includes('Confidential'),false);
 equal((await sql('select * from session_attendance where enrollment_id=$1',[otherReg.enrollmentId])).rows.length,0);
 await denied('select academy_private.learner_run_progress($1)',[otherReg.enrollmentId]);
 equal(await rpc('academy_list_runs',[null,otherReg.enrollmentId]),[]);
 await actor('other');const otherDTO=(await rpc('academy_list_runs',[mixed.course_id,mixedRun]))[0];
 equal(otherDTO.myRegistration.enrollmentId,otherReg.enrollmentId);equal(otherDTO.myRegistration.learnerProgress.missingLessons.length,2);
 equal(otherDTO.myRegistration.learnerProgress.quizPassed,true);equal(otherDTO.myRegistration.learnerProgress.attendance[0].attendedSeconds,30);
 equal(otherDTO.myRegistration.learnerProgress.attendanceSatisfied,false);equal(JSON.stringify(otherDTO).includes(ownReg.enrollmentId),false);
 await actor('trainer');equal((await rpc('academy_list_runs',[mixed.course_id,mixedRun]))[0].myRegistration,null);
 await denied('select academy_private.learner_run_progress($1)',[ownReg.enrollmentId]);
 await owner();const counters=()=>sql('select (select count(*) from course_completions)::int completions,(select count(*) from academy_audit_events)::int audits,(select count(*) from loyalty_transactions)::int rewards');
 const before=(await counters()).rows;await actor('student');await rpc('academy_list_runs',[null,null]);await rpc('academy_list_runs',[mixed.course_id,mixedRun]);
 await owner();equal((await counters()).rows,before);
 // Defense in depth: even the private helper running as owner preserves auth.uid.
 equal((await sql('select academy_private.learner_run_progress($1) p',[otherReg.enrollmentId])).rows[0].p,null);
 await actor('student');await rpc('academy_cancel_registration',[mixedRun]);
 equal((await rpc('academy_list_runs',[mixed.course_id,mixedRun]))[0].myRegistration.learnerProgress,null);
 // A failed or ambiguous Graph create cannot silently become a manual duplicate.
 const {run:managed,sessions:[managedSession]}=await makeRun('Managed cancellation',[{...input,mode:'managed_teams',organizerId:organizer,externalJoinUrl:null}]);
 await service();const [createJob]=await rpc('academy_claim_jobs',['failed-create',1,180]);
 await rpc('academy_fail_job',[createJob.id,createJob.leaseToken,'forbidden','failed',null]);
 await actor('trainer');await denied('select academy_save_session($1)',[{...input,runId:managed,id:managedSession}],/organizatora|organizacji|trybu/);
 await rpc('academy_cancel_session',[managedSession,'Cancel before manual replacement']);
 equal((await rpc('academy_list_runs',[course,managed]))[0].sessions[0].canReplace,false);
 await denied('select academy_replace_session($1,$2,$3,true)',[managedSession,{...input,runId:managed},'Blocked until remote cancellation']);
 await service();const [cancelJob]=await rpc('academy_claim_jobs',['cancel-worker',1,180]);equal(cancelJob.kind,'cancel_meeting');
 await actor('trainer');await denied('select academy_replace_session($1,$2,$3,true)',[managedSession,{...input,runId:managed},'Blocked while cancellation in flight']);
 await service();await rpc('academy_complete_job',[cancelJob.id,cancelJob.leaseToken,{kind:'meeting_cancelled'}]);
 await actor('trainer');equal((await rpc('academy_list_runs',[course,managed]))[0].sessions[0].canReplace,true);
 const manual=await rpc('academy_replace_session',[managedSession,{...input,runId:managed},'Remote cancellation confirmed',false]);assert(manual);checks++;
 await owner();equal((await sql('select count(*)::int n from academy_integration_jobs where session_id=$1',[manual])).rows[0].n,0);
 // Replacing a replacement keeps one original obligation and no copied attendance.
 const {run:chain,sessions:[original]}=await makeRun('Replacement lineage');
 await actor('trainer');await rpc('academy_cancel_session',[original,'First replacement requested']);
 const child=await rpc('academy_replace_session',[original,{...input,runId:chain},'First replacement in chain',true]);
 await rpc('academy_cancel_session',[child,'Second replacement requested']);
 const grandchild=await rpc('academy_replace_session',[child,{...input,runId:chain},'Second replacement in chain',true]);
 await owner();const obligations=(await sql('select original_session_id,active_session_id from academy_private.run_obligations where run_id=$1',[chain])).rows;
 equal(obligations,[{original_session_id:original,active_session_id:grandchild}]);
 if(fixture.engine==='postgres') {
  const {run:race,sessions:[old]}=await makeRun('Concurrent replacement');await actor('trainer');await rpc('academy_cancel_session',[old,'Replacing cancelled workshop']);
  const a=await fixture.connectSession('trainer'),b=await fixture.connectSession('trainer');
  const attempts=await Promise.allSettled([a.rpc('academy_replace_session',[old,{...input,runId:race},'First concurrent replacement',true]),b.rpc('academy_replace_session',[old,{...input,runId:race},'Second concurrent replacement',true])]);
  equal(attempts.filter(x=>x.status==='fulfilled').length,1);equal(attempts.filter(x=>x.status==='rejected').length,1);
  await owner();equal((await sql('select count(*)::int n from course_sessions where replaces_session_id=$1',[old])).rows[0].n,1);
  await a.db.close();await b.db.close();
 }
 console.log(`Academy session obligations: ${checks} assertions passed (${fixture.engine}${fixture.engine==='pglite'?', concurrency reserved for hosted PostgreSQL':''}).`);
} finally { await db.close(); }
