import assert from 'node:assert/strict';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';
process.on('uncaughtException', error => { console.error({error:error.message,where:error.where,query:error.query});process.exit(1); });
const f=await createAcademyDatabase({materials:true,staff:true,invitationTargets:true});
const {db,ids,sql,actor,owner,service,rpc,legacy,oldLesson}=f;
const legacyVersion=(await sql('select published_version_id from courses where id=$1',[legacy])).rows[0].published_version_id;
let checks=0;
async function denied(...args){await f.expectDenied(...args);checks++;}
await actor('other');await denied('select academy_enroll($1,null)',[legacy],/legacy_admin_review_required/);
assert.equal((await sql('select * from courses where id=$1',[legacy])).rows.length,0);checks++;
await actor('student');assert.equal((await sql('select id from course_lessons where id=$1',[oldLesson])).rows.length,1);checks++;
await actor('admin');await denied('select academy_review_legacy_course($1,true,null,$2)',[legacy,legacyVersion],/independent_admin_review_required/);
const reviewer='00000000-0000-0000-0000-000000000099';
await owner();await sql("insert into auth.users(id,email)values($1,'reviewer@example.test')",[reviewer]);await sql("insert into profiles(id,role,email)values($1,'admin','reviewer@example.test')",[reviewer]);
await actor(reviewer);await rpc('academy_review_legacy_course',[legacy,true,null,legacyVersion]);
await actor('other');assert.ok(await rpc('academy_enroll',[legacy,null]));checks++;
await actor('admin');for(const user of [ids.trainer,ids.student,ids.other])await rpc('academy_set_trainer',[user,true]);
await actor('trainer');const course=await rpc('academy_create_course',[{title:'Collaborative live',category:'IT',delivery_mode:'live'}]);
const lesson=(await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md)values($1,$2,'Staff lesson',0,'Published program')returning id",[course.course_id,course.version_id])).rows[0].id;
await denied('select academy_set_course_staff($1,$2,$3,true)',[course.course_id,ids.internal,'editor'],/active_trainer_required/);
await rpc('academy_set_course_staff',[course.course_id,ids.student,'editor',true]);
await rpc('academy_set_course_staff',[course.course_id,ids.other,'facilitator',true]);
await actor('student');assert.equal(await rpc('academy_can_manage_course',[course.course_id]),true);checks++;
assert.equal(await rpc('academy_can_lead_course',[course.course_id]),false);checks++;
await sql("update course_lessons set content_md='Editor contribution' where id=$1",[lesson]);
await denied('select academy_set_course_staff($1,$2,$3,true)',[course.course_id,ids.student,'facilitator'],/course_owner_or_admin_required/);
await denied('select academy_can_edit_course_as($1,$2)',[course.course_id,ids.student],/permission denied/);
await rpc('academy_submit_for_review',[course.course_id]);
await actor('other');assert.equal(await rpc('academy_can_manage_course',[course.course_id]),false);checks++;
assert.equal((await sql('select * from course_lessons where id=$1',[lesson])).rows.length,0);checks++;
await denied('select academy_update_course($1,$2)',[course.course_id,{title:'Wrong scope'}]);
await actor('admin');await rpc('academy_review_course',[course.version_id,true,null]);
await actor('other');assert.equal((await sql('select * from course_lessons where id=$1',[lesson])).rows.length,1);checks++;
const run=await rpc('academy_create_run',[{courseId:course.course_id,versionId:course.version_id,title:'First group',capacity:5}]);
await actor('student');await denied('select academy_create_run($1)',[{courseId:course.course_id,versionId:course.version_id,title:'Editor group',capacity:5}]);
await denied('select academy_update_run($1,$2,$3)',[run,'Editor cannot operate',6]);
await actor('trainer');await rpc('academy_set_course_staff',[course.course_id,ids.other,'facilitator',false]);
await rpc('academy_set_run_staff',[run,ids.other,true]);
const otherRun=await rpc('academy_create_run',[{courseId:course.course_id,versionId:course.version_id,title:'Second group',capacity:5}]);
await actor('other');assert.equal(await rpc('academy_can_manage_run',[run]),true);checks++;
assert.equal(await rpc('academy_can_manage_run',[otherRun]),false);checks++;
await denied('select academy_update_run($1,$2,$3)',[otherRun,'Out of scope',7]);
assert.equal((await sql('select id from course_lessons where id=$1',[lesson])).rows.length,1);checks++;
await denied('select academy_set_run_staff($1,$2,true)',[run,ids.student],/course_owner_or_admin_required/);
await rpc('academy_update_run',[run,'Assigned facilitator',6]);
const teaching=await rpc('academy_teaching_courses');assert.equal(teaching[0].can_edit,false);assert.equal(teaching[0].can_manage_assigned_runs,true);checks++;
await service();assert.equal(await rpc('academy_can_edit_course_as',[course.course_id,ids.student]),true);checks++;
assert.equal(await rpc('academy_can_lead_run_as',[run,ids.other]),true);checks++;
assert.equal(await rpc('academy_can_lead_run_as',[run,ids.student]),false);checks++;
await actor('admin');await rpc('academy_set_trainer',[ids.other,false]);
await actor('other');assert.equal(await rpc('academy_can_manage_run',[run]),false);checks++;
await actor('admin');await rpc('academy_set_trainer',[ids.other,true]);
await actor('trainer');await rpc('academy_set_run_staff',[run,ids.other,false]);
await actor('other');assert.equal(await rpc('academy_can_manage_run',[run]),false);checks++;
// An administrator who contributed to the version needs an independent reviewer.
await actor('trainer');const next=await rpc('academy_begin_draft',[course.course_id]);
await actor('admin');await rpc('academy_update_course',[course.course_id,{title:'Administrator contribution'}]);
await actor('trainer');await rpc('academy_submit_for_review',[course.course_id]);
await actor('admin');await denied('select academy_review_course($1,true,null)',[next],/independent_admin_review_required/);
await actor(reviewer);await rpc('academy_review_course',[next,true,null]);checks++;
// Proposed prerequisites require a visible approved target and a cycle-free graph.
await actor('trainer');
await denied('select academy_create_course($1)',[{title:'Hidden prerequisite',category:'IT',prerequisite_course_ids:['00000000-0000-0000-0000-999999999999']}],/invalid_course_tags_or_prerequisites|published_visible_prerequisites_required/);
const dependent=await rpc('academy_create_course',[{title:'Dependent program',category:'IT',delivery_mode:'live',prerequisite_course_ids:[course.course_id]}]);
await rpc('academy_submit_for_review',[dependent.course_id]);await actor('admin');await rpc('academy_review_course',[dependent.version_id,true,null]);
await actor('trainer');await rpc('academy_begin_draft',[course.course_id]);
await denied('select academy_update_course($1,$2)',[course.course_id,{prerequisite_course_ids:[dependent.course_id]}],/prerequisite_cycle/);
await denied('select academy_update_course($1,$2)',[course.course_id,{prerequisite_course_ids:[course.course_id]}]);
await denied('select academy_update_course($1,$2)',[course.course_id,{prerequisite_course_ids:[legacy,legacy]}],/invalid_prerequisites/);
// Minimal public instructor directory never returns emails or draft-only staff assignments.
await actor('trainer'); await rpc('academy_set_course_staff',[course.course_id,ids.other,'facilitator',true]);
await actor('student'); const instructors=await rpc('academy_catalog_instructors');
assert(instructors.find(person=>person.id===ids.other)?.courseIds.includes(course.course_id)); checks++;
assert(!instructors.some(person=>person.id===ids.student)); checks++;
assert(instructors.every(person=>!('email' in person))); checks++;
await denied('select academy_get_staff($1,null)',[course.course_id],/course_owner_or_admin_required/);
await actor('trainer'); const members=await rpc('academy_get_staff',[course.course_id,null]); assert.equal(members.members.length,2); checks++;
await actor(reviewer); await denied('select academy_review_legacy_course($1,true,null,$2)',[legacy,course.version_id],/review_version_changed/);
// Managed invitation budget reserves room for owner + each distinct facilitator.
await actor('admin'); const organizer=await rpc('academy_save_organizer',[{profileId:ids.internal,tenantId:'11111111-1111-4111-8111-111111111111',objectId:'22222222-2222-4222-8222-222222222222',enabled:true}]);
await actor('trainer'); const managed=await rpc('academy_create_run',[{courseId:course.course_id,versionId:next,title:'Collaborative meeting',capacity:498}]);
const sessionInput={runId:managed,title:'Managed staff',startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+90000000).toISOString(),timeZone:'Europe/Warsaw',mode:'managed_teams',organizerId:organizer,required:true};
const session=await rpc('academy_save_session',[sessionInput]);
await denied('select academy_set_run_staff($1,$2,true)',[managed,ids.student],/limit 500/);
await denied('select academy_update_run($1,$2,499)',[managed,'Over invitation limit'],/limit 500/);
await rpc('academy_update_run',[managed,'Fits with staff',497]);
await rpc('academy_set_run_staff',[managed,ids.student,true]);
await actor('admin'); await rpc('academy_publish_run',[managed]);
// Staff who also registered are invited once, and revoked staff disappear in next revision.
await actor('other'); await rpc('academy_register_run',[managed]);
await service(); let [job]=await rpc('academy_claim_jobs',['staff-worker',1,180]);
let context=await rpc('academy_job_context',[job.id,job.leaseToken]);
assert.deepEqual(context.input.attendees.map(person=>person.email).sort(),['other@example.test','student@example.test','trainer@example.test']);checks++;
const meeting={eventId:'staff-event',joinUrl:'https://teams.microsoft.com/meet/123456789?p=secret',transactionId:'staff-marker',organizerId:'22222222-2222-4222-8222-222222222222'};
await rpc('academy_complete_job',[job.id,job.leaseToken,{kind:'meeting_synced',meeting}]);
// Graph invitations use an administrator-verified M365 address, not the Compass login address.
const tenant='33333333-3333-4333-8333-333333333333';
const trainerObject='44444444-4444-4444-8444-444444444444';
const otherObject='55555555-5555-4555-8555-555555555555';
await actor('admin');
await rpc('academy_save_m365_identity',[{userId:ids.trainer,tenantId:tenant,objectId:trainerObject,verifiedEmail:'trainer-teams@example.test'}]);
await rpc('academy_save_m365_identity',[{userId:ids.other,tenantId:tenant,objectId:otherObject,verifiedEmail:'other-teams@example.test'}]);
await actor('student'); await denied('select academy_private.invitation_email($1)',[ids.student],/permission denied/);
await actor('trainer'); await rpc('academy_set_run_staff',[managed,ids.student,false]);
await service(); [job]=await rpc('academy_claim_jobs',['staff-worker',1,180]); context=await rpc('academy_job_context',[job.id,job.leaseToken]);
assert.deepEqual(context.input.attendees.map(person=>person.email).sort(),['other-teams@example.test','trainer-teams@example.test']);checks++;
await rpc('academy_complete_job',[job.id,job.leaseToken,{kind:'meeting_synced',meeting}]);
// Multiple distinct aliases are not guessed; the administrator must mark one invitation target.
await actor('admin');
await rpc('academy_save_m365_identity',[{userId:ids.trainer,tenantId:tenant,objectId:'66666666-6666-4666-8666-666666666666',verifiedEmail:'trainer-second@example.test'}]);
await service(); [job]=await rpc('academy_claim_jobs',['staff-worker',1,180]);
await denied('select academy_job_context($1,$2)',[job.id,job.leaseToken],/academy_invitation_address_ambiguous/);
await rpc('academy_fail_job',[job.id,job.leaseToken,'configuration','failed',null]);
await actor('admin');
await denied('select academy_save_m365_identity($1)',[{userId:ids.trainer,tenantId:tenant,objectId:trainerObject,invitationTarget:true}],/invitation_email_required/);
await rpc('academy_save_m365_identity',[{userId:ids.trainer,tenantId:tenant,objectId:trainerObject,verifiedEmail:'trainer-teams@example.test',invitationTarget:true}]);
const mappings=await rpc('academy_list_m365_identities',['trainer']);
assert.equal(mappings.filter(identity=>identity.userId===ids.trainer&&identity.invitationTarget).length,1);checks++;
await service(); [job]=await rpc('academy_claim_jobs',['staff-worker',1,180]); context=await rpc('academy_job_context',[job.id,job.leaseToken]);
assert(context.input.attendees.some(person=>person.email==='trainer-teams@example.test'));checks++;
await rpc('academy_complete_job',[job.id,job.leaseToken,{kind:'meeting_synced',meeting}]);
// One email mapped to two profiles is unsafe even though Graph would deduplicate it.
await actor('admin');
await rpc('academy_save_m365_identity',[{userId:ids.other,tenantId:tenant,objectId:otherObject,verifiedEmail:'trainer-teams@example.test'}]);
await service(); [job]=await rpc('academy_claim_jobs',['staff-worker',1,180]);
await denied('select academy_job_context($1,$2)',[job.id,job.leaseToken],/academy_invitation_address_shared/);
await rpc('academy_fail_job',[job.id,job.leaseToken,'configuration','failed',null]);
await actor('admin');
await rpc('academy_save_m365_identity',[{userId:ids.other,tenantId:tenant,objectId:otherObject,verifiedEmail:'other-teams@example.test'}]);
await service(); [job]=await rpc('academy_claim_jobs',['staff-worker',1,180]); context=await rpc('academy_job_context',[job.id,job.leaseToken]);
await rpc('academy_complete_job',[job.id,job.leaseToken,{kind:'meeting_synced',meeting}]);
// Revoking the author removes them from future invites and enqueues a Graph update.
await actor('admin'); await rpc('academy_set_trainer',[ids.trainer,false]);
await service(); [job]=await rpc('academy_claim_jobs',['staff-worker',1,180]); context=await rpc('academy_job_context',[job.id,job.leaseToken]);
assert.deepEqual(context.input.attendees.map(person=>person.email),['other-teams@example.test']);checks++;
await rpc('academy_complete_job',[job.id,job.leaseToken,{kind:'meeting_synced',meeting}]);
await actor('admin'); await rpc('academy_set_trainer',[ids.trainer,true]);
await service(); [job]=await rpc('academy_claim_jobs',['staff-worker',1,180]); context=await rpc('academy_job_context',[job.id,job.leaseToken]);
assert(context.input.attendees.some(person=>person.email==='trainer-teams@example.test'));checks++;
await rpc('academy_complete_job',[job.id,job.leaseToken,{kind:'meeting_synced',meeting}]);
// An HR status change also removes the former instructor from future invitations.
await owner(); await sql("update profiles set employment_status='exited' where id=$1",[ids.trainer]);
await service(); [job]=await rpc('academy_claim_jobs',['staff-worker',1,180]); context=await rpc('academy_job_context',[job.id,job.leaseToken]);
assert.deepEqual(context.input.attendees.map(person=>person.email),['other-teams@example.test']);checks++;
await rpc('academy_complete_job',[job.id,job.leaseToken,{kind:'meeting_synced',meeting}]);
await owner(); await sql("update profiles set employment_status='active' where id=$1",[ids.trainer]);
await service(); [job]=await rpc('academy_claim_jobs',['staff-worker',1,180]); context=await rpc('academy_job_context',[job.id,job.leaseToken]);
assert(context.input.attendees.some(person=>person.email==='trainer-teams@example.test'));checks++;
await rpc('academy_complete_job',[job.id,job.leaseToken,{kind:'meeting_synced',meeting}]);
// A capability re-grant must roll back if capacity was raised while the author was revoked.
await actor('admin'); await rpc('academy_set_trainer',[ids.trainer,false]);
await rpc('academy_update_run',[managed,'Capacity while trainer revoked',499]);
await denied('select academy_set_trainer($1,true)',[ids.trainer],/limit 500/);
assert.equal((await sql('select can_train from academy_user_capabilities where user_id=$1',[ids.trainer])).rows[0].can_train,false);checks++;
await rpc('academy_update_run',[managed,'Capacity restored',497]);
await rpc('academy_set_trainer',[ids.trainer,true]);
// A confirmed learner loses their invitation on exit, and pilot removal is
// reflected in the next managed event update without changing enrollment data.
await actor('student'); await rpc('academy_register_run',[managed]);
await service(); [job]=await rpc('academy_claim_jobs',['staff-worker',1,180]); context=await rpc('academy_job_context',[job.id,job.leaseToken]);
assert(context.input.attendees.some(person=>person.email==='student@example.test'));checks++;
await rpc('academy_complete_job',[job.id,job.leaseToken,{kind:'meeting_synced',meeting}]);
await owner(); await sql("update profiles set employment_status='exited' where id=$1",[ids.student]);
await service(); [job]=await rpc('academy_claim_jobs',['staff-worker',1,180]); context=await rpc('academy_job_context',[job.id,job.leaseToken]);
assert(!context.input.attendees.some(person=>person.email==='student@example.test'));checks++;
await rpc('academy_complete_job',[job.id,job.leaseToken,{kind:'meeting_synced',meeting}]);
await owner(); await sql("update profiles set employment_status='active' where id=$1",[ids.student]);
await actor('admin'); await rpc('academy_set_rollout',['pilot',[ids.trainer]]);
await service(); [job]=await rpc('academy_claim_jobs',['staff-worker',1,180]); context=await rpc('academy_job_context',[job.id,job.leaseToken]);
assert.deepEqual(context.input.attendees.map(person=>person.email),['trainer-teams@example.test']);checks++;
await rpc('academy_complete_job',[job.id,job.leaseToken,{kind:'meeting_synced',meeting}]);
await actor('admin'); await rpc('academy_set_rollout',['open',[]]);
await service(); [job]=await rpc('academy_claim_jobs',['staff-worker',1,180]); context=await rpc('academy_job_context',[job.id,job.leaseToken]);
assert(context.input.attendees.some(person=>person.email==='student@example.test'));checks++;
await rpc('academy_complete_job',[job.id,job.leaseToken,{kind:'meeting_synced',meeting}]);
// A moderator who edited the scheduled dates cannot accept their own work.
await actor('trainer');const independentRun=await rpc('academy_create_run',[{courseId:course.course_id,versionId:next,title:'Independent dates',capacity:3}]);
await actor('admin'); await rpc('academy_save_session',[{...sessionInput,runId:independentRun}]);
assert.equal(await rpc('academy_can_review_run',[independentRun]),false);checks++;
await denied('select academy_publish_run($1)',[independentRun],/independent_admin_review_required/);
await actor(reviewer); await rpc('academy_publish_run',[independentRun]); checks++;
// Content editors see program but not another learner's enrollment details.
await actor('student'); assert.equal((await sql('select id from course_enrollments where run_id=$1 and user_id<>$2',[managed,ids.student])).rows.length,0);checks++;
await owner(); await sql("update profiles set employment_status='exited' where id=$1",[ids.student]);
await service(); assert.equal(await rpc('academy_can_edit_course_as',[course.course_id,ids.student]),false); checks++;

