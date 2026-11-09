// B3.6: rows that cannot be imported become exceptions instead of aborting the file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const f = await createAcademyDatabase({ patrykCycle: true });
const { db, ids, sql, actor, owner, rpc: fixtureRpc } = f;
const hash = 'b'.repeat(64);
const JSON_ARGS = { academy_preview_webinar_import_v2: [2, 3], academy_commit_webinar_import_v2: [1], academy_commit_webinar_import: [1], academy_preview_webinar_import: [2] };
const rpc = (name, args = []) => fixtureRpc(name, args.map((value, index) => (JSON_ARGS[name] ?? []).includes(index) && typeof value !== 'string' ? JSON.stringify(value) : value));
const denied = (statement, args, message) => f.expectDenied(statement, args, message);
let checks = 0;
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const future = h => new Date(Date.now() + h * 3600000).toISOString();

try {
 const dir = new URL('../supabase/migrations/', import.meta.url);
 const beforeBatchColumns = (await sql("select count(*)::int n from information_schema.columns where table_name='academy_webinar_import_batches'")).rows[0].n;
 for (const suffix of ['_academy_tcm_full_editor.sql', '_academy_webinar_import_exceptions.sql']) {
  const names = fs.readdirSync(dir).filter(n => n.endsWith(suffix));
  equal(names.length, 1, suffix);
  await db.exec(fs.readFileSync(new URL(names[0], dir), 'utf8'));
 }
 equal((await sql("select count(*)::int n from information_schema.columns where table_name='academy_webinar_import_batches'")).rows[0].n, beforeBatchColumns + 1);
 await owner(); await sql("insert into contractors(id,email,profile_id) values(gen_random_uuid(),'student@example.test',$1)", [ids.student]);
 await actor('admin'); await rpc('academy_set_rollout', ['open', []]); await rpc('academy_set_trainer', [ids.trainer, true]);
 await actor('trainer'); const { course_id: course, version_id: version } = await rpc('academy_create_course', [{ title: 'Exceptions course', category: 'IT', delivery_mode: 'live' }]);
 await rpc('academy_update_course', [course, { completion_rules: { quiz_required: false, require_all_lessons: false, attendance_percent: 80 } }]);
 await rpc('academy_submit_for_review', [course]); await actor('admin');
 const token = (await sql('select submission_id from course_versions where id=$1', [version])).rows[0].submission_id; await rpc('academy_review_course', [version, true, null, token]);
 await actor('trainer'); const run = await rpc('academy_create_run', [{ courseId: course, versionId: version, title: 'Exceptions run', capacity: 10 }]);
 const session = await rpc('academy_save_session', [{ runId: run, title: 'Teams', startsAt: future(24), endsAt: future(27), timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: 'https://teams.microsoft.com/meet/9', required: true }]);
 await actor('admin'); await rpc('academy_publish_run', [run]);

 // Registrations: a person cancelled in Compass used to abort the whole file.
 const preview = await rpc('academy_preview_webinar_import_v2', [run, 'registrations', [{ email: 'student@example.test', fullName: 'Student' }, { email: 'listed@example.test', fullName: 'Listed' }, { email: 'gone@example.test', fullName: 'Gone' }], [{ kind: 'missing_email', rowNumber: 5, fullName: 'Bez adresu', message: 'Wiersz 5' }], hash]);
 equal(preview.rows.length, 3); equal(preview.exceptions.length, 1); equal(preview.exceptionsAvailable, true);
 equal((await rpc('academy_commit_webinar_import_v2', [preview.id, {}])).created, 3);
 equal((await sql("select kind,status,full_name from academy_webinar_exceptions where run_id=$1", [run])).rows, [{ kind: 'missing_email', status: 'open', full_name: 'Bez adresu' }]);
 const gone = (await rpc('academy_webinar_roster', [run])).find(x => x.email === 'gone@example.test');
 await rpc('academy_cancel_webinar_registration', [gone.id, 'Rezygnacja zgłoszona organizatorowi.']);
 const second = await rpc('academy_preview_webinar_import_v2', [run, 'registrations', [{ email: 'gone@example.test', fullName: 'Gone' }, { email: 'new@example.test', fullName: 'New' }], [], hash]);
 equal(second.rows.map(x => x.email), ['new@example.test']);
 equal(second.exceptions.map(x => x.kind), ['cancelled_on_list']);

 // Replaying the same report does not duplicate open exceptions.
 const replay = await rpc('academy_preview_webinar_import_v2', [run, 'registrations', [{ email: 'listed@example.test', fullName: 'Listed' }], [{ kind: 'missing_email', rowNumber: 5, fullName: 'Bez adresu', message: 'Wiersz 5' }], hash]);
 await rpc('academy_commit_webinar_import_v2', [replay.id, {}]);
 equal((await sql('select count(*)::int n from academy_webinar_exceptions where run_id=$1', [run])).rows[0].n, 1);

 // Attendance: exclusions, people outside the list, and a join outside the class window.
 const start = future(-4); const end = future(-1);
 await owner(); await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1', [session, start, end]);
 await actor('trainer'); await rpc('academy_confirm_session_window', [session, start, end]);
 await actor('admin');
 await rpc('academy_set_webinar_excluded', [run, ' Trener@Example.test ', true, null]);
 equal(await rpc('academy_list_webinar_excluded', [run]), [{ email: 'trener@example.test', note: null }]);
 const whole = [{ start, end }];
 const rows = [
  { email: 'trener@example.test', fullName: 'Trener', intervals: whole, evidence: 'intervals' },
  { email: 'student@example.test', fullName: 'Student', intervals: whole, evidence: 'intervals' },
  { email: 'listed@example.test', fullName: 'Listed', intervals: [{ start: future(1), end: future(2) }], evidence: 'intervals' },
  { email: 'stranger@example.test', fullName: 'Stranger', intervals: whole, evidence: 'intervals' },
 ];
 const noAddress = { kind: 'missing_email', rowNumber: 9, fullName: 'Gość', message: 'Wiersz 9', intervals: whole };
 const attendance = await rpc('academy_preview_webinar_import_v2', [run, 'attendance', rows, [noAddress], hash, session]);
 equal(attendance.excludedCount, 1);
 equal(attendance.rows.map(x => x.email), ['student@example.test']);
 equal(attendance.exceptions.map(x => x.kind).sort(), ['missing_email', 'not_on_list', 'outside_window']);
 const committed = await rpc('academy_commit_webinar_import_v2', [attendance.id, {}]);
 equal(committed.attendance, 1); equal(committed.exceptions, 3);
 equal((await sql('select count(*)::int n from session_attendance where session_id=$1', [session])).rows[0].n, 1);

 // Every row an exception: no batch, nothing to approve, the reason stays visible.
 const none = await rpc('academy_preview_webinar_import_v2', [run, 'attendance', [], [noAddress], hash, session]);
 equal(none.id, null); equal(none.rows, []); equal(none.exceptions.length, 1);

 // Refusals: only editors, a reason, one target, an open exception.
 const list = await rpc('academy_list_webinar_exceptions', [run]);
 const guest = list.find(x => x.fullName === 'Gość');
 equal(guest.connections, 1); equal(guest.status, 'open');
 await denied('select academy_resolve_webinar_exception($1,$2,$3,$4,$5)', [guest.id, 'ignore', null, null, 'krótko'], /uzasadnienie/i); checks++;
 const listed = (await rpc('academy_webinar_roster', [run])).find(x => x.email === 'listed@example.test');
 await denied('select academy_resolve_webinar_exception($1,$2,$3,$4,$5)', [guest.id, 'assign', null, null, 'Organizator potwierdził tożsamość.'], /dokładnie jedną/); checks++;
 for (const who of ['student', 'trainer']) {
  await actor(who);
  await denied('select academy_list_webinar_exceptions($1)', [run], /administrator lub TCM/); checks++;
  await denied('select academy_resolve_webinar_exception($1,$2,$3,$4,$5)', [guest.id, 'ignore', null, null, 'Organizator potwierdził tożsamość.'], /administrator lub TCM/); checks++;
  await denied('select academy_set_webinar_excluded($1,$2,$3,$4)', [run, 'x@example.test', true, null], /administrator lub TCM/); checks++;
  equal((await sql('select count(*)::int n from academy_webinar_exceptions')).rows[0].n, 0, 'RLS hides exceptions');
 }
 await actor('', 'anon'); await denied('select academy_list_webinar_exceptions($1)', [run]); checks++;

 // A person assigns the addressless guest; the name is never matched automatically.
 await actor('admin');
 const assigned = await rpc('academy_resolve_webinar_exception', [guest.id, 'assign', listed.id, null, 'Organizator potwierdził tożsamość gościa.']);
 equal(assigned.status, 'assigned');
 equal((await sql('select status,attended_seconds from academy_webinar_attendance where roster_id=$1 and session_id=$2', [listed.id, session])).rows, [{ status: 'present', attended_seconds: 10800 }]);
 await denied('select academy_resolve_webinar_exception($1,$2,$3,$4,$5)', [guest.id, 'ignore', null, null, 'Druga decyzja na tym samym wierszu.'], /już rozstrzygnięty/); checks++;
 equal((await sql("select count(*)::int n from academy_audit_events where action='ACADEMY_WEBINAR_EXCEPTION_RESOLVED'")).rows[0].n, 1);

 // Manual assignment to a Compass registration finalizes attendance as a human decision.
 const stranger = (await rpc('academy_list_webinar_exceptions', [run])).find(x => x.email === 'stranger@example.test');
 await actor('other'); await owner();
 await sql("insert into course_run_registrations(run_id,user_id,status) values($1,$2,'waitlisted')", [run, ids.other]);
 const reg = (await sql('select id from course_run_registrations where run_id=$1 and user_id=$2', [run, ids.other])).rows[0].id;
 await sql('select academy_private.confirm_registration($1)', [reg]);
 await actor('admin');
 equal((await rpc('academy_resolve_webinar_exception', [stranger.id, 'assign', null, reg, 'Ten sam uczestnik pod prywatnym adresem.'])).status, 'assigned');
 equal((await sql("select sa.source,sa.status from session_attendance sa join course_run_registrations r on r.enrollment_id=sa.enrollment_id where r.id=$1", [reg])).rows, [{ source: 'manual', status: 'present' }]);

 // A human decision or certificate is never overwritten by resolving another exception.
 const outside = (await rpc('academy_list_webinar_exceptions', [run])).find(x => x.kind === 'outside_window');
 await denied('select academy_resolve_webinar_exception($1,$2,$3,$4,$5)', [outside.id, 'assign', null, reg, 'Próba nadpisania ręcznej decyzji.'], /ręczną decyzję/); checks++;
 equal((await rpc('academy_resolve_webinar_exception', [outside.id, 'ignore', null, null, 'Dołączył po zajęciach, bez znaczenia.'])).status, 'ignored');
 await rpc('academy_set_webinar_excluded', [run, 'trener@example.test', false, null]);
 equal(await rpc('academy_list_webinar_excluded', [run]), []);
 await owner();
 const rollback = new URL('../supabase/rollbacks/20261109103000_academy_webinar_import_exceptions.sql', import.meta.url);
 await db.exec(fs.readFileSync(rollback, 'utf8'));
 equal((await sql("select count(*)::int n from pg_proc where proname like 'academy_%webinar_%' and (proname like '%_v2' or proname like '%exception%' or proname like '%excluded%')")).rows[0].n, 0);
 equal((await sql("select to_regclass('public.academy_webinar_exceptions') t")).rows[0].t, null);
 equal((await sql("select count(*)::int n from academy_webinar_attendance where roster_id=$1", [listed.id])).rows[0].n, 1, 'Imported attendance survives a rollback');
 console.log(`academy webinar exceptions: ${checks} checks passed`);
} finally {
 await db.close();
}
