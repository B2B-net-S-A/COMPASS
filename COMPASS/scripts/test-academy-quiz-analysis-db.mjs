// B2.10 i B2.11: klucz tylko dla autora i recenzenta, analiza bez osób z kluczem, szkice AI za zatwierdzeniem człowieka.
import assert from 'node:assert/strict';
import { createQuizDatabase, draftCourse, makeQuestions, publishCourse } from './lib/academy-quiz-fixture.mjs';

const fixture = await createQuizDatabase({ through: 'academy_question_drafts' });
const { db, query: sql, actor, owner, rpc, expectDenied, ids, engine } = fixture;
let checks = 0;

const course = await draftCourse(fixture, { questions: makeQuestions(2), rules: { draw_random: false, require_all_lessons: false, quiz_pass_percent: 50 } });
await publishCourse(fixture, course);
const optionCount = async () => (await sql('select count(*)::integer c from public.course_quiz_options o join public.course_quiz_questions q on q.id=o.question_id where q.version_id=$1', [course.versionId])).rows[0].c;

// G27: klucz opublikowanej wersji widzi autor i recenzent; uczestnik nie widzi wcale.
await actor('trainer'); assert.equal(await optionCount(), 8); checks++;
await actor('admin'); assert.equal(await optionCount(), 8); checks++;
await actor('student'); assert.equal(await optionCount(), 0); checks++;

// Inny redaktor globalny (TCM), który nie jest autorem ani recenzentem, klucza nie widzi.
await owner();
await sql("update public.profiles set role='talent_community' where id=$1", [ids.internal]);
await actor('internal');
assert.equal(await optionCount(), 0); checks++;
await expectDenied('select public.academy_question_analysis($1)', [course.versionId], /quiz_key_access_required/); checks++;
await actor('student');
await expectDenied('select public.academy_question_analysis($1)', [course.versionId], /quiz_key_access_required/); checks++;
await actor('admin', 'anon');
await expectDenied('select public.academy_question_analysis($1)', [course.versionId], /permission denied/); checks++;

// Odpowiedzi: student dobrze/źle, other źle/źle; autor rozwiązuje swój test i ma wypaść z analizy.
await owner();
const key = (await sql('select q.id,q.order_index,array_agg(o.id order by o.order_index) options from public.course_quiz_questions q join public.course_quiz_options o on o.question_id=q.id where q.version_id=$1 group by q.id order by q.order_index', [course.versionId])).rows;
const take = async (who, choice) => {
    await actor(who);
    const enrollment = await rpc('academy_enroll', [course.courseId, null]);
    const attempt = await rpc('academy_start_quiz_attempt', [enrollment, 'final']);
    return rpc('academy_submit_quiz_attempt', [attempt.attempt_id, JSON.stringify(attempt.questions.map(q => {
        const row = key.find(x => x.id === q.question_id);
        return { question_id: row.id, selected_option_id: row.options[choice[row.order_index]] };
    }))]);
};
await take('student', [0, 1]);
await take('other', [1, 2]);
await take('trainer', [0, 0]);

await actor('trainer');
const analysis = await rpc('academy_question_analysis', [course.versionId]);
const first = analysis.find(row => row.order_index === 0), second = analysis.find(row => row.order_index === 1);
assert.equal(first.responses, 2, 'autor z kluczem nie liczy się do analizy'); checks++;
assert.equal(first.correct_percent, 50); checks++;
assert.equal(second.correct_percent, 0); checks++;
assert.deepEqual(first.options.map(option => option.count), [1, 1, 0, 0]); assert.equal(first.options[0].is_correct, true); checks++;
assert.deepEqual(second.options.map(option => option.count), [0, 1, 1, 0]); checks++;
assert.equal(analysis[0].order_index, 1, 'od najniższej trafności'); checks++;

// G28: szkic AI nie trafia do puli bez decyzji człowieka; zapis, kto zatwierdził.
const target = await draftCourse(fixture, { title: 'Szkice AI', questions: makeQuestions(1) });
const draft = { source_label: 'Moduł 3, 04:12', source_excerpt: 'Termin pilnujemy na przypisaniu.', question_text: 'Scenariusz?', topic_tag: 'SLA', critique: { level: 'zastosowanie', risk: 'dwie prawdopodobne' },
    options: [{ option_text: 'SLA', is_correct: true, explanation: 'Licznik per sprawa' }, { option_text: 'Zadanie w tle', is_correct: false }] };
await actor('student');
await expectDenied('select public.academy_save_question_drafts($1,$2)', [target.courseId, JSON.stringify([draft])], /trainer_course_required/); checks++;
await actor('trainer');
await expectDenied('select public.academy_save_question_drafts($1,$2)', [target.courseId, JSON.stringify([{ ...draft, options: draft.options.map(o => ({ ...o, is_correct: true })) }])], /invalid_question_drafts/); checks++;
await expectDenied('select public.academy_save_question_drafts($1,$2)', [target.courseId, '[]'], /invalid_question_drafts/); checks++;
assert.equal(await rpc('academy_save_question_drafts', [target.courseId, JSON.stringify([draft, { ...draft, question_text: 'Drugi?' }]), 'model-test']), 2); checks++;
const poolSize = async () => (await sql('select count(*)::integer c from public.course_quiz_questions where version_id=$1', [target.versionId])).rows[0].c;
assert.equal(await poolSize(), 1, 'szkic nie jest w puli'); checks++;
await expectDenied('insert into public.academy_question_drafts(course_id,source_label,source_excerpt,question_text,options,generated_by) values($1,$2,$3,$4,$5,$6)', [target.courseId, 'x', 'y', 'z', '[]', ids.trainer], /permission denied/); checks++;
const drafts = (await sql('select id,question_text from public.academy_question_drafts where course_id=$1 order by question_text desc', [target.courseId])).rows;
await actor('student');
await expectDenied('select public.academy_decide_question_draft($1,$2)', [drafts[0].id, true], /trainer_course_required/); checks++;
assert.equal((await sql('select count(*)::integer c from public.academy_question_drafts')).rows[0].c, 0); checks++;
await actor('trainer');
const approved = await rpc('academy_decide_question_draft', [drafts[0].id, true, null, JSON.stringify({ question_text: 'Scenariusz poprawiony?' })]);
assert.equal(approved.status, 'approved'); assert.equal(await poolSize(), 2); checks++;
const row = (await sql('select decided_by,status,approved_question_id from public.academy_question_drafts where id=$1', [drafts[0].id])).rows[0];
assert.equal(row.decided_by, ids.trainer); assert.equal(row.approved_question_id, approved.question_id); checks++;
assert.equal((await sql('select question_text,topic_tag from public.course_quiz_questions where id=$1', [approved.question_id])).rows[0].question_text, 'Scenariusz poprawiony?'); checks++;
await expectDenied('select public.academy_decide_question_draft($1,$2)', [drafts[0].id, true], /question_draft_already_decided/); checks++;
await expectDenied('select public.academy_decide_question_draft($1,$2,$3)', [drafts[1].id, false, ''], /rejection_reason_required/); checks++;
assert.equal((await rpc('academy_decide_question_draft', [drafts[1].id, false, 'Dwie odpowiedzi prawdopodobne'])).status, 'rejected'); assert.equal(await poolSize(), 2); checks++;
await owner();
assert.equal((await sql("select count(*)::integer c from public.academy_audit_events where action='QUESTION_DRAFT_APPROVED' and actor_id=$1", [ids.trainer])).rows[0].c, 1); checks++;

console.log(`Academy quiz analysis and drafts: ${checks} checks (${engine})`);
await db.close();