// A run-only instructor can answer a historical pinned program without self-enrollment.
const instructor='00000000-0000-0000-0000-000000000098';
await owner(); await sql("insert into auth.users(id,email)values($1,'instructor@example.test')",[instructor]); await sql("insert into profiles(id,role,email)values($1,'consultant','instructor@example.test')",[instructor]);
await actor('admin'); await rpc('academy_set_trainer',[instructor,true]);
await actor('trainer'); await rpc('academy_set_run_staff',[managed,instructor,true]);
await actor('other'); const qaEnrollment=(await rpc('academy_register_run',[managed])).enrollmentId;
const question=await rpc('academy_ask_question',[qaEnrollment,'How does this exact training version work?',null]);
await actor(instructor); assert.deepEqual((await rpc('academy_teaching_versions',[course.course_id])).map(version=>version.id),[next]);checks++;
assert.equal((await sql('select id from course_enrollments where user_id=$1',[instructor])).rows.length,0);checks++;
assert.equal(await rpc('academy_can_read_discussion',[question]),true);checks++;
assert.ok(await rpc('academy_answer_question',[question,'Answer by the assigned instructor without an enrollment.']));checks++;
assert.equal(await rpc('academy_can_preview_version',[course.version_id]),false);checks++;
await denied('select academy_ask_question($1,$2,null)',[qaEnrollment,'Cannot ask using another learner enrollment'],/own_enrollment_required/);
await actor('trainer'); await rpc('academy_set_run_staff',[managed,instructor,false]);
await actor(instructor); assert.equal(await rpc('academy_can_read_discussion',[question]),false);checks++;
await denied('select academy_answer_question($1,$2)',[question,'Cannot keep responding after assignment revocation'],/discussion_not_accessible/);

