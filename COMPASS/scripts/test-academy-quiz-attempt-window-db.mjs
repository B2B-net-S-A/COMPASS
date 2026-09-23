// Version-pinned quiz limits, rolling boundary and cross-run concurrency.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ qaRewards: true });
const { db, ids, query: sql, actor, owner, rpc, expectDenied } = fixture;
let checks = 0;
const questions = Array.from({ length: 4 }, (_, index) => ({
    question_text: `Question ${index + 1}`,
    options: Array.from({ length: 4 }, (_, option) => ({ option_text: `Answer ${option + 1}`, is_correct: option === 0 })),
}));
const answersFor = async (enrollmentId, optionIndex) =>
    (await sql('select * from public.academy_get_quiz($1)', [enrollmentId])).rows.map(question => ({
        question_id: question.question_id,
        selected_option_id: question.options[optionIndex].id,
    }));

await actor('admin');
await rpc('academy_set_rollout', ['pilot', [ids.trainer, ids.student, ids.other]]);
await rpc('academy_set_trainer', [ids.trainer, true]);
await actor('trainer');
const created = await rpc('academy_create_course', [{ title: 'Quiz window course', category: 'IT', delivery_mode: 'self_paced' }]);
const courseId = created.course_id;
const oldVersionId = created.version_id;
await sql("insert into public.course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Lesson',0,'Training content')", [courseId, oldVersionId]);
await rpc('academy_replace_quiz', [courseId, questions]);
await rpc('academy_submit_for_review', [courseId]);
await actor('admin');
let token = (await sql('select submission_id from public.course_versions where id=$1', [oldVersionId])).rows[0].submission_id;
await rpc('academy_review_course', [oldVersionId, true, null, token]);
await actor('student');
const oldEnrollmentId = await rpc('academy_enroll', [courseId, null]);

// Apply the migration after an approved version and its enrollment exist.
await owner();
const migrationPath = fileURLToPath(new URL('../supabase/migrations/20260923121456_academy_quiz_attempt_window.sql', import.meta.url));
await db.exec(fs.readFileSync(migrationPath, 'utf8'));
assert.deepEqual((await sql('select quiz_attempt_limit,quiz_attempt_window_hours from public.course_versions where id=$1', [oldVersionId])).rows[0],
    { quiz_attempt_limit: null, quiz_attempt_window_hours: null }); checks++;
await actor('student');
const oldWrong = await answersFor(oldEnrollmentId, 1);
for (let index = 0; index < 4; index++) assert.equal((await rpc('academy_submit_quiz', [oldEnrollmentId, oldWrong])).passed, false);
checks++;
assert.equal((await sql('select count(*)::integer count from public.course_quiz_attempts where enrollment_id=$1', [oldEnrollmentId])).rows[0].count, 4); checks++;
await expectDenied('select academy_private.submit_quiz_scoring($1,$2)', [oldEnrollmentId, JSON.stringify(oldWrong)], /permission denied/); checks++;

await actor('trainer');
const newVersionId = await rpc('academy_begin_draft', [courseId]);
assert.notEqual(newVersionId, oldVersionId);
assert.deepEqual((await sql('select quiz_attempt_limit,quiz_attempt_window_hours from public.course_versions where id=$1', [newVersionId])).rows[0],
    { quiz_attempt_limit: 3, quiz_attempt_window_hours: 24 }); checks++;
await rpc('academy_submit_for_review', [courseId]);
await actor('admin');
token = (await sql('select submission_id from public.course_versions where id=$1', [newVersionId])).rows[0].submission_id;
await rpc('academy_review_course', [newVersionId, true, null, token]);
await actor('other');
const newEnrollmentId = await rpc('academy_enroll', [courseId, null]);
assert.equal((await sql('select version_id from public.course_enrollments where id=$1', [newEnrollmentId])).rows[0].version_id, newVersionId); checks++;
const wrong = await answersFor(newEnrollmentId, 1);
for (let index = 0; index < 3; index++) assert.equal((await rpc('academy_submit_quiz', [newEnrollmentId, wrong])).passed, false);
await expectDenied('select public.academy_submit_quiz($1,$2)', [newEnrollmentId, JSON.stringify(wrong)], /quiz_attempt_window_exhausted/); checks++;
await expectDenied('select public.submit_quiz_attempt($1,$2)', [courseId, JSON.stringify(wrong)], /quiz_attempt_window_exhausted/); checks++;
assert.equal((await sql('select count(*)::integer count from public.course_quiz_attempts where enrollment_id=$1', [newEnrollmentId])).rows[0].count, 3); checks++;

