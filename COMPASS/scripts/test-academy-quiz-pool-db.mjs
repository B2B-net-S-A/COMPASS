// B2.1: pula pytań, konfiguracja wersji i brzegi walidacji, także po migracji na istniejącej wersji.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';
import { draftCourse, makeQuestions, publishCourse } from './lib/academy-quiz-fixture.mjs';

// Wersja opublikowana PRZED migracją zostaje przy dotychczasowych ustawieniach.
const fixture = await createAcademyDatabase({ patrykCycle: true, extraMigrations: ['academy_quiz_attempt_window', 'academy_tcm_full_editor'] });
const { db, ids, query: sql, actor, owner, rpc, expectDenied } = fixture;
let checks = 0;
await actor('admin');
await rpc('academy_set_rollout', ['pilot', [ids.trainer, ids.student, ids.other]]);
await rpc('academy_set_trainer', [ids.trainer, true]);
const legacyPublished = await draftCourse(fixture, { title: 'Przed migracją', questions: makeQuestions(4).map(({ topic_tag, ...question }) => question) });
await publishCourse(fixture, legacyPublished);
const before = (await sql('select completion_rules,quiz_attempt_limit,quiz_attempt_window_hours from public.course_versions where id=$1', [legacyPublished.versionId])).rows[0];

await owner();
const migrationPath = fileURLToPath(new URL('../supabase/migrations/20261109200100_academy_quiz_pool.sql', import.meta.url));
await db.exec(fs.readFileSync(migrationPath, 'utf8'));
assert.deepEqual((await sql('select completion_rules,quiz_attempt_limit,quiz_attempt_window_hours from public.course_versions where id=$1', [legacyPublished.versionId])).rows[0], before); checks++;
assert.equal((await sql("select count(*)::integer c from public.course_quiz_questions where version_id=$1 and pool_status='approved' and topic_tag is null and voided_at is null", [legacyPublished.versionId])).rows[0].c, 4); checks++;
assert.equal((await sql("select to_regprocedure('public.get_quiz_for_attempt(uuid)') a, to_regprocedure('public.submit_quiz_attempt(uuid,jsonb)') b")).rows[0].a, null); checks++;

// Duża pula z tagami i wyjaśnieniami; zdjęte sztywne 4-10 i dokładnie 4 opcje.
const pool = await draftCourse(fixture, { title: 'Pula 30', questions: makeQuestions(30, { explanation: true }), rules: { draw_count: 10, time_limit_minutes: 20, show_explanations: true } });
const stored = (await sql('select count(*)::integer c,count(distinct topic_tag)::integer t from public.course_quiz_questions where version_id=$1', [pool.versionId])).rows[0];
assert.deepEqual(stored, { c: 30, t: 3 }); checks++;
assert.equal((await sql('select count(*)::integer c from public.course_quiz_options o join public.course_quiz_questions q on q.id=o.question_id where q.version_id=$1 and o.explanation is not null', [pool.versionId])).rows[0].c, 120); checks++;
const few = await draftCourse(fixture, { title: 'Trzy pytania', questions: makeQuestions(3).map(q => ({ ...q, options: q.options.slice(0, 2) })) });
await rpc('academy_submit_for_review', [few.courseId]); checks++;

// Brzegi walidacji pytań.
const reject = async (questions, pattern) => expectDenied('select public.academy_replace_quiz($1,$2)', [pool.courseId, JSON.stringify(questions)], pattern);
const one = makeQuestions(1)[0];
await reject([{ ...one, options: one.options.slice(0, 1) }], /invalid_quiz_question/); checks++;
await reject([{ ...one, options: [...one.options, ...one.options] }], /invalid_quiz_question/); checks++;
await reject([{ ...one, options: one.options.map(o => ({ ...o, is_correct: true })) }], /invalid_quiz_question/); checks++;
await reject([{ ...one, options: one.options.map(o => ({ ...o, is_correct: false })) }], /invalid_quiz_question/); checks++;
await reject([{ ...one, topic_tag: 'x'.repeat(81) }], /invalid_quiz_question/); checks++;
await reject([{ ...one, options: one.options.map(o => ({ ...o, explanation: 'x'.repeat(2001) })) }], /invalid_quiz_option/); checks++;
await reject(makeQuestions(301), /invalid_quiz_questions/); checks++;

// Szkic puli bez klucza przechodzi zapis, nie liczy się do puli i nie blokuje recenzji.
const draftState = await draftCourse(fixture, { title: 'Szkic w puli', questions: [
    ...makeQuestions(2),
    { ...one, pool_status: 'draft', options: one.options.map(o => ({ ...o, is_correct: false })) },
], rules: { draw_count: 3 } });
await expectDenied('select public.academy_submit_for_review($1)', [draftState.courseId], /quiz_pool_smaller_than_draw/); checks++;
await rpc('academy_update_course', [draftState.courseId, { completion_rules: { draw_count: 2 } }]);
await rpc('academy_submit_for_review', [draftState.courseId]); checks++;

