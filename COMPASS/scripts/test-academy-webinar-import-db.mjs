import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';
const fixture = await createAcademyDatabase({ activationBudget: true, materialProjection: true });
const { db, sql, actor, owner, rpc, ids } = fixture;
let checks = 0;
function equal(a, b) { assert.deepEqual(a, b); checks++; }
async function denied(...args) { await fixture.expectDenied(...args); checks++; }
const sourceHash = 'a'.repeat(64);
const future = h => new Date(Date.now() + h * 3600000).toISOString();
async function preview(run, rows, kind = 'registrations', session = null) { return rpc('academy_preview_webinar_import', [run, kind, rows, sourceHash, session]); }
async function makeRun(course, version, capacity = 100, publish = true) {
 await actor('trainer'); const run = await rpc('academy_create_run', [{ courseId: course, versionId: version, title: 'Imported webinar', capacity }]);
 const session = await rpc('academy_save_session', [{ runId: run, title: 'Existing Teams webinar', startsAt: future(24), endsAt: future(27), timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: 'https://teams.microsoft.com/meet/123', required: true }]);
 if (publish) { await actor('admin'); await rpc('academy_publish_run', [run]); }
 return { run, session };
}
try {
 await owner(); await db.exec('CREATE TABLE public.contractors(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text,full_name text,profile_id uuid REFERENCES profiles(id));');
 const dir=new URL('../supabase/migrations/',import.meta.url);
 const matches=(await fs.readdir(dir)).filter(name=>name.endsWith('_academy_webinar_import.sql'));
 assert.equal(matches.length,1,'webinar migration must be unambiguous');
 await db.exec(await fs.readFile(new URL(matches[0],dir),'utf8'));
 await actor('admin'); await rpc('academy_set_rollout', ['open', []]); await rpc('academy_set_trainer', [ids.trainer, true]);
 await actor('trainer'); const { course_id: course, version_id: version } = await rpc('academy_create_course', [{ title: 'Cybersecurity imported webinar', category: 'IT', delivery_mode: 'live' }]);
 await rpc('academy_update_course', [course, { completion_rules: { quiz_required: false, require_all_lessons: false, attendance_percent: 80 } }]);
 await rpc('academy_submit_for_review', [course]); await actor('admin'); const token = (await sql('select submission_id from course_versions where id=$1', [version])).rows[0].submission_id; await rpc('academy_review_course', [version, true, null, token]);
 const { run, session } = await makeRun(course, version, 96);
 await owner(); await sql('insert into contractors(email,full_name,profile_id) values($1,$2,$3)', ['contract.student@example.test', 'Student contract', ids.student]);
 const rows = Array.from({ length: 96 }, (_, i) => ({ email: i === 0 ? 'contract.student@example.test' : `external${i}@example.test`, fullName: `Registered ${i}` }));
 await actor('admin'); const batch = await preview(run, rows); equal(batch.rows.length, 96); equal(batch.rows[0].userId, ids.student); equal(batch.rows[1].match, 'unmatched');
 equal((await sql('select count(*)::int n from academy_webinar_roster')).rows[0].n, 0);
 const result = await rpc('academy_commit_webinar_import', [batch.id, {}]); equal(result.created, 96); equal(result.linked, 1);
 equal((await rpc('academy_list_runs', [null, run]))[0].confirmedCount, 96);
 equal((await rpc('academy_list_runs_page', [null, 0, 20, 'managed', null, null, null])).find(x => x.id === run).confirmedCount, 96);
 equal((await rpc('academy_commit_webinar_import', [batch.id, {}])).alreadyCommitted, true);
 const repeated = await preview(run, rows); equal((await rpc('academy_commit_webinar_import', [repeated.id, {}])).alreadyCommitted, true);
 equal((await sql('select count(*)::int n from academy_webinar_roster where run_id=$1', [run])).rows[0].n, 96);
 const changed = await preview(run, [{ email: 'another@example.test', fullName: 'No place' }]); await denied('select academy_commit_webinar_import($1,$2)', [changed.id, {}], /Limit miejsc/);
 equal((await sql('select count(*)::int n from academy_webinar_roster where run_id=$1', [run])).rows[0].n, 96);
 await denied('select academy_update_run($1,$2,$3)', [run, 'Too small', 95], /Limit miejsc/);
 await actor('other'); equal((await rpc('academy_register_run', [run])).status, 'waitlisted');
 await denied('select academy_webinar_roster($1)', [run], /administrator/); equal((await sql('select id from academy_webinar_roster')).rows, []);
 await actor('trainer'); await denied('select academy_commit_webinar_import($1,$2)', [batch.id, {}], /administrator/);
 await actor('', 'anon'); await denied('select academy_webinar_roster($1)', [run]);
 await actor('student'); await rpc('academy_cancel_registration', [run]);
 await actor('admin'); equal((await rpc('academy_list_runs', [null, run]))[0].confirmedCount, 96);
 equal((await rpc('academy_webinar_roster', [run])).find(x => x.userId === ids.student).status, 'cancelled');
 equal((await sql('select status from course_run_registrations where run_id=$1 and user_id=$2', [run, ids.other])).rows[0].status, 'confirmed');
 // Immutable preview identity: a newly verified competing alias invalidates it.
 const { run: ambiguousRun } = await makeRun(course, version, 5);
 const ambRows = [{ email: 'student@example.test', fullName: 'No name-based matching' }]; await actor('admin'); const identityBatch = await preview(ambiguousRun, ambRows);
 await owner(); await sql('insert into academy_m365_identities(user_id,tenant_id,object_id,verified_email,verified_by) values($1,$2,$3,$4,$5)', [ids.other, '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222', 'student@example.test', ids.admin]);
 await actor('admin'); await denied('select academy_commit_webinar_import($1,$2)', [identityBatch.id, {}], /Mapowanie/);
 const amb = await preview(ambiguousRun, ambRows); equal(amb.rows[0].match, 'ambiguous'); await denied('select academy_commit_webinar_import($1,$2)', [amb.id, {}], /Wybierz konto/);
 await denied('select academy_commit_webinar_import($1,$2)', [amb.id, { 'student@example.test': ids.trainer }], /zweryfikowanego/);
 equal((await rpc('academy_commit_webinar_import', [amb.id, { 'student@example.test': ids.student }])).linked, 1);
 // Draft import reserves places and enrolls mapped eligible accounts on independent publication.
 const { run: draftRun } = await makeRun(course, version, 2, false); await actor('admin'); const draft = await preview(draftRun, [{ email: 'other@example.test', fullName: 'Other' }]); await rpc('academy_commit_webinar_import', [draft.id, {}]);
 equal((await sql('select count(*)::int n from course_run_registrations where run_id=$1', [draftRun])).rows[0].n, 0);
 await rpc('academy_publish_run', [draftRun]); equal((await sql('select status from course_run_registrations where run_id=$1', [draftRun])).rows[0].status, 'confirmed');
 // Separate external attendance and linked Compass completion share a real window.
 const { run: attendedRun, session: attendedSession } = await makeRun(course, version, 4); await actor('admin'); const registrations = await preview(attendedRun, [{ email: 'student@example.test', fullName: 'Student' }, { email: 'outside@example.test', fullName: 'Outside' }]);
 await rpc('academy_commit_webinar_import', [registrations.id, { 'student@example.test': ids.student }]);
 const start = future(-4); const end = future(-1);
 await owner(); await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1', [attendedSession, start, end]); await actor('trainer'); await rpc('academy_confirm_session_window', [attendedSession, start, end]);
 await actor('admin'); const attendanceRows = [{ email: 'student@example.test', fullName: 'Student', intervals: [{ start, end }, { start, end }] }, { email: 'outside@example.test', fullName: 'Outside', intervals: [{ start, end }] }];
 const att = await preview(attendedRun, attendanceRows, 'attendance', attendedSession); equal(att.rows[0].attendedSeconds, 10800);
 const attResult = await rpc('academy_commit_webinar_import', [att.id, { 'student@example.test': ids.student }]); equal(attResult.attendance, 2);
 equal((await sql('select attended_seconds from session_attendance where session_id=$1', [attendedSession])).rows[0].attended_seconds, 10800);
 equal((await sql('select count(*)::int n from academy_webinar_attendance where session_id=$1', [attendedSession])).rows[0].n, 2);
 const badAttendance = [{ email: 'outside@example.test', fullName: 'Outside', intervals: [{ start: future(48), end: future(49) }] }]; await denied('select academy_preview_webinar_import($1,$2,$3,$4,$5)', [attendedRun, 'attendance', badAttendance, sourceHash, attendedSession], /okna/);
 // Native Teams summary reports carry actual duration, never reconnect span.
 const summaryRows = [{ email: 'outside@example.test', fullName: 'Outside', intervals: [{ start, end }], evidence: 'summary', reportedSeconds: 600 }];
 const summary = await preview(attendedRun, summaryRows, 'attendance', attendedSession); equal(summary.rows[0].attendedSeconds, 600);
 await rpc('academy_commit_webinar_import', [summary.id, {}]);
 equal((await sql('select attended_seconds,status from academy_webinar_attendance where session_id=$1 and roster_id=(select id from academy_webinar_roster where run_id=$2 and email=$3)', [attendedSession, attendedRun, 'outside@example.test'])).rows[0], { attended_seconds: 600, status: 'insufficient' });
 await denied('select academy_preview_webinar_import($1,$2,$3,$4,$5)', [attendedRun, 'attendance', [{ ...summaryRows[0], intervals: [{ start: future(-5), end }] }], sourceHash, attendedSession], /wykracza/);
 // Reconfirming the same window resets machine attendance; a new reviewed preview must restore it.
 const { run: recoveryRun, session: recoverySession } = await makeRun(course, version, 2); await actor('admin');
 const recoveryRegistration = await preview(recoveryRun, [{ email: 'student@example.test', fullName: 'Student' }]);
 await rpc('academy_commit_webinar_import', [recoveryRegistration.id, { 'student@example.test': ids.student }]);
 await owner(); await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1', [recoverySession, start, end]);
 await actor('trainer'); await rpc('academy_confirm_session_window', [recoverySession, start, end]);
 await actor('admin'); const recoveryRows = [{ email: 'student@example.test', fullName: 'Student', intervals: [{ start, end }], evidence: 'summary', reportedSeconds: 600 }];
 const beforeReset = await preview(recoveryRun, recoveryRows, 'attendance', recoverySession); await rpc('academy_commit_webinar_import', [beforeReset.id, { 'student@example.test': ids.student }]);
 equal((await sql('select count(*)::int n from session_attendance where session_id=$1', [recoverySession])).rows[0].n, 1);
 await actor('trainer'); await rpc('academy_confirm_session_window', [recoverySession, start, end]);
 equal((await sql('select count(*)::int n from session_attendance where session_id=$1', [recoverySession])).rows[0].n, 0);
 await actor('admin'); const afterReset = await preview(recoveryRun, recoveryRows, 'attendance', recoverySession);
 equal((await rpc('academy_commit_webinar_import', [afterReset.id, { 'student@example.test': ids.student }])).alreadyCommitted, false);
 equal((await sql('select attended_seconds from session_attendance where session_id=$1', [recoverySession])).rows[0].attended_seconds, 600);
 // Manual decisions and certificates are immutable even when a later imported report differs.
 const recoveryEnrollment = (await sql('select enrollment_id from course_run_registrations where run_id=$1 and user_id=$2', [recoveryRun, ids.student])).rows[0].enrollment_id;
 await actor('trainer'); await rpc('academy_record_attendance', [{ sessionId: recoverySession, enrollmentId: recoveryEnrollment, status: 'insufficient', attendedSeconds: 600, note: 'Verified manual attendance decision' }]);
 await actor('admin'); const manualRetry = await preview(recoveryRun, [{ ...recoveryRows[0], reportedSeconds: 500 }], 'attendance', recoverySession);
 equal((await rpc('academy_commit_webinar_import', [manualRetry.id, { 'student@example.test': ids.student }])).preserved, 1);
 equal((await sql('select source,attended_seconds from session_attendance where session_id=$1', [recoverySession])).rows[0], { source: 'manual', attended_seconds: 600 });
 const certRetry = await preview(attendedRun, [{ email: 'student@example.test', fullName: 'Student', intervals: [{ start, end }], evidence: 'summary', reportedSeconds: 500 }], 'attendance', attendedSession);
 equal((await rpc('academy_commit_webinar_import', [certRetry.id, { 'student@example.test': ids.student }])).preserved, 1);
 equal((await sql('select attended_seconds from session_attendance where session_id=$1', [attendedSession])).rows[0].attended_seconds, 10800);
 // A new verified match is a new reviewed reconciliation; identical replay remains idempotent.
 const { run: reconciliationRun } = await makeRun(course, version, 2); await actor('admin');
 const reconciliationRows = [{ email: 'new.alias@example.test', fullName: 'Later verified' }];
 const initial = await preview(reconciliationRun, reconciliationRows); await rpc('academy_commit_webinar_import', [initial.id, {}]);
 await owner(); await sql('insert into academy_m365_identities(user_id,tenant_id,object_id,verified_email,verified_by)values($1,$2,$3,$4,$5)', [ids.student, '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'new.alias@example.test', ids.admin]);
 await actor('admin'); const reconciliation = await preview(reconciliationRun, reconciliationRows); equal(reconciliation.rows[0].userId, ids.student);
 equal((await rpc('academy_commit_webinar_import', [reconciliation.id, {}])).linked, 1);
 equal((await rpc('academy_webinar_roster', [reconciliationRun]))[0].userId, ids.student);
 equal((await sql('select count(*)::int n from academy_webinar_roster where run_id=$1', [reconciliationRun])).rows[0].n, 1);
 const unchanged = await preview(reconciliationRun, reconciliationRows); equal((await rpc('academy_commit_webinar_import', [unchanged.id, {}])).alreadyCommitted, true);
 // Mail merge uses contractual addresses, never a Teams email fallback.
 const exportResult = await rpc('academy_export_webinar_mailing_list', [ambiguousRun]); equal(exportResult.rows[0].email, 'contract.student@example.test');
 const outside = (await rpc('academy_webinar_roster', [attendedRun])).find(x => x.email === 'outside@example.test');
 equal((await rpc('academy_export_webinar_mailing_list', [attendedRun])).excludedMissingEmail, 1);
 await rpc('academy_verify_webinar_contractual_email', [outside.id, 'contract.outside@example.test', 'Verified against B2B contract document']);
 equal((await rpc('academy_export_webinar_mailing_list', [attendedRun])).excludedMissingEmail, 0);
 // Direct writes are forbidden; only the guarded atomic RPC can apply a batch.
 await denied('insert into academy_webinar_roster(run_id,email,full_name,created_by)values($1,$2,$3,$4)', [run, 'evil@example.test', 'Evil', ids.admin]);
 equal((await sql("select has_function_privilege('anon','public.academy_commit_webinar_import(uuid,jsonb)','EXECUTE') allowed")).rows[0].allowed, false);
 await owner(); equal((await sql("select count(*)::int n from pg_proc where pronamespace='academy_private'::regnamespace and proname like 'webinar_%' and has_function_privilege('authenticated',oid,'EXECUTE')")).rows[0].n, 0);
 // Two administrator sessions cannot apply the same snapshot twice or overbook one remaining seat.
 if (fixture.engine === 'postgres') {
  const { run: raceRun } = await makeRun(course, version, 1); await actor('admin');
  const raceA = await preview(raceRun, [{ email: 'race@example.test', fullName: 'Race' }]);
  const raceB = await preview(raceRun, [{ email: 'race@example.test', fullName: 'Race' }]);
  const connectionA = await fixture.connectSession('admin'); const connectionB = await fixture.connectSession('admin');
  try {
   const results = await Promise.all([connectionA.rpc('academy_commit_webinar_import', [raceA.id, {}]), connectionB.rpc('academy_commit_webinar_import', [raceB.id, {}])]);
   equal(results.filter(result => result.alreadyCommitted).length, 1);
   equal((await sql('select count(*)::int n from academy_webinar_roster where run_id=$1', [raceRun])).rows[0].n, 1);
   const { run: capacityRace } = await makeRun(course, version, 1); await actor('admin');
   const overflowA = await preview(capacityRace, [{ email: 'raceA@example.test', fullName: 'A' }]);
   const overflowB = await preview(capacityRace, [{ email: 'raceB@example.test', fullName: 'B' }]);
   const overflow = await Promise.allSettled([connectionA.rpc('academy_commit_webinar_import', [overflowA.id, {}]), connectionB.rpc('academy_commit_webinar_import', [overflowB.id, {}])]);
   equal(overflow.filter(result => result.status === 'fulfilled').length, 1);
   equal((await sql('select count(*)::int n from academy_webinar_roster where run_id=$1', [capacityRace])).rows[0].n, 1);
  } finally { await connectionA.db.close(); await connectionB.db.close(); }
 }
 console.log(`Academy webinar import DB: ${checks} checks passed (${fixture.engine}).`);
} finally { await db.close(); }
