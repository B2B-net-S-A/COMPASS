// Native SQL/RLS and durable-worker contract gate. No external services or real meetings.
import assert from 'node:assert/strict';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';
process.on('uncaughtException', error => {
    console.error({ error: error.message, where: error.where, query: error.query }); process.exit(1);
});
const fixture = await createAcademyDatabase({ materials: true, live: true });
const { db, ids, query: sql, actor, owner, service, rpc } = fixture;
let checks = 0;
const equal = (a,b) => { assert.deepEqual(a,b); checks++; };
const denied = async (...args) => { await fixture.expectDenied(...args); checks++; };
const tenant = '11111111-1111-4111-8111-111111111111';
const object = '22222222-2222-4222-8222-222222222222';
const tomorrow = new Date(Date.now()+86400000).toISOString();
const tomorrowEnd = new Date(Date.now()+90000000).toISOString();
const link = 'https://teams.microsoft.com/meet/123456789?p=secret';
const sessionInput = { title:'Live session', startsAt:tomorrow, endsAt:tomorrowEnd, timeZone:'Europe/Warsaw', mode:'external_link', externalJoinUrl:link, required:true };

await actor('admin'); await rpc('academy_set_trainer',[ids.trainer,true]);
const organizer=await rpc('academy_save_organizer',[{profileId:ids.internal,tenantId:tenant,objectId:object,enabled:true}]);
equal((await rpc('academy_organizer_candidates',['internal']))[0].id,ids.internal);
await actor('trainer');
const {course_id:course,version_id:version}=await rpc('academy_create_course',[{title:'Live training',category:'IT',delivery_mode:'live'}]);
await rpc('academy_update_course',[course,{completion_rules:{quiz_required:false,require_all_lessons:false,attendance_percent:80}}]);
await denied('select academy_create_run($1)',[{courseId:course,versionId:version,title:'Unapproved',capacity:1}]);
await rpc('academy_submit_for_review',[course]);
await actor('admin'); await rpc('academy_review_course',[version,true,null]);
await actor('trainer');
const run=await rpc('academy_create_run',[{courseId:course,versionId:version,title:'Edition one',capacity:1}]);
const session=await rpc('academy_save_session',[{...sessionInput,runId:run}]);
await denied('select academy_publish_run($1)',[run]);
await denied('select academy_save_session($1)',[{...sessionInput,runId:run,externalJoinUrl:'https://teams.microsoft.com.evil.test/meet/123'}]);
await denied('select academy_save_session($1)',[{...sessionInput,runId:run,startsAt:new Date(Date.now()-60000).toISOString()}]);
await actor('student'); equal(await rpc('academy_list_runs',[course,null]),[]);
await denied('select academy_register_run($1)',[run]);
await denied('select academy_claim_jobs($1,1,60)',['malicious']);
await denied('select academy_job_context($1,$2)',[run,run]);
await denied('select * from academy_session_integrations');
await denied('select * from academy_attendance_reports');
await denied('insert into course_run_registrations(run_id,user_id,status)values($1,$2,$3)',[run,ids.student,'waitlisted']);
await actor('admin'); await rpc('academy_publish_run',[run]);
equal((await sql("select has_column_privilege('authenticated','public.course_sessions','external_join_url','select') allowed")).rows[0].allowed,false);
equal((await sql("select has_column_privilege('authenticated','public.course_sessions','meeting_mode','select') allowed")).rows[0].allowed,true);
equal((await sql("select meeting_mode from course_sessions where run_id=$1 and status='scheduled'",[run])).rows[0].meeting_mode,'external_link');
await actor('student'); equal((await rpc('academy_list_runs',[course,run]))[0].sessions[0].joinUrl,null);
equal((await sql('select id from course_sessions where id=$1',[session])).rows.length,0);
const registration=await rpc('academy_register_run',[run]);
equal(registration.status,'confirmed'); equal(await rpc('academy_register_run',[run]),registration);
equal((await rpc('academy_list_runs',[course,run]))[0].sessions[0].joinUrl,link);
await denied('select external_join_url from course_sessions where id=$1',[session]);
const calendarBefore=await rpc('academy_session_calendar',[session]); equal(calendarBefore.joinUrl,link);
equal(await rpc('academy_enrollment_has_access',[registration.enrollmentId]),true);
await denied('select academy_run_participants($1)',[run]);
await actor('other'); const waiting=await rpc('academy_register_run',[run]); equal(waiting.status,'waitlisted'); equal(waiting.enrollmentId,null);
equal((await rpc('academy_list_runs',[course,run]))[0].sessions[0].joinUrl,null);
await denied('select academy_session_calendar($1)',[session]);
await service(); equal(await rpc('academy_dispatch_reminders',[500]),1); equal(await rpc('academy_dispatch_reminders',[500]),0);
await actor('trainer'); await denied('select academy_update_run($1,$2,0)',[run,'Capacity']);
await actor('student'); await rpc('academy_cancel_registration',[run]);
equal(await rpc('academy_enrollment_has_access',[registration.enrollmentId]),false);
equal((await rpc('academy_list_runs',[course,run]))[0].sessions[0].joinUrl,null);
const calendarCancelled=await rpc('academy_session_calendar',[session]); equal(calendarCancelled.status,'cancelled'); equal(calendarCancelled.joinUrl,null);
assert(calendarCancelled.revision>calendarBefore.revision); checks++;
await actor('other'); const promoted=(await rpc('academy_list_runs',[course,run]))[0].myRegistration;
equal(promoted.status,'confirmed'); assert(promoted.enrollmentId); checks++;
equal(promoted.completedAt,null);
await actor('student'); equal((await rpc('academy_register_run',[run])).status,'waitlisted');
await actor('trainer'); await rpc('academy_update_run',[run,'Edition one',2]);
await actor('student'); equal((await rpc('academy_list_runs',[course,run]))[0].myRegistration.status,'confirmed');
equal((await rpc('academy_list_runs',[course,run]))[0].myRegistration.enrollmentId,registration.enrollmentId);
await actor('internal'); await denied('select academy_register_run($1)',[run]);