// Distinct runs of the same version must not reset the learner's limit.
await owner();
const runId = (await sql("insert into public.course_runs(course_id,version_id,title,capacity,status,created_by,published_by,published_at) values($1,$2,'Second run',10,'published',$3,$3,now()) returning id", [courseId, newVersionId, ids.trainer])).rows[0].id;
const runEnrollmentId = (await sql('insert into public.course_enrollments(user_id,course_id,version_id,run_id) values($1,$2,$3,$4) returning id', [ids.other, courseId, newVersionId, runId])).rows[0].id;
await sql("insert into public.course_run_registrations(run_id,user_id,enrollment_id,status) values($1,$2,$3,'confirmed')", [runId, ids.other, runEnrollmentId]);
await actor('other');
await expectDenied('select public.academy_submit_quiz($1,$2)', [runEnrollmentId, JSON.stringify(wrong)], /quiz_attempt_window_exhausted/); checks++;

// A recent oldest attempt blocks; after 24 hours it falls out of the window.
await owner();
const oldestId = (await sql('select id from public.course_quiz_attempts where enrollment_id=$1 order by attempted_at,id limit 1', [newEnrollmentId])).rows[0].id;
await sql("update public.course_quiz_attempts set attempted_at=now()-interval '23 hours 59 minutes' where id=$1", [oldestId]);
await actor('other');
await expectDenied('select public.academy_submit_quiz($1,$2)', [newEnrollmentId, JSON.stringify(wrong)], /quiz_attempt_window_exhausted/); checks++;
await owner();
await sql("update public.course_quiz_attempts set attempted_at=now()-interval '24 hours 1 minute' where id=$1", [oldestId]);
await actor('other');
assert.equal((await rpc('academy_submit_quiz', [newEnrollmentId, wrong])).passed, false); checks++;

await owner();
await expectDenied('update public.course_versions set quiz_attempt_limit=5 where id=$1', [newVersionId], /immutable_quiz_attempt_policy/); checks++;
await expectDenied('update public.course_versions set quiz_attempt_limit=3,quiz_attempt_window_hours=24 where id=$1', [oldVersionId], /immutable_quiz_attempt_policy/); checks++;
const forced = (await sql("insert into public.course_versions(course_id,version_number,status,metadata,completion_rules,created_by,quiz_attempt_limit,quiz_attempt_window_hours) select course_id,version_number+1,'draft',metadata,completion_rules,created_by,null,null from public.course_versions where id=$1 returning quiz_attempt_limit,quiz_attempt_window_hours", [newVersionId])).rows[0];
assert.deepEqual(forced, { quiz_attempt_limit: 3, quiz_attempt_window_hours: 24 }); checks++;

if (fixture.engine === 'postgres') {
    // Leave two recent attempts; simultaneous calls target different enrollments.
    await sql("update public.course_quiz_attempts set attempted_at=now()-interval '24 hours 1 minute' where id=(select id from public.course_quiz_attempts where enrollment_id=$1 and attempted_at>now()-interval '24 hours' order by attempted_at,id limit 1)", [newEnrollmentId]);
    const first = await fixture.connectSession('other');
    const second = await fixture.connectSession('other');
    try {
        const outcomes = await Promise.allSettled([
            first.rpc('academy_submit_quiz', [newEnrollmentId, wrong]),
            second.rpc('academy_submit_quiz', [runEnrollmentId, wrong]),
        ]);
        assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
        assert.equal(outcomes.filter(result => result.status === 'rejected' && /quiz_attempt_window_exhausted/.test(result.reason.message)).length, 1);
        checks++;
    } finally {
        await first.db.close(); await second.db.close();
    }
}

console.log(`Academy quiz attempt window: ${checks} checks (${fixture.engine})`);
await db.close();
