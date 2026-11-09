// B2.7-B2.9: test poza kursem, pre-test i sekwencja zaświadczenie -> certyfikat (G24-G26).
import assert from 'node:assert/strict';
import { createQuizDatabase, draftCourse, makeQuestions, publishCourse } from './lib/academy-quiz-fixture.mjs';

const fixture = await createQuizDatabase({ through: 'academy_participation_documents' });
const { db, query: sql, actor, owner, rpc, expectDenied, ids, engine } = fixture;
let checks = 0;
const keyFor = async versionId => {
    await owner();
    const rows = (await sql('select q.id,(select o.id from public.course_quiz_options o where o.question_id=q.id and o.is_correct) correct,(select o.id from public.course_quiz_options o where o.question_id=q.id and not o.is_correct limit 1) wrong from public.course_quiz_questions q where q.version_id=$1', [versionId])).rows;
    return new Map(rows.map(row => [row.id, row]));
};
const answers = (attempt, key, good) => JSON.stringify(attempt.questions.map(q => ({ question_id: q.question_id, selected_option_id: good ? key.get(q.question_id).correct : key.get(q.question_id).wrong })));

// B2.7 test poza kursem: bez lekcji, ta sama recenzja, zapis i dokument.
const assessment = await draftCourse(fixture, { title: 'Test wiedzy DORA', mode: 'assessment', questions: makeQuestions(4) });
await rpc('academy_submit_for_review', [assessment.courseId]);
await actor('admin');
await rpc('academy_review_course', [assessment.versionId, true, null, (await sql('select submission_id from public.course_versions where id=$1', [assessment.versionId])).rows[0].submission_id]);
await actor('student');
const assessmentEnrollment = await rpc('academy_enroll', [assessment.courseId, null]);
const assessmentAttempt = await rpc('academy_start_quiz_attempt', [assessmentEnrollment, 'final']);
const assessmentKey = await keyFor(assessment.versionId);
await actor('student');
const assessmentResult = await rpc('academy_submit_quiz_attempt', [assessmentAttempt.attempt_id, answers(assessmentAttempt, assessmentKey, true)]);
assert.equal(assessmentResult.award_status, 'completed'); checks++;
assert.equal((await sql('select count(*)::integer c from public.course_completions where enrollment_id=$1', [assessmentEnrollment])).rows[0].c, 1); checks++;

await actor('trainer');
const noQuiz = await rpc('academy_create_course', [{ title: 'Bez testu', category: 'IT', delivery_mode: 'assessment', completion_rules: {} }]);
await expectDenied('select public.academy_update_course($1,$2)', [noQuiz.course_id, JSON.stringify({ completion_rules: { quiz_required: false } })], /assessment_requires_quiz/); checks++;
const withLesson = await draftCourse(fixture, { title: 'Z lekcją', mode: 'assessment', questions: makeQuestions(2) });
await sql("insert into public.course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Lekcja',0,'Treść')", [withLesson.courseId, withLesson.versionId]);
await expectDenied('select public.academy_submit_for_review($1)', [withLesson.courseId], /assessment_has_no_lessons/); checks++;

// B2.8 pre-test: ta sama pula, bez wpływu na zaliczenie i limit, wynik per temat.
const pre = await draftCourse(fixture, { title: 'Z testem wstępnym', questions: makeQuestions(12), rules: { draw_count: 5, pre_test_count: 4, require_all_lessons: false } });
await publishCourse(fixture, pre);
const preKey = await keyFor(pre.versionId);
await actor('student');
const preEnrollment = await rpc('academy_enroll', [pre.courseId, null]);
const preAttempt = await rpc('academy_start_quiz_attempt', [preEnrollment, 'pre']);
assert.equal(preAttempt.questions.length, 4); checks++;
const preDone = await rpc('academy_submit_quiz_attempt', [preAttempt.attempt_id, answers(preAttempt, preKey, true)]);
assert.equal(preDone.passed, false); assert.equal(preDone.score_percent, 100); checks++;
assert.equal((await sql('select count(*)::integer c from public.course_completions where enrollment_id=$1', [preEnrollment])).rows[0].c, 0); checks++;
const preStatus = await rpc('academy_quiz_status', [preEnrollment]);
assert.equal(preStatus.attempts_used, 0); assert.equal(preStatus.blocker, null); assert.equal(preStatus.pre_blocker, 'pre_test_already_taken'); checks++;
const preResult = await rpc('academy_quiz_attempt_result', [preAttempt.attempt_id]);
assert.equal(preResult.topics.reduce((sum, topic) => sum + topic.correct, 0), 4); assert.equal(preResult.review, null); checks++;
await expectDenied('select public.academy_start_quiz_attempt($1,$2)', [preEnrollment, 'pre'], /pre_test_already_taken/); checks++;
await rpc('academy_start_quiz_attempt', [preEnrollment, 'final']);
assert.equal((await rpc('academy_quiz_status', [preEnrollment])).pre_blocker, 'pre_test_closed'); checks++;
const plain = await draftCourse(fixture, { title: 'Bez testu wstępnego', rules: { require_all_lessons: false } });
await publishCourse(fixture, plain);
await actor('student');
const plainEnrollment = await rpc('academy_enroll', [plain.courseId, null]);
await expectDenied('select public.academy_start_quiz_attempt($1,$2)', [plainEnrollment, 'pre'], /pre_test_not_enabled/); checks++;

