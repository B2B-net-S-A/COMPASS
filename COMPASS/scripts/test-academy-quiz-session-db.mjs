// B2.2: sesja podejścia. Limit prób, wyścig, brak klucza dla uczestnika, termin po stronie bazy.
import assert from 'node:assert/strict';
import { createQuizDatabase, draftCourse, makeQuestions, publishCourse } from './lib/academy-quiz-fixture.mjs';

const fixture = await createQuizDatabase({ through: 'academy_quiz_attempt_session' });
const { db, query: sql, actor, owner, rpc, expectDenied, engine, connectSession } = fixture;
let checks = 0;
const noKey = value => {
    const text = JSON.stringify(value);
    assert.ok(!text.includes('is_correct') && !text.includes('explanation'), `key leaked: ${text.slice(0, 200)}`);
};

const course = await draftCourse(fixture, { questions: makeQuestions(30, { explanation: true }), rules: { draw_count: 10, time_limit_minutes: 20, show_explanations: true, pre_test_count: 5, require_all_lessons: false } });
await publishCourse(fixture, course);
await actor('student');
const studentEnrollment = await rpc('academy_enroll', [course.courseId, null]);
await actor('other');
const otherEnrollment = await rpc('academy_enroll', [course.courseId, null]);

// Otwarcie strony niczego nie zużywa, a status nie zdradza puli.
await actor('student');
const status = await rpc('academy_quiz_status', [studentEnrollment]);
assert.equal(status.attempts_used, 0); assert.equal(status.question_count, 10); assert.equal(status.blocker, null); checks++;
assert.equal((await sql('select count(*)::integer c from public.course_quiz_attempts where enrollment_id=$1', [studentEnrollment])).rows[0].c, 0); checks++;

// Brak klucza przed wysłaniem, także w bezpośrednich odczytach.
const first = await rpc('academy_start_quiz_attempt', [studentEnrollment, 'final']);
noKey(first);
assert.equal(first.questions.length, 10); assert.ok(first.remaining_seconds > 1190 && first.remaining_seconds <= 1200); checks++;
assert.equal(new Set(first.questions.map(q => q.question_id)).size, 10); checks++;
await expectDenied('select * from public.course_quiz_attempt_items', [], /permission denied/); checks++;
assert.equal((await sql('select count(*)::integer c from public.course_quiz_options')).rows[0].c, 0); checks++;
await expectDenied('select academy_private.close_quiz_attempt($1,$2)', [first.attempt_id, 'submitted'], /permission denied/); checks++;
await expectDenied('update public.course_quiz_attempts set status=$1 where id=$2', ['submitted', first.attempt_id], /permission denied/); checks++;
await expectDenied('select public.academy_quiz_attempt_result($1)', [first.attempt_id], /quiz_attempt_not_finished/); checks++;
assert.equal((await sql("select to_regprocedure('public.academy_get_quiz(uuid)') a")).rows[0].a, null); checks++;

// Odświeżenie zwraca ten sam zestaw i kolejność, nie zużywa próby.
const refreshed = await rpc('academy_start_quiz_attempt', [studentEnrollment, 'final']);
assert.equal(refreshed.attempt_id, first.attempt_id);
assert.deepEqual(refreshed.questions.map(q => [q.question_id, q.options.map(o => o.id)]), first.questions.map(q => [q.question_id, q.options.map(o => o.id)])); checks++;

// Dwa konta dostają różne zestawy.
await actor('other');
const second = await rpc('academy_start_quiz_attempt', [otherEnrollment, 'final']);
assert.notDeepEqual(second.questions.map(q => q.question_id).sort(), first.questions.map(q => q.question_id).sort()); checks++;
// Cudza próba jest niedostępna.
await expectDenied('select public.academy_save_quiz_answer($1,$2,$3)', [first.attempt_id, first.questions[0].question_id, first.questions[0].options[0].id], /own_quiz_attempt_required/); checks++;
await expectDenied('select public.academy_submit_quiz_attempt($1,$2)', [first.attempt_id, '[]'], /own_quiz_attempt_required/); checks++;
await expectDenied('select public.academy_start_quiz_attempt($1,$2)', [studentEnrollment, 'final'], /own_enrollment_required/); checks++;
await actor('student', 'anon');
await expectDenied('select public.academy_start_quiz_attempt($1,$2)', [studentEnrollment, 'final'], /permission denied/); checks++;