// Actual elapsed teaching time, manual review, completion audit and immutable certificate.
const started=new Date(Date.now()-7200000).toISOString(); const ended=new Date(Date.now()-3600000).toISOString();
await owner(); await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1',[session,started,ended]);
await actor('trainer'); await denied('select academy_record_attendance($1)',[{sessionId:session,enrollmentId:promoted.enrollmentId,status:'present',note:'Confirmed attendance'}]);
await rpc('academy_confirm_session_window',[session,started,ended]);
// Unknown duration is not 100% attendance and cannot create a completion.
for(const status of ['present','insufficient']) {
    for(const duration of [{},{attendedSeconds:null},{attendedSeconds:'2880'}]) {
        await denied('select academy_record_attendance($1)',[{sessionId:session,enrollmentId:promoted.enrollmentId,status,note:'Time has not been verified',...duration}],/potwierdzony czas/);
    }
}
await owner();
equal((await sql('select count(*)::int n from session_attendance where enrollment_id=$1',[promoted.enrollmentId])).rows[0].n,0);
equal((await sql('select count(*)::int n from course_completions where enrollment_id=$1',[promoted.enrollmentId])).rows[0].n,0);
await actor('trainer');
equal((await rpc('academy_record_attendance',[{sessionId:session,enrollmentId:promoted.enrollmentId,status:'insufficient',attendedSeconds:1800,note:'Verified participant attended half the class'}])).completed,false);
await denied('select academy_record_attendance($1)',[{sessionId:session,enrollmentId:promoted.enrollmentId,status:'present',note:'Cannot infer full attendance from a missing time'}],/potwierdzony czas/);
equal((await sql('select status,attended_seconds from session_attendance where enrollment_id=$1',[promoted.enrollmentId])).rows[0],{status:'insufficient',attended_seconds:1800});
await denied('select academy_record_attendance($1)',[{sessionId:session,enrollmentId:promoted.enrollmentId,status:'present',attendedSeconds:100,note:'Too short'}]);
await denied('select academy_record_attendance($1)',[{sessionId:session,enrollmentId:promoted.enrollmentId,status:'present',note:'x'}]);
const complete=await rpc('academy_record_attendance',[{sessionId:session,enrollmentId:promoted.enrollmentId,status:'present',attendedSeconds:2880,note:'Verified external Teams attendance'}]);
equal(complete.completed,true);
await owner();
const evidence=(await sql("select details from academy_audit_events where action='ACADEMY_ATTENDANCE_REVIEWED' and details->>'enrollment_id'=$1 and details->>'status'='present'",[promoted.enrollmentId])).rows[0].details;
equal(evidence.attended_seconds,2880);equal(evidence.teaching_duration_seconds,3600);equal(evidence.attendance_percent_required,80);
await actor('trainer');
await denied('select academy_record_attendance($1)',[{sessionId:session,enrollmentId:promoted.enrollmentId,status:'insufficient',attendedSeconds:0,note:'Do not silently revoke certificate'}]);
await denied('select academy_cancel_run($1,$2)',[run,'Cannot cancel a certified run']);
await actor('other'); assert((await rpc('academy_list_runs',[course,run]))[0].myRegistration.completedAt); checks++;
equal(await rpc('academy_enrollment_has_access',[promoted.enrollmentId]),true);
await denied('select academy_cancel_registration($1)',[run]);

