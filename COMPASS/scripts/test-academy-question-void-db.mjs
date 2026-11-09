// B2.3: unieważnienie pytania, przeliczenie zapisanych prób, domknięcie ukończeń i audyt.
import assert from 'node:assert/strict';
import { createQuizDatabase, draftCourse, makeQuestions, publishCourse } from './lib/academy-quiz-fixture.mjs';

const fixture = await createQuizDatabase({ through: 'academy_question_void' });
const { db, query: sql, actor, owner, rpc, expectDenied, engine, connectSession } = fixture;
let checks = 0;

const course = await draftCourse(fixture, { questions: makeQuestions(4), rules: { quiz_pass_percent: 80, require_all_lessons: false, draw_random: false } });
await publishCourse(fixture, course);
await owner();
const questions = (await sql('select q.id,q.order_index,(select o.id from public.course_quiz_options o where o.question_id=q.id and o.is_correct) correct,(select o.id from public.course_quiz_options o where o.question_id=q.id and not o.is_correct limit 1) wrong from public.course_quiz_questions q where q.version_id=$1 order by q.order_index', [course.versionId])).rows;
const answer = (attempt, wrongIds) => JSON.stringify(attempt.questions.map(q => {
    const row = questions.find(x => x.id === q.question_id);
    return { question_id: row.id, selected_option_id: wrongIds.includes(row.id) ? row.wrong : row.correct };
}));
const [q0, q1] = questions;

// student: 3/4 = 75%, jedyny błąd na q0 (unieważnionym) -> przechodzi. other: błąd na q1 -> zostaje poniżej progu.
await actor('student');
const studentEnrollment = await rpc('academy_enroll', [course.courseId, null]);
const studentAttempt = await rpc('academy_start_quiz_attempt', [studentEnrollment, 'final']);
assert.equal((await rpc('academy_submit_quiz_attempt', [studentAttempt.attempt_id, answer(studentAttempt, [q0.id])])).passed, false);
await actor('other');
const otherEnrollment = await rpc('academy_enroll', [course.courseId, null]);
const otherAttempt = await rpc('academy_start_quiz_attempt', [otherEnrollment, 'final']);
assert.equal((await rpc('academy_submit_quiz_attempt', [otherAttempt.attempt_id, answer(otherAttempt, [q1.id, q0.id])])).score_percent, 50);

// Ścieżki odmowy.
await actor('student');
await expectDenied('select public.academy_void_question($1,$2)', [q0.id, 'Dwie poprawne odpowiedzi'], /trainer_course_required/); checks++;
await expectDenied('select public.academy_preview_void_question($1)', [q0.id], /trainer_course_required/); checks++;
await actor('admin', 'anon');
await expectDenied('select public.academy_void_question($1,$2)', [q0.id, 'Dwie poprawne odpowiedzi'], /permission denied/); checks++;
await actor('trainer');
await expectDenied('select public.academy_void_question($1,$2)', [q0.id, 'x'], /void_reason_required/); checks++;
assert.equal((await sql('update public.course_quiz_questions set voided_at=now() where id=$1 returning id', [q0.id])).rows.length, 0); checks++;
await owner();
await expectDenied('update public.course_quiz_questions set voided_at=now() where id=$1', [q0.id], /version_not_editable/); checks++;
await expectDenied('update public.course_quiz_questions set question_text=$2 where id=$1', [q0.id, 'Zmiana'], /version_not_editable/); checks++;
await actor('trainer');
const draftOnly = await draftCourse(fixture, { title: 'Tylko szkic', questions: makeQuestions(4) });
await owner();
const draftQuestion = (await sql('select id from public.course_quiz_questions where version_id=$1 limit 1', [draftOnly.versionId])).rows[0].id;
await actor('trainer');
await expectDenied('select public.academy_void_question($1,$2)', [draftQuestion, 'Powód testowy'], /void_requires_published_version/); checks++;

// Podgląd skutku zgadza się z przeliczeniem.
const preview = await rpc('academy_preview_void_question', [q0.id]);
assert.deepEqual({ a: preview.attempts, g: preview.gain_point, c: preview.cross_threshold, l: preview.lose_pass, n: preview.new_passes, p: preview.pool_after }, { a: 2, g: 2, c: 1, l: 0, n: 1, p: 3 }); checks++;
const done = await rpc('academy_void_question', [q0.id, 'Dwie poprawne odpowiedzi']);
assert.equal(done.recalculated, 2); assert.equal(done.completions_closed, 1); checks++;

// Przeliczenie: próg przekroczony, ukończenie domknięte, drugi uczestnik zyskał punkt, ale nie próg.
await owner();
const studentRow = (await sql('select score_percent,passed from public.course_quiz_attempts where id=$1', [studentAttempt.attempt_id])).rows[0];
assert.deepEqual(studentRow, { score_percent: 100, passed: true }); checks++;
assert.equal((await sql('select count(*)::integer c from public.course_completions where enrollment_id=$1', [studentEnrollment])).rows[0].c, 1); checks++;
assert.deepEqual((await sql('select score_percent,passed from public.course_quiz_attempts where id=$1', [otherAttempt.attempt_id])).rows[0], { score_percent: 75, passed: false }); checks++;
assert.equal((await sql('select count(*)::integer c from public.course_completions where enrollment_id=$1', [otherEnrollment])).rows[0].c, 0); checks++;