// Autozapis: odpowiedź spoza zestawu albo opcja innego pytania są odrzucane.
await actor('student');
const [q1, q2] = first.questions;
const saved = await rpc('academy_save_quiz_answer', [first.attempt_id, q1.question_id, q1.options[0].id]);
assert.equal(saved.saved, true); noKey(saved); checks++;
assert.equal((await rpc('academy_start_quiz_attempt', [studentEnrollment, 'final'])).questions.find(q => q.question_id === q1.question_id).selected_option_id, q1.options[0].id); checks++;
await expectDenied('select public.academy_save_quiz_answer($1,$2,$3)', [first.attempt_id, q1.question_id, q2.options[0].id], /answer_not_in_attempt/); checks++;
const outside = second.questions.find(q => !first.questions.some(f => f.question_id === q.question_id));
await expectDenied('select public.academy_save_quiz_answer($1,$2,$3)', [first.attempt_id, outside.question_id, outside.options[0].id], /answer_not_in_attempt/); checks++;
await expectDenied('select public.academy_submit_quiz_attempt($1,$2)', [first.attempt_id, JSON.stringify([{ question_id: q1.question_id, selected_option_id: q1.options[0].id }, { question_id: q1.question_id, selected_option_id: q1.options[1].id }])], /one_answer_per_question_required/); checks++;
await expectDenied('select public.academy_submit_quiz_attempt($1,$2)', [first.attempt_id, JSON.stringify([{ question_id: 'zle', selected_option_id: q1.options[0].id }])], /answer_not_in_attempt/); checks++;
await expectDenied('select public.academy_submit_quiz_attempt($1,$2)', [first.attempt_id, JSON.stringify({ a: 1 })], /invalid_quiz_answers/); checks++;

// Odpowiedź po czasie: autozapis i wysyłka odrzucone, bez zmiany stanu.
await owner();
await sql("update public.course_quiz_attempts set deadline_at=now()-interval '1 second' where id=$1", [first.attempt_id]);
await actor('student');
await expectDenied('select public.academy_save_quiz_answer($1,$2,$3)', [first.attempt_id, q2.question_id, q2.options[0].id], /quiz_attempt_deadline_passed/); checks++;
await expectDenied('select public.academy_submit_quiz_attempt($1,$2)', [first.attempt_id, JSON.stringify([{ question_id: q2.question_id, selected_option_id: q2.options[0].id }])], /quiz_attempt_deadline_passed/); checks++;
const afterLate = (await sql('select status,answers from public.course_quiz_attempts where id=$1', [first.attempt_id])).rows[0];
assert.equal(afterLate.status, 'in_progress'); assert.deepEqual(afterLate.answers, []); checks++;

// Kolejne wejście zamyka próbę z odpowiedziami zapisanymi przed terminem i liczy ją do limitu.
const afterClose = await rpc('academy_quiz_status', [studentEnrollment]);
assert.equal(afterClose.open_final, false); assert.equal(afterClose.attempts_used, 1); checks++;
const expired = (await sql('select status,answers,passed,score_percent from public.course_quiz_attempts where id=$1', [first.attempt_id])).rows[0];
assert.equal(expired.status, 'expired'); assert.equal(expired.answers.length, 1); assert.equal(expired.passed, false); checks++;

// Wynik: tematy i wyjaśnienia dopiero po zamknięciu próby.
const expiredResult = await rpc('academy_quiz_attempt_result', [first.attempt_id]);
assert.equal(expiredResult.topics.reduce((sum, t) => sum + t.total, 0), 10); assert.ok(expiredResult.review[0].options.some(o => o.is_correct)); checks++;

// Limit: 3 próby w oknie, czwarta odmowa.
const wrong = async attempt => {
    const correct = (await (async () => { await owner(); const r = await sql('select id from public.course_quiz_options where is_correct'); await actor('student'); return new Set(r.rows.map(x => x.id)); })());
    return JSON.stringify(attempt.questions.map(q => ({ question_id: q.question_id, selected_option_id: q.options.find(o => !correct.has(o.id)).id })));
};
for (let index = 0; index < 2; index++) {
    const attempt = await rpc('academy_start_quiz_attempt', [studentEnrollment, 'final']);
    const result = await rpc('academy_submit_quiz_attempt', [attempt.attempt_id, await wrong(attempt)]);
    assert.equal(result.passed, false); assert.equal(result.score_percent, 0);
}
checks++;
await expectDenied('select public.academy_start_quiz_attempt($1,$2)', [studentEnrollment, 'final'], /quiz_attempt_window_exhausted/); checks++;
assert.equal((await rpc('academy_quiz_status', [studentEnrollment])).blocker, 'quiz_attempt_window_exhausted'); assert.ok((await rpc('academy_quiz_status', [studentEnrollment])).next_attempt_at); checks++;
assert.equal((await rpc('academy_quiz_status', [studentEnrollment])).attempts_used, 3); checks++;

// Okno się przesuwa: najstarsza próba poza 24 h zwalnia miejsce.
await owner();
await sql("update public.course_quiz_attempts set attempted_at=now()-interval '24 hours 1 minute' where id=$1", [first.attempt_id]);
await actor('student');
const fourth = await rpc('academy_start_quiz_attempt', [studentEnrollment, 'final']);
// Podwójna wysyłka oddaje ten sam wynik i nie ocenia drugi raz.
const correctAnswers = JSON.stringify(await (async () => {
    await owner(); const key = await sql('select id from public.course_quiz_options where is_correct'); await actor('student');
    const set = new Set(key.rows.map(x => x.id));
    return fourth.questions.map(q => ({ question_id: q.question_id, selected_option_id: q.options.find(o => set.has(o.id)).id }));
})());
const passed = await rpc('academy_submit_quiz_attempt', [fourth.attempt_id, correctAnswers]);
assert.equal(passed.passed, true); assert.equal(passed.score_percent, 100); assert.equal(passed.award_status, 'completed'); checks++;
const again = await rpc('academy_submit_quiz_attempt', [fourth.attempt_id, correctAnswers]);
assert.equal(again.already_submitted, true); assert.equal(again.score_percent, 100); checks++;
await expectDenied('select public.academy_save_quiz_answer($1,$2,$3)', [fourth.attempt_id, fourth.questions[0].question_id, fourth.questions[0].options[0].id], /quiz_attempt_closed/); checks++;
assert.equal((await sql('select count(*)::integer c from public.course_completions where enrollment_id=$1', [studentEnrollment])).rows[0].c, 1); checks++;
await expectDenied('select public.academy_start_quiz_attempt($1,$2)', [studentEnrollment, 'final'], /quiz_already_passed/); checks++;