// Two workers cannot claim a second job for the same session; obsolete results retain remote IDs.
await actor('trainer'); const managed=await rpc('academy_create_run',[{courseId:course,versionId:version,title:'Managed run',capacity:2}]);
const managedInput={...sessionInput,runId:managed,mode:'managed_teams',organizerId:organizer,externalJoinUrl:null};
const managedSession=await rpc('academy_save_session',[managedInput]);
await denied('select academy_update_run($1,$2,500)',[managed,'Too many Graph invitees']);
await actor('admin'); await rpc('academy_publish_run',[managed]);
await service(); const [job]=await rpc('academy_claim_jobs',['worker-a',1,180]);
equal(job.sessionId,managedSession); equal(await rpc('academy_job_lease_current',[job.id,job.leaseToken]),true);
const context=await rpc('academy_job_context',[job.id,job.leaseToken]); equal(context.organizerEnabled,true); equal(context.input.organizer.userId,object);
await actor('trainer'); await rpc('academy_save_session',[{...managedInput,id:managedSession,title:'Updated during create'}]);
await service(); equal(await rpc('academy_claim_jobs',['worker-b',5,180]),[]);
await denied('select academy_complete_job($1,$2,$3)',[job.id,run,{kind:'meeting_synced'}]);
const meeting={eventId:'remote-event',joinUrl:link,transactionId:'stable-marker',organizerId:object};
await rpc('academy_complete_job',[job.id,job.leaseToken,{kind:'meeting_synced',meeting}]);
equal((await sql('select event_id from academy_session_integrations where session_id=$1',[managedSession])).rows[0].event_id,'remote-event');
equal((await sql('select sync_status from course_sessions where id=$1',[managedSession])).rows[0].sync_status,'pending');
const [revisionJob]=await rpc('academy_claim_jobs',['worker-b',1,180]); equal(revisionJob.revision,2);
await rpc('academy_fail_job',[revisionJob.id,revisionJob.leaseToken,'throttled','retry',new Date(Date.now()+3600000).toISOString()]);
equal(await rpc('academy_claim_jobs',['worker-a',1,180]),[]);
await actor('trainer'); await rpc('academy_retry_integration',[revisionJob.id]);
await service(); const [retryJob]=await rpc('academy_claim_jobs',['worker-c',1,180]); equal(retryJob.attempt,1);
await rpc('academy_complete_job',[retryJob.id,retryJob.leaseToken,{kind:'meeting_synced',meeting}]);
equal((await sql('select sync_status from course_sessions where id=$1',[managedSession])).rows[0].sync_status,'ready');
await actor('trainer'); await rpc('academy_cancel_run',[managed,'Training postponed by owner']);
await service(); const [cancelJob]=await rpc('academy_claim_jobs',['worker-d',1,180]); equal(cancelJob.kind,'cancel_meeting');
await owner(); await sql("update academy_integration_jobs set lease_expires_at=now()-interval '1 second' where id=$1",[cancelJob.id]);
await service(); const [reclaimed]=await rpc('academy_claim_jobs',['worker-e',1,180]); assert.notEqual(reclaimed.leaseToken,cancelJob.leaseToken); checks++;
await denied('select academy_complete_job($1,$2,$3)',[cancelJob.id,cancelJob.leaseToken,{kind:'meeting_cancelled'}]);
await rpc('academy_complete_job',[reclaimed.id,reclaimed.leaseToken,{kind:'meeting_cancelled'}]);
equal((await sql('select sync_status from course_sessions where id=$1',[managedSession])).rows[0].sync_status,'cancelled');