// Konfiguracja wersji: pula a losowanie, wyjaśnienia wymagają puli co najmniej 2x.
for (const [rules, pattern] of [
    [{ draw_count: 0 }, /invalid_quiz_configuration/], [{ draw_count: 2.5 }, /invalid_quiz_configuration/],
    [{ time_limit_minutes: 481 }, /invalid_quiz_configuration/], [{ show_explanations: 'tak' }, /invalid_quiz_configuration/],
    [{ pre_test_count: 0 }, /invalid_quiz_configuration/],
]) {
    await expectDenied('select public.academy_update_course($1,$2)', [pool.courseId, JSON.stringify({ completion_rules: rules })], pattern); checks++;
}
const tight = await draftCourse(fixture, { title: 'Za mała pula', questions: makeQuestions(19), rules: { draw_count: 10, show_explanations: true } });
await expectDenied('select public.academy_submit_for_review($1)', [tight.courseId], /quiz_explanations_need_larger_pool/); checks++;
const noDraw = await draftCourse(fixture, { title: 'Bez losowania', questions: makeQuestions(20), rules: { show_explanations: true } });
await expectDenied('select public.academy_submit_for_review($1)', [noDraw.courseId], /quiz_explanations_need_larger_pool/); checks++;
const fixedSet = await draftCourse(fixture, { title: 'Stały zestaw', questions: makeQuestions(20), rules: { draw_count: 5, show_explanations: true, draw_random: false } });
await expectDenied('select public.academy_submit_for_review($1)', [fixedSet.courseId], /quiz_explanations_need_larger_pool/); checks++;
const none = await draftCourse(fixture, { title: 'Bez pytań', questions: [] });
await expectDenied('select public.academy_submit_for_review($1)', [none.courseId], /quiz_requires_questions/); checks++;

// Limit podejść to ustawienie wersji roboczej, z bramką uprawnień i zamrożeniem po publikacji.
await rpc('academy_set_quiz_attempt_policy', [pool.courseId, 5, 48]);
assert.deepEqual((await sql('select quiz_attempt_limit l,quiz_attempt_window_hours h from public.course_versions where id=$1', [pool.versionId])).rows[0], { l: 5, h: 48 }); checks++;
await expectDenied('select public.academy_set_quiz_attempt_policy($1,$2,$3)', [pool.courseId, 11, 24], /invalid_quiz_attempt_policy/); checks++;
await expectDenied('select public.academy_set_quiz_attempt_policy($1,$2,$3)', [pool.courseId, 3, 169], /invalid_quiz_attempt_policy/); checks++;
await expectDenied('select public.academy_set_quiz_attempt_policy($1,$2,$3)', [pool.courseId, null, 24], /invalid_quiz_attempt_policy/); checks++;
await actor('student');
await expectDenied('select public.academy_set_quiz_attempt_policy($1,$2,$3)', [pool.courseId, 2, 24], /trainer_course_required/); checks++;
await actor('admin', 'anon');
await expectDenied('select public.academy_set_quiz_attempt_policy($1,$2,$3)', [pool.courseId, 2, 24], /permission denied/); checks++;

await publishCourse(fixture, pool);
await owner();
await expectDenied('update public.course_versions set quiz_attempt_limit=2 where id=$1', [pool.versionId], /immutable_quiz_attempt_policy/); checks++;
await expectDenied('update public.course_versions set quiz_attempt_limit=null,quiz_attempt_window_hours=null where id=$1', [pool.versionId], /immutable_quiz_attempt_policy/); checks++;

// Nowy szkic kopiuje konfigurację, tagi i wyjaśnienia.
await actor('trainer');
const nextVersion = await rpc('academy_begin_draft', [pool.courseId]);
assert.deepEqual((await sql('select quiz_attempt_limit l,quiz_attempt_window_hours h,completion_rules->>\'draw_count\' d from public.course_versions where id=$1', [nextVersion])).rows[0], { l: 5, h: 48, d: '10' }); checks++;
assert.equal((await sql('select count(*)::integer c from public.course_quiz_options o join public.course_quiz_questions q on q.id=o.question_id where q.version_id=$1 and o.explanation is not null and q.topic_tag is not null', [nextVersion])).rows[0].c, 120); checks++;

// Uczestnik nie czyta pytań ani opcji z puli wprost.
await actor('student');
assert.equal((await sql('select count(*)::integer c from public.course_quiz_options')).rows[0].c, 0); checks++;
assert.equal((await sql('select count(*)::integer c from public.course_quiz_questions')).rows[0].c, 0); checks++;

console.log(`Academy quiz pool: ${checks} checks (${fixture.engine})`);
await db.close();