if (engine === 'postgres') {
    // Wyścig: dwa równoległe starty dają jedną próbę z jednym zestawem.
    const race = await draftCourse(fixture, { title: 'Wyścig', questions: makeQuestions(20), rules: { draw_count: 5 } });
    await publishCourse(fixture, race);
    await actor('other');
    const raceEnrollment = await rpc('academy_enroll', [race.courseId, null]);
    const a = await connectSession('other'); const b = await connectSession('other');
    try {
        const [left, right] = await Promise.all([a.rpc('academy_start_quiz_attempt', [raceEnrollment, 'final']), b.rpc('academy_start_quiz_attempt', [raceEnrollment, 'final'])]);
        assert.equal(left.attempt_id, right.attempt_id); checks++;
        assert.equal((await sql('select count(*)::integer c from public.course_quiz_attempts where enrollment_id=$1', [raceEnrollment])).rows[0].c, 1); checks++;
        // Wyścig wysyłek: ta sama próba jest oceniona raz.
        const answers = JSON.stringify(left.questions.map(q => ({ question_id: q.question_id, selected_option_id: q.options[0].id })));
        const outcomes = await Promise.all([a.rpc('academy_submit_quiz_attempt', [left.attempt_id, answers]), b.rpc('academy_submit_quiz_attempt', [left.attempt_id, answers])]);
        assert.equal(outcomes.filter(result => result.already_submitted === true).length, 1); checks++;
        assert.equal(outcomes[0].score_percent, outcomes[1].score_percent); checks++;

        // Wyścig o ostatnią próbę w limicie przy dwóch edycjach tej samej wersji.
        await owner();
        const runId = (await sql("insert into public.course_runs(course_id,version_id,title,capacity,status,created_by) values($1,$2,'Druga',10,'draft',$3) returning id", [race.courseId, race.versionId, fixture.ids.trainer])).rows[0].id;
        const sessionId = (await sql("insert into public.course_sessions(run_id,title,starts_at,ends_at,meeting_mode,external_join_url,created_by) values($1,'Sesja',now()-interval '3 hours',now()-interval '2 hours','external_link','https://example.test/x',$2) returning id", [runId, fixture.ids.trainer])).rows[0].id;
        // Jednorazowa baza testowa: edycja minionej sesji bez ścieżki recenzji, bo sprawdzamy tylko wyścig o limit.
        await db.exec('ALTER TABLE public.course_runs DISABLE TRIGGER USER');
        await sql("update public.course_runs set status='published',published_by=$2,published_at=now() where id=$1", [runId, fixture.ids.trainer]);
        await db.exec('ALTER TABLE public.course_runs ENABLE TRIGGER USER');
        await sql('insert into academy_private.run_obligations(run_id,original_session_id,active_session_id) values($1,$2,$2)', [runId, sessionId]);
        const runEnrollment = (await sql('insert into public.course_enrollments(user_id,course_id,version_id,run_id) values($1,$2,$3,$4) returning id', [fixture.ids.other, race.courseId, race.versionId, runId])).rows[0].id;
        await sql("insert into public.course_run_registrations(run_id,user_id,enrollment_id,status) values($1,$2,$3,'confirmed')", [runId, fixture.ids.other, runEnrollment]);
        await sql("update public.course_quiz_attempts set passed=false,status='submitted' where enrollment_id=$1", [raceEnrollment]);
        await sql("insert into public.course_quiz_attempts(enrollment_id,user_id,course_id,score_percent,passed) values($1,$2,$3,0,false)", [raceEnrollment, fixture.ids.other, race.courseId]);
        const raced = await Promise.allSettled([a.rpc('academy_start_quiz_attempt', [raceEnrollment, 'final']), b.rpc('academy_start_quiz_attempt', [runEnrollment, 'final'])]);
        assert.equal(raced.filter(result => result.status === 'fulfilled').length, 1, JSON.stringify(raced.map(r => r.reason?.message))); checks++;
        assert.ok(raced.some(result => result.status === 'rejected' && /quiz_attempt_window_exhausted/.test(result.reason.message))); checks++;
    } finally { await a.db.close(); await b.db.close(); }
}

console.log(`Academy quiz session: ${checks} checks (${engine})`);
await db.close();
