// Scoped roster read regression, on host-native PGlite or hosted PostgreSQL.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ rollout: true, obligations: true, reviewSubmissions: true });
const { db, sql, actor, owner, service, rpc, ids } = fixture;
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const denied = async (...args) => { await fixture.expectDenied(...args); checks++; };
const time = hours => new Date(Date.now() + hours * 3600000).toISOString();
const meeting = { title: 'Roster workshop', startsAt: time(24), endsAt: time(25), timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: 'https://teams.microsoft.com/meet/123', required: true };
async function approve(version) {
    await actor('admin');
    const token = (await sql('select submission_id from course_versions where id=$1', [version])).rows[0].submission_id;
    await rpc('academy_review_course', [version, true, null, token]);
}
async function makeRun(courseId, versionId, title, capacity = 3) {
    await actor('trainer');
    const run = await rpc('academy_create_run', [{ courseId, versionId, title, capacity }]);
    const session = await rpc('academy_save_session', [{ ...meeting, runId: run }]);
    await actor('admin'); await rpc('academy_publish_run', [run]);
    return { run, session };
}
async function readRoster(run) { return rpc('academy_run_participants', [run]); }
async function progressQuiz(enrollmentId, correct) {
    const quiz = (await sql('select * from academy_get_quiz($1)', [enrollmentId])).rows;
    return rpc('academy_submit_quiz', [enrollmentId, quiz.map((q, i) => ({ question_id: q.question_id, selected_option_id: q.options[i < correct ? 0 : 1].id }))]);
}