await actor('student'); await denied('select academy_save_m365_identity($1)',[{userId:ids.student,tenantId:tenant,objectId:object}]);
await actor('admin'); await rpc('academy_save_m365_identity',[{userId:ids.student,tenantId:tenant,objectId:object,verifiedEmail:'external@example.test'}]);
await denied('select academy_save_m365_identity($1)',[{userId:ids.other,tenantId:tenant,objectId:object}]);
const [identity]=await rpc('academy_list_m365_identities',['student']); equal(identity.verifiedEmail,'external@example.test');
await rpc('academy_remove_m365_identity',[identity.id,'Wrong verified account']); equal(await rpc('academy_list_m365_identities',['student']),[]);
await owner(); equal((await sql('select count(*)::int n from course_completions where enrollment_id=$1',[promoted.enrollmentId])).rows[0].n,1);

// Self-attestation and raw-evidence retention are separate from aggregate completion.
await actor('trainer'); const ownRun=await rpc('academy_create_run',[{courseId:course,versionId:version,title:'Self attendance guard',capacity:2}]);
const ownSession=await rpc('academy_save_session',[{...sessionInput,runId:ownRun}]);
await actor('admin'); await rpc('academy_publish_run',[ownRun]);
await actor('trainer'); const ownReg=await rpc('academy_register_run',[ownRun]);
await owner(); await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1',[ownSession,started,ended]);
await actor('trainer'); await rpc('academy_confirm_session_window',[ownSession,started,ended]);
await denied('select academy_record_attendance($1)',[{sessionId:ownSession,enrollmentId:ownReg.enrollmentId,status:'present',note:'Self attendance is forbidden'}]);
await denied('select academy_purge_attendance_reports(90)');
await service(); await sql("insert into academy_attendance_reports(session_id,report_id,evidence,imported_at) values($1,'old','{}',now()-interval '100 days'),($1,'fresh','{}',now())",[ownSession]);
equal(await rpc('academy_purge_attendance_reports',[90]),1); equal(await rpc('academy_purge_attendance_reports',[90]),0);
equal((await sql('select count(*)::int n from academy_attendance_reports where session_id=$1',[ownSession])).rows[0].n,1);
equal((await sql("select details->>'count' n from academy_audit_events where action='ACADEMY_RAW_ATTENDANCE_PURGED'")).rows[0].n,'1');
await denied('select academy_purge_attendance_reports(1)');

// Imported attendance commits evidence, manual-override preservation, certificate and ACK together.
await actor('trainer'); const autoRun=await rpc('academy_create_run',[{courseId:course,versionId:version,title:'Automatic attendance',capacity:3}]);
const autoSession=await rpc('academy_save_session',[{...managedInput,runId:autoRun}]);
await actor('admin'); await rpc('academy_publish_run',[autoRun]);
await actor('student'); const autoStudent=await rpc('academy_register_run',[autoRun]);
await actor('other'); const autoOther=await rpc('academy_register_run',[autoRun]);
await service(); const [autoMeetingJob]=await rpc('academy_claim_jobs',['auto-meeting',5,180]);
equal(autoMeetingJob.sessionId,autoSession); equal(autoMeetingJob.revision,3);
equal((await sql("select count(*)::int n from academy_integration_jobs where session_id=$1 and status='skipped'",[autoSession])).rows[0].n,2);
await rpc('academy_complete_job',[autoMeetingJob.id,autoMeetingJob.leaseToken,{kind:'meeting_synced',meeting:{...meeting,eventId:'auto-event'}}]);
await owner(); await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1',[autoSession,started,ended]);
await actor('trainer'); await rpc('academy_confirm_session_window',[autoSession,started,ended]);
await rpc('academy_record_attendance',[{sessionId:autoSession,enrollmentId:autoOther.enrollmentId,status:'insufficient',attendedSeconds:60,note:'Verified participant left early'}]);
await owner(); await sql('update academy_integration_jobs set available_at=now() where session_id=$1',[autoSession]);
await service(); const [attendanceJob]=await rpc('academy_claim_jobs',['auto-attendance',5,180]); equal(attendanceJob.kind,'sync_attendance');
await rpc('academy_complete_job',[attendanceJob.id,attendanceJob.leaseToken,{kind:'attendance_synced',onlineMeetingId:'online-meeting',
    reports:[{id:'report',startDateTime:started,endDateTime:ended,records:[]}],evaluation:{decisions:[
        {profileId:ids.student,status:'present',attendedSeconds:3600,reportIds:['report']},
        {profileId:ids.other,status:'present',attendedSeconds:3600,reportIds:['report']},
    ],unmatched:[]}}]);
