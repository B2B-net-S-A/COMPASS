/** Wspólny start testów SQL toru B2: pełny łańcuch migracji Akademii i kurs do opublikowania. */
import { createAcademyDatabase } from './academy-db-fixture.mjs';

const chain = ['academy_quiz_attempt_window', 'academy_tcm_full_editor', 'academy_quiz_pool', 'academy_quiz_attempt_session', 'academy_question_void', 'academy_assessment_mode',
    'academy_pre_test_summary', 'academy_participation_documents', 'academy_question_analysis', 'academy_question_drafts'];

/** `through` to ostatnia migracja B2 w łańcuchu (sufiks pliku). */
export async function createQuizDatabase({ through = 'academy_quiz_pool', ...options } = {}) {
    const end = chain.indexOf(through);
    if (end < 0) throw new Error(`Unknown B2 migration: ${through}`);
    const fixture = await createAcademyDatabase({ patrykCycle: true, extraMigrations: chain.slice(0, end + 1), ...options });
    const { actor, rpc, query: sql, ids } = fixture;
    await actor('admin');
    await rpc('academy_set_rollout', ['pilot', [ids.trainer, ids.student, ids.other]]);
    await rpc('academy_set_trainer', [ids.trainer, true]);
    return fixture;
}

export const makeQuestions = (count, { topic = index => `Temat ${index % 3}`, explanation = false } = {}) =>
    Array.from({ length: count }, (_, index) => ({
        question_text: `Pytanie ${index + 1}`, topic_tag: topic(index),
        options: Array.from({ length: 4 }, (__, option) => ({
            option_text: `Odpowiedź ${option + 1}`, is_correct: option === 0,
            ...(explanation ? { explanation: `Wyjaśnienie ${index + 1}.${option + 1}` } : {}),
        })),
    }));

/** Tworzy szkic kursu samodzielnego jako trener (lekcja + pula), bez publikacji. */
export async function draftCourse(fixture, { title = 'Kurs testowy', rules = {}, questions = makeQuestions(12), mode = 'self_paced' } = {}) {
    const { actor, rpc, query: sql } = fixture;
    await actor('trainer');
    const created = await rpc('academy_create_course', [{ title, category: 'IT', delivery_mode: mode, completion_rules: rules }]);
    if (mode !== 'assessment') await sql("insert into public.course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Lekcja',0,'Treść')", [created.course_id, created.version_id]);
    await rpc('academy_replace_quiz', [created.course_id, JSON.stringify(questions)]);
    return { courseId: created.course_id, versionId: created.version_id };
}

export async function publishCourse(fixture, { courseId, versionId }) {
    const { actor, rpc, query: sql } = fixture;
    await actor('trainer');
    await rpc('academy_submit_for_review', [courseId]);
    await actor('admin');
    const token = (await sql('select submission_id from public.course_versions where id=$1', [versionId])).rows[0].submission_id;
    await rpc('academy_review_course', [versionId, true, null, token]);
}