try {
    await db.exec(await fs.readFile(new URL('../supabase/migrations/20260922154408_academy_roster_progress.sql', import.meta.url), 'utf8'));
    // CREATE OR REPLACE remains re-applicable and does not acquire PUBLIC execute.
    await db.exec(await fs.readFile(new URL('../supabase/migrations/20260922154408_academy_roster_progress.sql', import.meta.url), 'utf8'));
    equal((await sql("select has_function_privilege('anon','public.academy_run_participants(uuid)','execute') anon,has_function_privilege('authenticated','public.academy_run_participants(uuid)','execute') auth")).rows[0], { anon: false, auth: true });
    await actor('admin'); await rpc('academy_set_rollout', ['open', []]); await rpc('academy_set_trainer', [ids.trainer, true]);
    const facilitator = '00000000-0000-4000-8000-000000000011';
    const editor = '00000000-0000-4000-8000-000000000012';
    const courseFacilitator = '00000000-0000-4000-8000-000000000013';
    await owner();
    for (const [id, name] of [[facilitator, 'Scoped facilitator'], [editor, 'Content editor'], [courseFacilitator, 'Course facilitator']]) {
        await sql('insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())', [id, `${id}@example.test`]);
        await sql("insert into profiles(id,role,email,full_name)values($1,'consultant',$2,$3)", [id, `${id}@example.test`, name]);
    }
    await actor('admin');
    for (const id of [facilitator, editor, courseFacilitator]) await rpc('academy_set_trainer', [id, true]);
    await actor('trainer');
    const { course_id: course, version_id: version } = await rpc('academy_create_course', [{ title: 'Pinned roster progress', category: 'IT', delivery_mode: 'blended' }]);
    await rpc('academy_update_course', [course, { completion_rules: { quiz_required: true, quiz_pass_percent: 75, require_all_lessons: true, attendance_percent: 80 } }]);
    const lessons = [];
    for (let i = 0; i < 3; i++) lessons.push((await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md,unlock_after_days)values($1,$2,$3,$4,'Pinned lesson body',$5)returning id", [course, version, `Lesson ${i + 1}`, i, i === 2 ? 30 : 0])).rows[0].id);
    const questions = Array.from({ length: 4 }, (_, i) => ({ question_text: `Secret question ${i + 1}`, options: Array.from({ length: 4 }, (_, j) => ({ option_text: `Secret answer ${j + 1}`, is_correct: j === 0 })) }));
    await rpc('academy_replace_quiz', [course, questions]); await rpc('academy_submit_for_review', [course]); await approve(version);
    const { run } = await makeRun(course, version, 'Observed group', 1);
    const { run: otherRun } = await makeRun(course, version, 'Other group');
    await actor('student'); const registration = await rpc('academy_register_run', [run]);
    await rpc('academy_mark_lesson_complete', [registration.enrollmentId, lessons[0]]);
    equal((await progressQuiz(registration.enrollmentId, 2)).score_percent, 50);
    equal((await progressQuiz(registration.enrollmentId, 3)).score_percent, 75);
    // Same person and course in another group must not contaminate this aggregate.
    const otherRegistration = await rpc('academy_register_run', [otherRun]);
    equal((await progressQuiz(otherRegistration.enrollmentId, 4)).score_percent, 100);
    await actor('other'); const waitlisted = await rpc('academy_register_run', [run]); equal(waitlisted.status, 'waitlisted');
    await actor('trainer');
    await rpc('academy_set_run_staff', [run, facilitator, true]);
    await rpc('academy_set_course_staff', [course, editor, 'editor', true]);
    await rpc('academy_set_course_staff', [course, courseFacilitator, 'facilitator', true]);
    let roster = await readRoster(run);
    equal(roster.length, 2);
    const participant = roster.find(p => p.userId === ids.student);
    equal(participant.progress, { versionNumber: 1, totalLessons: 3, completedLessons: 1, lessonPercent: 33, requireAllLessons: true, quizRequired: true, quizPassPercent: 75, quizPassed: true, quizBestScorePercent: 75, quizAttemptCount: 2 });
    equal(participant.completionState, 'pending'); equal(participant.completedAt, null); equal(participant.completionRevokedAt, null);
    equal(roster.find(p => p.userId === ids.other).progress, null);
    equal(roster.find(p => p.userId === ids.other).enrollmentId, null);
    equal(Object.keys(participant).sort(), ['registrationId', 'userId', 'enrollmentId', 'fullName', 'email', 'status', 'completedAt', 'completionRevokedAt', 'completionState', 'progress', 'attendance'].sort());
    equal(JSON.stringify(roster).includes('Secret'), false);
    equal(JSON.stringify(roster).includes('answers'), false);
    equal(JSON.stringify(roster).includes(otherRegistration.enrollmentId), false);
    // A newly approved version cannot change the old run's denominator or threshold.
    const nextVersion = await rpc('academy_begin_draft', [course]);
    await rpc('academy_update_course', [course, { completion_rules: { quiz_required: true, quiz_pass_percent: 100, require_all_lessons: true, attendance_percent: 95 } }]);
    await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md)values($1,$2,'New program lesson',4,'Version 2')", [course, nextVersion]);
    await rpc('academy_submit_for_review', [course]); await approve(nextVersion);
    await actor('trainer'); equal((await readRoster(run)).find(p => p.userId === ids.student).progress, participant.progress);
    // RLS and SECURITY DEFINER guard agree on assigned groups, not global role alone.
    for (const who of ['admin', 'trainer', courseFacilitator, facilitator]) {
        await actor(who); equal((await readRoster(run)).length, 2);
    }
    await actor(facilitator);
    await denied('select academy_run_participants($1)', [otherRun], /uprawnień/);
    equal((await sql('select id from course_enrollments where id=$1', [otherRegistration.enrollmentId])).rows, []);
    equal((await sql('select id from course_quiz_attempts where enrollment_id=$1', [otherRegistration.enrollmentId])).rows, []);
    for (const who of [editor, 'student', 'other', 'internal']) {
        await actor(who); await denied('select academy_run_participants($1)', [run], /uprawnień/);
    }
    await actor('', 'anon'); await denied('select academy_run_participants($1)', [run]);
    await service(); await denied('select academy_run_participants($1)', [run], /uprawnień/);
    await actor('trainer'); await rpc('academy_set_run_staff', [run, facilitator, false]);
    await actor(facilitator); await denied('select academy_run_participants($1)', [run], /uprawnień/);
    await actor('trainer'); await rpc('academy_set_run_staff', [run, facilitator, true]);
    await actor('admin'); await rpc('academy_set_trainer', [facilitator, false]);
    await actor(facilitator); await denied('select academy_run_participants($1)', [run], /uprawnień/);
    await actor('admin'); await rpc('academy_set_rollout', ['closed', []]);
    await actor('trainer'); await denied('select academy_run_participants($1)', [run], /uprawnień/);
    await actor('admin'); equal((await readRoster(run)).length, 2); await rpc('academy_set_rollout', ['open', []]);
    // Live-only completion and subsequent revocation preserve learning history,
    // but never present the historical enrollment timestamp as a valid certificate.
    await actor('trainer');
    const live = await rpc('academy_create_course', [{ title: 'Live roster completion', category: 'IT', delivery_mode: 'live' }]);
    await rpc('academy_update_course', [live.course_id, { completion_rules: { quiz_required: false, require_all_lessons: false, attendance_percent: 80 } }]);
    await rpc('academy_submit_for_review', [live.course_id]); await approve(live.version_id);
    const liveRun = await makeRun(live.course_id, live.version_id, 'Live attendance');
    await actor('student'); const liveRegistration = await rpc('academy_register_run', [liveRun.run]);
    await actor('trainer'); const pending = (await readRoster(liveRun.run))[0];
    equal([pending.progress.totalLessons, pending.progress.lessonPercent, pending.progress.quizRequired, pending.progress.quizAttemptCount, pending.progress.quizBestScorePercent], [0, 0, false, 0, null]);
    await owner(); const started = time(-2), ended = time(-1);
    await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1', [liveRun.session, started, ended]);
    await actor('trainer'); await rpc('academy_confirm_session_window', [liveRun.session, started, ended]);
    equal((await rpc('academy_record_attendance', [{ sessionId: liveRun.session, enrollmentId: liveRegistration.enrollmentId, status: 'present', attendedSeconds: 3600, note: 'Verified actual presence' }])).completed, true);
    const completed = (await readRoster(liveRun.run))[0];
    equal(completed.completionState, 'completed'); equal(Boolean(completed.completedAt), true);
    equal(completed.attendance[0].sessionId, liveRun.session); equal(completed.attendance[0].attendedSeconds, 3600);
    await owner(); const completionId = (await sql('select id from course_completions where enrollment_id=$1', [liveRegistration.enrollmentId])).rows[0].id;
    await actor('admin'); await rpc('academy_revoke_completion', [completionId, 'Incorrect final attendance evidence']);
    await actor('trainer'); const revoked = (await readRoster(liveRun.run))[0];
    equal(revoked.completionState, 'revoked'); equal(Boolean(revoked.completionRevokedAt), true);
    equal(revoked.completedAt, completed.completedAt); equal(revoked.progress, completed.progress); equal(revoked.attendance, completed.attendance);
    equal(JSON.stringify(revoked).includes('Incorrect final attendance evidence'), false);
    await owner();
    equal(Boolean((await sql('select completed_at from course_enrollments where id=$1', [liveRegistration.enrollmentId])).rows[0].completed_at), true);
    const counters = () => sql('select (select count(*) from course_completions)::int completions,(select count(*) from course_quiz_attempts)::int attempts,(select count(*) from academy_audit_events)::int audits,(select count(*) from loyalty_transactions)::int rewards');
    const before = (await counters()).rows;
    const enrollmentBefore = (await sql('select completed_lessons,completed_at from course_enrollments where id=$1', [registration.enrollmentId])).rows;
    await actor('trainer'); await readRoster(run); await readRoster(liveRun.run);
    await owner(); equal((await counters()).rows, before);
    equal((await sql('select completed_lessons,completed_at from course_enrollments where id=$1', [registration.enrollmentId])).rows, enrollmentBefore);
    console.log(`Academy roster: ${checks} assertions passed (${fixture.engine}; scoped identities, pinned progress, revoked completion, read-only).`);
} finally { await db.close(); }