// B2.9 domyślnie test wymagany w nowych kursach live; jawne wyłączenie zostaje decyzją autora.
await actor('trainer');
const defaults = await rpc('academy_create_course', [{ title: 'Live domyślny', category: 'IT', delivery_mode: 'live' }]);
assert.equal((await sql('select completion_rules from public.course_versions where id=$1', [defaults.version_id])).rows[0].completion_rules.quiz_required, true); checks++;

// G26: sekwencja obecny bez testu, zaświadczenie, zdanie, certyfikat.
const live = await draftCourse(fixture, { title: 'Szkolenie na żywo', mode: 'live', questions: makeQuestions(4), rules: { quiz_required: true, quiz_pass_percent: 75, require_all_lessons: false } });
await publishCourse(fixture, live);
const key = await keyFor(live.versionId);
const time = hours => new Date(Date.now() + hours * 3600000).toISOString();
await actor('trainer');
const runId = await rpc('academy_create_run', [{ courseId: live.courseId, versionId: live.versionId, title: 'Edycja listopad', capacity: 5 }]);
const sessionId = await rpc('academy_save_session', [{ runId, title: 'Warsztat', startsAt: time(24), endsAt: time(25), timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: 'https://teams.microsoft.com/meet/123', required: true }]);
await actor('admin');
await rpc('academy_publish_run', [runId]);
await actor('student');
const registration = await rpc('academy_register_run', [runId]);
const enrollment = registration.enrollmentId;
await expectDenied('select public.academy_start_quiz_attempt($1,$2)', [enrollment, 'final'], /quiz_opens_after_sessions/); checks++;
assert.equal((await rpc('academy_quiz_status', [enrollment])).blocker, 'quiz_opens_after_sessions'); checks++;

await owner();
const started = time(-2), ended = time(-1);
await sql('update public.course_sessions set starts_at=$2,ends_at=$3 where id=$1', [sessionId, started, ended]);
await actor('trainer');
await rpc('academy_confirm_session_window', [sessionId, started, ended]);
const pointsBefore = async () => { await owner(); return (await sql('select count(*)::integer c from public.loyalty_transactions where user_id=$1 and source_id=$2', [ids.student, live.courseId])).rows[0].c; };
await actor('trainer');
const attendance = await rpc('academy_record_attendance', [{ sessionId, enrollmentId: enrollment, status: 'present', attendedSeconds: 3600, note: 'Obecny' }]);
assert.equal(attendance.completed, false); checks++;
await owner();
const doc = (await sql('select * from public.academy_participation_documents where enrollment_id=$1', [enrollment])).rows;
assert.equal(doc.length, 1); assert.equal(doc[0].snapshot.participant_name, 'student'); assert.equal(doc[0].snapshot.course_title, 'Szkolenie na żywo'); checks++;
assert.equal((await sql('select count(*)::integer c from public.course_completions where enrollment_id=$1', [enrollment])).rows[0].c, 0); checks++;
assert.equal(await pointsBefore(), 0); checks++;

// Odporność: ponowna finalizacja nie dubluje, historia jest niezmienna, zapis tylko przez bazę.
await actor('trainer');
await rpc('academy_record_attendance', [{ sessionId, enrollmentId: enrollment, status: 'present', attendedSeconds: 3500, note: 'Korekta' }]);
await owner();
assert.equal((await sql('select count(*)::integer c from public.academy_participation_documents where enrollment_id=$1', [enrollment])).rows[0].c, 1); checks++;
await expectDenied('update public.academy_participation_documents set snapshot=$2 where enrollment_id=$1', [enrollment, '{}'], /completion_history_is_immutable/); checks++;
await expectDenied('delete from public.academy_participation_documents where enrollment_id=$1', [enrollment], /completion_history_is_immutable/); checks++;
await actor('student');
await expectDenied('insert into public.academy_participation_documents(enrollment_id,user_id,course_id,version_id,snapshot) values($1,$2,$3,$4,$5)', [enrollment, ids.student, live.courseId, live.versionId, '{}'], /permission denied/); checks++;
assert.equal((await sql('select count(*)::integer c from public.academy_participation_documents')).rows[0].c, 1); checks++;
await actor('other');
assert.equal((await sql('select count(*)::integer c from public.academy_participation_documents')).rows[0].c, 0); checks++;

// Oblany test nie daje certyfikatu, zdany daje, a zaświadczenie zostaje w historii.
await actor('student');
const failed = await rpc('academy_start_quiz_attempt', [enrollment, 'final']);
assert.equal((await rpc('academy_submit_quiz_attempt', [failed.attempt_id, answers(failed, key, false)])).passed, false); checks++;
await owner();
assert.equal((await sql('select count(*)::integer c from public.course_completions where enrollment_id=$1', [enrollment])).rows[0].c, 0); checks++;
await actor('student');
const success = await rpc('academy_start_quiz_attempt', [enrollment, 'final']);
const passedResult = await rpc('academy_submit_quiz_attempt', [success.attempt_id, answers(success, key, true)]);
assert.equal(passedResult.passed, true); assert.equal(passedResult.award_status, 'completed'); checks++;
await owner();
assert.equal((await sql('select count(*)::integer c from public.course_completions where enrollment_id=$1', [enrollment])).rows[0].c, 1); checks++;
assert.equal((await sql('select count(*)::integer c from public.academy_participation_documents where enrollment_id=$1', [enrollment])).rows[0].c, 1); checks++;
assert.equal(await pointsBefore(), 1, 'nagroda tylko za certyfikat'); checks++;
assert.equal((await sql("select count(*)::integer c from public.academy_audit_events where action='PARTICIPATION_DOCUMENT_ISSUED'")).rows[0].c, 1); checks++;

console.log(`Academy documents: ${checks} checks (${engine})`);
await db.close();
