// B3.5 / G33: an account created after the attendance import receives its seat and attendance.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const f = await createAcademyDatabase({ patrykCycle: true });
const { db, ids, sql, actor, owner, rpc: fixtureRpc } = f;
const JSON_ARGS = { academy_preview_webinar_import: [2], academy_commit_webinar_import: [1] };
const rpc = (name, args = []) => fixtureRpc(name, args.map((value, index) => (JSON_ARGS[name] ?? []).includes(index) && typeof value !== 'string' ? JSON.stringify(value) : value));
let checks = 0;
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const hours = h => new Date(Date.now() + h * 3600000).toISOString();
const hash = 'd'.repeat(64);
const zero = { linked: 0, confirmed: 0, attendance: 0, failed: 0 };

async function createUser(id, email) {
 await owner();
 await sql('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id, email]);
 await sql("insert into profiles(id,role,email,full_name) values($1,'consultant',$2,$3)", [id, email, email]);
}
async function account(id, email, userId, endedAt = null) {
 await owner();
 await sql('insert into academy_learner_accounts(id,email,user_id,ended_at) values($1,$2,$3,$4)', [id, email, userId, endedAt]);
}
const bind = async (accountId, userId) => { await actor('', 'service_role'); return rpc('academy_bind_learner_on_entry', [accountId, userId]); };

try {
 const dir = new URL('../supabase/migrations/', import.meta.url);
 await db.exec(`CREATE TABLE public.academy_learner_accounts(id uuid PRIMARY KEY,email text NOT NULL UNIQUE,user_id uuid REFERENCES public.profiles(id),ended_at timestamptz);
  GRANT ALL ON public.academy_learner_accounts TO service_role;`);
 for (const suffix of ['_academy_tcm_full_editor.sql', '_academy_bind_learner_to_run.sql']) {
  const names = fs.readdirSync(dir).filter(n => n.endsWith(suffix));
  equal(names.length, 1, suffix);
  await db.exec(fs.readFileSync(new URL(names[0], dir), 'utf8'));
 }
 await actor('admin'); await rpc('academy_set_rollout', ['open', []]); await rpc('academy_set_trainer', [ids.trainer, true]);
 await actor('trainer'); const { course_id: course, version_id: version } = await rpc('academy_create_course', [{ title: 'Late activation', category: 'IT', delivery_mode: 'live' }]);
 await rpc('academy_update_course', [course, { completion_rules: { quiz_required: false, require_all_lessons: false, attendance_percent: 80 } }]);
 await rpc('academy_submit_for_review', [course]); await actor('admin');
 const token = (await sql('select submission_id from course_versions where id=$1', [version])).rows[0].submission_id; await rpc('academy_review_course', [version, true, null, token]);
 await actor('trainer'); const run = await rpc('academy_create_run', [{ courseId: course, versionId: version, title: 'Late run', capacity: 5 }]);
 const session = await rpc('academy_save_session', [{ runId: run, title: 'Teams', startsAt: hours(24), endsAt: hours(27), timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: 'https://teams.microsoft.com/meet/9', required: true }]);
 await actor('admin'); await rpc('academy_publish_run', [run]);

 const people = ['late@example.test', 'resigned@example.test', 'manual@example.test', 'ended@example.test'];
 const batch = await rpc('academy_preview_webinar_import', [run, 'registrations', people.map(email => ({ email, fullName: email })), hash, null]);
 await rpc('academy_commit_webinar_import', [batch.id, {}]);
 const seatsBefore = (await rpc('academy_list_runs', [null, run]))[0].confirmedCount;
 const start = hours(-4); const end = hours(-1);
 await owner(); await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1', [session, start, end]);
 await actor('trainer'); await rpc('academy_confirm_session_window', [session, start, end]);
 await actor('admin');
 const attendance = await rpc('academy_preview_webinar_import', [run, 'attendance', people.map(email => ({ email, fullName: email, intervals: [{ start, end }], evidence: 'intervals' })), 'e'.repeat(64), session]);
 await rpc('academy_commit_webinar_import', [attendance.id, {}]);

 const id = n => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, '0')}`;
 // G33: the account appears only now.
 await createUser(id(1), 'late@example.test'); await account(id(11), 'late@example.test', id(1));
 equal(await bind(id(11), id(1)), { linked: 1, confirmed: 1, attendance: 1, failed: 0 });
 await owner();
 const reg = (await sql('select status,enrollment_id from course_run_registrations where run_id=$1 and user_id=$2', [run, id(1)])).rows[0];
 equal(reg.status, 'confirmed');
 equal((await sql('select status,source,attended_seconds from session_attendance where enrollment_id=$1', [reg.enrollment_id])).rows, [{ status: 'present', source: 'teams', attended_seconds: 10800 }]);
 equal((await sql('select completed_at is not null done from course_enrollments where id=$1', [reg.enrollment_id])).rows[0].done, true, 'finalize_enrollment ran');
 equal((await sql('select user_id from academy_webinar_roster where run_id=$1 and email=$2', [run, 'late@example.test'])).rows[0].user_id, id(1));
 await actor('admin'); equal((await rpc('academy_list_runs', [null, run]))[0].confirmedCount, seatsBefore, 'A linked person is counted once');

 // Repeating the entry changes nothing.
 equal(await bind(id(11), id(1)), zero);

 // A resignation is not undone by an entry link.
 await createUser(id(2), 'resigned@example.test'); await account(id(12), 'resigned@example.test', id(2));
 await owner(); await sql("insert into course_run_registrations(run_id,user_id,status) values($1,$2,'cancelled')", [run, id(2)]);
 equal(await bind(id(12), id(2)), { linked: 1, confirmed: 0, attendance: 0, failed: 0 });
 await owner(); equal((await sql('select status from course_run_registrations where run_id=$1 and user_id=$2', [run, id(2)])).rows[0].status, 'cancelled');

 // A human decision recorded earlier stays.
 await createUser(id(3), 'manual@example.test'); await account(id(13), 'manual@example.test', id(3));
 await owner();
 const manual = (await sql("insert into course_run_registrations(run_id,user_id,status) values($1,$2,'waitlisted') returning id", [run, id(3)])).rows[0].id;
 await sql('select academy_private.confirm_registration($1)', [manual]);
 const manualEnrollment = (await sql('select enrollment_id from course_run_registrations where id=$1', [manual])).rows[0].enrollment_id;
 await sql("insert into session_attendance(session_id,enrollment_id,status,attended_seconds,source,reviewed_by,note) values($1,$2,'insufficient',60,'manual',$3,'Decyzja organizatora.')", [session, manualEnrollment, ids.admin]);
 equal(await bind(id(13), id(3)), { linked: 1, confirmed: 0, attendance: 0, failed: 0 });
 await owner(); equal((await sql('select source,attended_seconds from session_attendance where enrollment_id=$1', [manualEnrollment])).rows, [{ source: 'manual', attended_seconds: 60 }]);

 // Refusals: an ended account, someone else's user, and any non-service caller.
 await createUser(id(4), 'ended@example.test'); await account(id(14), 'ended@example.test', id(4), hours(-1));
 equal(await bind(id(14), id(4)), zero);
 await createUser(id(5), 'attacker@example.test'); await account(id(15), 'attacker@example.test', id(5));
 equal(await bind(id(15), id(4)), zero, 'A user id from another account binds nothing');
 equal(await bind(id(15), id(5)), zero, 'No roster row for this address');
 await owner(); equal((await sql('select user_id from academy_webinar_roster where run_id=$1 and email=$2', [run, 'ended@example.test'])).rows[0].user_id, null);
 for (const who of ['admin', 'student']) {
  await actor(who); await f.expectDenied('select academy_bind_learner_on_entry($1,$2)', [id(11), id(1)]); checks++;
 }
 await actor('', 'anon'); await f.expectDenied('select academy_bind_learner_on_entry($1,$2)', [id(11), id(1)]); checks++;
 await owner();
 await db.exec(fs.readFileSync(new URL('../supabase/rollbacks/20261110100000_academy_bind_learner_to_run.sql', import.meta.url), 'utf8'));
 equal((await sql("select to_regprocedure('public.academy_bind_learner_on_entry(uuid,uuid)') p")).rows[0].p, null);
 console.log(`academy bind learner: ${checks} checks passed`);
} finally {
 await db.close();
}