// Real concurrent writers run in hosted PostgreSQL; WASM execution is intentionally sequential.
if(f.engine==='postgres') {
 await owner();await sql("update profiles set employment_status='active' where id=$1",[ids.student]);
 await actor('trainer'); await rpc('academy_set_course_staff',[course.course_id,ids.other,'facilitator',false]);
 await rpc('academy_update_run',[managed,'Invitation budget race',498]);
 const a=await f.connectSession('trainer'); const b=await f.connectSession('trainer');
 const results=await Promise.allSettled([a.rpc('academy_set_run_staff',[managed,ids.student,true]),b.rpc('academy_update_run',[managed,'Race capacity',499])]);
 assert.equal(results.filter(result=>result.status==='fulfilled').length,1);checks++;
 await owner(); const budget=(await sql('select r.capacity+(select count(*) from academy_private.run_instructors(r.id,r.course_id)) total from course_runs r where id=$1',[managed])).rows[0].total;
 assert.equal(Number(budget),500);checks++;
 await actor('trainer'); await rpc('academy_set_run_staff',[managed,ids.student,false]);
 await actor('admin'); await rpc('academy_set_trainer',[ids.trainer,false]);
 await rpc('academy_update_run',[managed,'Trainer activation race',499]);
 const grant=await f.connectSession('admin'); const capacity=await f.connectSession('admin');
 const grantRace=await Promise.allSettled([
  grant.rpc('academy_set_trainer',[ids.trainer,true]),
  capacity.rpc('academy_update_run',[managed,'Concurrent capacity',500]),
 ]);
 assert.equal(grantRace.filter(result=>result.status==='fulfilled').length,1);checks++;
 await owner(); const postGrantBudget=(await sql('select r.capacity+(select count(*) from academy_private.run_instructors(r.id,r.course_id)) total from course_runs r where id=$1',[managed])).rows[0].total;
 assert.equal(Number(postGrantBudget),500);checks++;
 const first=await f.connectSession('admin'); const second=await f.connectSession('admin');
 const targets=await Promise.allSettled([
  first.rpc('academy_save_m365_identity',[{userId:ids.trainer,tenantId:tenant,objectId:trainerObject,verifiedEmail:'trainer-teams@example.test',invitationTarget:true}]),
  second.rpc('academy_save_m365_identity',[{userId:ids.trainer,tenantId:tenant,objectId:'66666666-6666-4666-8666-666666666666',verifiedEmail:'trainer-second@example.test',invitationTarget:true}]),
 ]);
 assert.equal(targets.filter(result=>result.status==='fulfilled').length,2);checks++;
 await owner(); const selected=(await sql('select count(*)::int n from academy_m365_identities where user_id=$1 and invitation_target',[ids.trainer])).rows[0].n;
 assert.equal(selected,1);checks++;
}
console.log(`PASS ${checks} staff scope, independent moderation, legacy and prerequisite assertions`);
await db.close();