assert((await sql('select completed_at from course_enrollments where id=$1',[autoStudent.enrollmentId])).rows[0].completed_at); checks++;
equal((await sql('select completed_at from course_enrollments where id=$1',[autoOther.enrollmentId])).rows[0].completed_at,null);
equal((await sql('select source,status from session_attendance where session_id=$1 and enrollment_id=$2',[autoSession,autoOther.enrollmentId])).rows[0],{source:'manual',status:'insufficient'});
equal((await sql('select status from academy_integration_jobs where id=$1',[attendanceJob.id])).rows[0].status,'done');
equal((await sql('select count(*)::int n from academy_attendance_reports where session_id=$1',[autoSession])).rows[0].n,1);

if (fixture.engine==='postgres') {
    const student=await fixture.connectSession('student'); const other=await fixture.connectSession('other');
    const workerA=await fixture.connectSession('', 'service_role'); const workerB=await fixture.connectSession('', 'service_role');
    await actor('trainer'); const raceRun=await rpc('academy_create_run',[{courseId:course,versionId:version,title:'Last seat race',capacity:1}]);
    await rpc('academy_save_session',[{...sessionInput,runId:raceRun}]);
    await actor('admin'); await rpc('academy_publish_run',[raceRun]);
    const seats=await Promise.all([student.rpc('academy_register_run',[raceRun]),other.rpc('academy_register_run',[raceRun])]);
    equal(seats.map(r=>r.status).sort(),['confirmed','waitlisted']);
    const winner=seats[0].status==='confirmed'?student:other;
    const waiter=winner===student?other:student;
    await Promise.all([winner.rpc('academy_cancel_registration',[raceRun]),waiter.rpc('academy_register_run',[raceRun])]);
    await service(); equal((await sql("select count(*)::int n from course_run_registrations where run_id=$1 and status='confirmed'",[raceRun])).rows[0].n,1);
    await actor('trainer'); const workerRun=await rpc('academy_create_run',[{courseId:course,versionId:version,title:'Concurrent workers',capacity:1}]);
    const workerSession=await rpc('academy_save_session',[{...managedInput,runId:workerRun}]);
    await actor('admin'); await rpc('academy_publish_run',[workerRun]);
    await actor('trainer'); await rpc('academy_save_session',[{...managedInput,runId:workerRun,id:workerSession,title:'Second revision'}]);
    const claims=await Promise.all([workerA.rpc('academy_claim_jobs',['parallel-a',20,180]),workerB.rpc('academy_claim_jobs',['parallel-b',20,180])]);
    const claimed=claims.flat().filter(j=>j.sessionId===workerSession);
    equal(claimed.length,1);
    // Author edit and remote-success ACK execute on different connections and take the same lock order.
    const author=await fixture.connectSession('trainer');
    await Promise.all([
        author.rpc('academy_save_session',[{...managedInput,runId:workerRun,id:workerSession,title:'Third revision'}]),
        workerA.rpc('academy_complete_job',[claimed[0].id,claimed[0].leaseToken,{kind:'meeting_synced',meeting:{...meeting,eventId:'parallel-event'}}]),
    ]);
    await service(); equal((await sql('select event_id from academy_session_integrations where session_id=$1',[workerSession])).rows[0].event_id,'parallel-event');
    equal((await sql('select revision from course_sessions where id=$1',[workerSession])).rows[0].revision,3);
    console.log('PASS real PostgreSQL concurrent last-seat/FIFO and SKIP LOCKED/author-worker races');
} else console.log('Real multiple-connection races run only in the hosted PostgreSQL gate.');
console.log(`PASS ${checks} live SQL, permissions, capacity/FIFO, completion and worker contract assertions`);
await db.close();