// Audyt i zapis, kto unieważnił.
const audit = (await sql("select details,actor_id from public.academy_audit_events where action='QUIZ_QUESTION_VOIDED'")).rows;
assert.equal(audit.length, 1); assert.equal(audit[0].actor_id, fixture.ids.trainer); assert.equal(audit[0].details.recalculated, 2); checks++;
const voided = (await sql('select voided_by,void_reason from public.course_quiz_questions where id=$1', [q0.id])).rows[0];
assert.equal(voided.voided_by, fixture.ids.trainer); assert.equal(voided.void_reason, 'Dwie poprawne odpowiedzi'); checks++;

// Ponowienie niczego nie zmienia ani nie dubluje.
await actor('trainer');
assert.equal((await rpc('academy_void_question', [q0.id, 'Dwie poprawne odpowiedzi'])).already_voided, true); checks++;
await owner();
assert.equal((await sql("select count(*)::integer c from public.academy_audit_events where action='QUIZ_QUESTION_VOIDED'")).rows[0].c, 1); checks++;

// Pytanie wypada z losowania, a próba z nim otwarta przed unieważnieniem go nie pokazuje i dostaje punkt.
await actor('other');
const next = await rpc('academy_start_quiz_attempt', [otherEnrollment, 'final']);
assert.equal(next.questions.length, 3); assert.ok(!next.questions.some(q => q.question_id === q0.id)); checks++;
const last = await rpc('academy_submit_quiz_attempt', [next.attempt_id, answer(next, [q1.id])]);
assert.equal(last.passed, false); checks++;

// Unieważnione pytanie nie wraca w kolejnym szkicu, a pula nie może zostać pusta.
await actor('trainer');
const nextVersion = await rpc('academy_begin_draft', [course.courseId]);
assert.equal((await sql('select count(*)::integer c from public.course_quiz_questions where version_id=$1', [nextVersion])).rows[0].c, 3); checks++;
const tiny = await draftCourse(fixture, { title: 'Jedno pytanie', questions: makeQuestions(1), rules: { require_all_lessons: false } });
await publishCourse(fixture, tiny);
await owner();
const onlyQuestion = (await sql('select id from public.course_quiz_questions where version_id=$1', [tiny.versionId])).rows[0].id;
await actor('trainer');
await expectDenied('select public.academy_void_question($1,$2)', [onlyQuestion, 'Ostatnie pytanie'], /void_would_empty_pool/); checks++;

if (engine === 'postgres') {
    // Wyścig: unieważnienie w trakcie wysyłki kończy się bez blokady wzajemnej i z ukończeniem.
    const race = await draftCourse(fixture, { title: 'Wyścig unieważnienia', questions: makeQuestions(4), rules: { quiz_pass_percent: 80, require_all_lessons: false, draw_random: false } });
    await publishCourse(fixture, race);
    await owner();
    const raceQuestions = (await sql('select q.id,(select o.id from public.course_quiz_options o where o.question_id=q.id and o.is_correct) correct,(select o.id from public.course_quiz_options o where o.question_id=q.id and not o.is_correct limit 1) wrong from public.course_quiz_questions q where q.version_id=$1 order by q.order_index', [race.versionId])).rows;
    await actor('student');
    const enrollment = await rpc('academy_enroll', [race.courseId, null]);
    const open = await rpc('academy_start_quiz_attempt', [enrollment, 'final']);
    const payload = JSON.stringify(open.questions.map(q => {
        const row = raceQuestions.find(x => x.id === q.question_id);
        return { question_id: row.id, selected_option_id: row.id === raceQuestions[0].id ? row.wrong : row.correct };
    }));
    const learner = await connectSession('student'); const editor = await connectSession('trainer');
    try {
        await Promise.all([learner.rpc('academy_submit_quiz_attempt', [open.attempt_id, payload]), editor.rpc('academy_void_question', [raceQuestions[0].id, 'Wyścig z wysyłką'])]);
        assert.equal((await sql('select score_percent from public.course_quiz_attempts where id=$1', [open.attempt_id])).rows[0].score_percent, 100); checks++;
        assert.equal((await sql('select count(*)::integer c from public.course_completions where enrollment_id=$1', [enrollment])).rows[0].c, 1); checks++;
        // Dwa unieważnienia różnych pytań tej samej wersji kończą się bez blokady wzajemnej.
        const second = await connectSession('trainer');
        try {
            const [left, right] = await Promise.all([editor.rpc('academy_void_question', [raceQuestions[1].id, 'Równoległe pierwsze']), second.rpc('academy_void_question', [raceQuestions[2].id, 'Równoległe drugie'])]);
            assert.equal(left.already_voided, false); assert.equal(right.already_voided, false); checks++;
        } finally { await second.db.close(); }
    } finally { await learner.db.close(); await editor.db.close(); }
}

console.log(`Academy question void: ${checks} checks (${engine})`);
await db.close();
