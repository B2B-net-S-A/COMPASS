// Host-native proof for bounded Q&A rewards and historical ledger backfill.
// The hosted PostgreSQL leg also races independent authenticated sessions.
import assert from 'node:assert/strict';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

let cutoverCommit;
let lateReward;
let stalledQuestion;
let stalledAnswer;
const fixture = await createAcademyDatabase({
    qaRewards: true,
    beforeQaRewardsMigration: async (db, { ids, legacy, engine, connect }) => {
        const version = (await db.query('select id from public.course_versions where course_id=$1', [legacy])).rows[0].id;
        const enrollment = (await db.query('select id from public.course_enrollments where course_id=$1 and user_id=$2', [legacy, ids.student])).rows[0].id;
        const question = (await db.query("insert into public.course_questions(course_id,version_id,enrollment_id,user_id,question_text) values($1,$2,$3,$4,'Historical rewarded question') returning id", [legacy, version, enrollment, ids.student])).rows[0].id;
        const answer = (await db.query("insert into public.course_answers(question_id,user_id,answer_text,is_author_answer) values($1,$2,'Historical rewarded answer',true) returning id", [question, ids.admin])).rows[0].id;
        await db.query("insert into public.loyalty_transactions(user_id,points,source_type,source_id,description) values($1,5,'course_question_asked',$2,'Historical question'),($3,15,'course_answer_given',$4,'Historical answer')", [ids.student, question, ids.admin, answer]);
        const repeated = (await db.query("insert into public.course_questions(course_id,version_id,enrollment_id,user_id,question_text) values($1,$2,$3,$4,'Another historical rewarded question') returning id", [legacy, version, enrollment, ids.student])).rows[0].id;
        const repeatedAnswer = (await db.query("insert into public.course_answers(question_id,user_id,answer_text,is_author_answer) values($1,$2,'Another historical rewarded answer',true) returning id", [repeated, ids.admin])).rows[0].id;
        await db.query("insert into public.loyalty_transactions(user_id,points,source_type,source_id,description) values($1,5,'course_question_asked',$2,'Historical repeat'),($3,15,'course_answer_given',$4,'Historical repeat')", [ids.student, repeated, ids.admin, repeatedAnswer]);
        stalledQuestion = (await db.query("insert into public.course_questions(course_id,version_id,enrollment_id,user_id,question_text) values($1,$2,$3,$4,'Question awaiting old RPC payout') returning id", [legacy, version, enrollment, ids.student])).rows[0].id;
        stalledAnswer = (await db.query("insert into public.course_answers(question_id,user_id,answer_text,is_author_answer) values($1,$2,'Answer awaiting old RPC payout',true) returning id", [stalledQuestion, ids.admin])).rows[0].id;
        if (engine === 'postgres') {
            const pending = (await db.query("insert into public.course_questions(course_id,version_id,user_id,question_text) values($1,$2,$3,'Question paid during migration cutover') returning id", [legacy, version, ids.other])).rows[0].id;
            const writer = await connect();
            const observer = await connect();
            const migrationPid = (await db.query('select pg_backend_pid() pid')).rows[0].pid;
            await writer.exec('BEGIN');
            await writer.query("insert into public.loyalty_transactions(user_id,points,source_type,source_id,description) values($1,5,'course_question_asked',$2,'In-flight historical reward')", [ids.other, pending]);
            // The migration must wait for this old-style ledger INSERT to commit
            // before taking its backfill snapshot. Without its explicit lock,
            // the other user's claim will be missing after migration.
            cutoverCommit = (async () => {
                let sawWaitingLock = false;
                try {
                    const deadline = Date.now() + 5000;
                    while (Date.now() < deadline) {
                        const locks = await observer.query("select 1 from pg_locks where pid=$1 and relation='public.loyalty_transactions'::regclass and mode='ShareRowExclusiveLock' and not granted", [migrationPid]);
                        if (locks.rows.length) { sawWaitingLock = true; break; }
                        await new Promise(resolve => setTimeout(resolve, 25));
                    }
                    assert.ok(sawWaitingLock, 'migration must wait for an in-flight ledger INSERT');
                    const late = await connect();
                    const latePid = (await late.query('select pg_backend_pid() pid')).rows[0].pid;
                    lateReward = late.query("insert into public.loyalty_transactions(user_id,points,source_type,source_id,description) values($1,5,'course_question_asked',$2,'Old body resumed after cutover')", [ids.student, stalledQuestion])
                        .finally(() => late.close());
                    let lateQueued = false;
                    const lateDeadline = Date.now() + 5000;
                    while (Date.now() < lateDeadline) {
                        const locks = await observer.query("select 1 from pg_locks where pid=$1 and relation='public.loyalty_transactions'::regclass and mode='RowExclusiveLock' and not granted", [latePid]);
                        if (locks.rows.length) { lateQueued = true; break; }
                        await new Promise(resolve => setTimeout(resolve, 25));
                    }
                    assert.ok(lateQueued, 'old-body INSERT must queue behind migration cutover');
                    await writer.exec('COMMIT');
                } finally {
                    if (!sawWaitingLock) await writer.exec('ROLLBACK');
                    await Promise.all([writer.close(), observer.close()]);
                }
            })();
        }
    },
});
const { db, ids, legacy, query: sql, actor, owner, rpc } = fixture;
if (cutoverCommit) await cutoverCommit;
if (lateReward) assert.equal((await lateReward).rowCount, 0, 'a queued old-body INSERT must be suppressed by the new trigger');

async function rewardCount(courseId, kind) {
    const join = kind === 'course_question_asked'
        ? 'JOIN public.course_questions q ON q.id=tx.source_id'
        : 'JOIN public.course_answers a ON a.id=tx.source_id JOIN public.course_questions q ON q.id=a.question_id';
    return (await sql(`select count(*)::int n from public.loyalty_transactions tx ${join} where q.course_id=$1 and tx.source_type=$2`, [courseId, kind])).rows[0].n;
}
async function claimCount(courseId, kind, userId) {
    return (await sql('select count(*)::int n from public.academy_reward_claims where course_id=$1 and reward_kind=$2 and user_id=$3', [courseId, kind, userId])).rows[0].n;
}
async function publishCourse(title) {
    await actor('trainer');
    const course = await rpc('academy_create_course', [{ title, category: 'IT', delivery_mode: 'self_paced', completion_rules: { quiz_required: false } }]);
    await sql("insert into public.course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Lesson',0,'Learning content')", [course.course_id, course.version_id]);
    await rpc('academy_submit_for_review', [course.course_id]);
    await actor('admin');
    const submission = (await sql('select submission_id from public.course_versions where id=$1', [course.version_id])).rows[0].submission_id;
    await rpc('academy_review_course', [course.version_id, true, null, submission]);
    return course.course_id;
}

await owner();
assert.equal(await claimCount(legacy, 'question_engagement', ids.student), 1);
assert.equal(await claimCount(legacy, 'author_answer', ids.admin), 1);
if (fixture.engine === 'postgres') assert.equal(await claimCount(legacy, 'question_engagement', ids.other), 1, 'cutover waits for an in-flight historical payout');
assert.equal((await sql("select count(*)::int n from public.academy_reward_claims where course_id=$1 and legacy and reward_kind in ('question_engagement','author_answer')", [legacy])).rows[0].n, fixture.engine === 'postgres' ? 3 : 2);
assert.equal(await rewardCount(legacy, 'course_question_asked'), fixture.engine === 'postgres' ? 3 : 2);
assert.equal(await rewardCount(legacy, 'course_answer_given'), 2);
// Simulate an old Q&A function body that created content before the migration
// and reaches the ledger after it commits. The trigger must suppress a repeat.
await sql("insert into public.loyalty_transactions(user_id,points,source_type,source_id,description) values($1,5,'course_question_asked',$2,'Late old question'),($3,15,'course_answer_given',$4,'Late old answer')", [ids.student, stalledQuestion, ids.admin, stalledAnswer]);
assert.equal(await rewardCount(legacy, 'course_question_asked'), fixture.engine === 'postgres' ? 3 : 2);
assert.equal(await rewardCount(legacy, 'course_answer_given'), 2);

await actor('admin');
await rpc('academy_set_rollout', ['pilot', [ids.trainer, ids.student, ids.other]]);
await rpc('academy_set_trainer', [ids.trainer, true]);
const course = await publishCourse('Bounded Q&A rewards');
await actor('student');
const enrollment = await rpc('academy_enroll', [course, null]);
const first = await rpc('academy_ask_question', [enrollment, 'How does this lesson work?', null]);
assert.equal(await rpc('academy_ask_question', [enrollment, 'How does this lesson work?', null]), first, 'identical retry preserves question ID');
const second = await rpc('academy_ask_question', [enrollment, 'Could you provide another example?', null]);
assert.notEqual(first, second);
await actor('trainer');
const firstAnswer = await rpc('academy_answer_question', [first, 'Apply the first example.']);
assert.equal(await rpc('academy_answer_question', [first, 'Apply the first example.']), firstAnswer);
await rpc('academy_answer_question', [second, 'Apply the second example.']);
await owner();
assert.equal((await sql('select count(*)::int n from public.course_questions where course_id=$1', [course])).rows[0].n, 2);
assert.equal((await sql('select count(*)::int n from public.course_answers where question_id in ($1,$2)', [first, second])).rows[0].n, 2);
assert.equal(await rewardCount(course, 'course_question_asked'), 1);
assert.equal(await rewardCount(course, 'course_answer_given'), 1);
assert.equal(await claimCount(course, 'question_engagement', ids.student), 1);
assert.equal(await claimCount(course, 'author_answer', ids.trainer), 1);
await actor('student');
await fixture.expectDenied("insert into public.academy_reward_claims(user_id,course_id,reward_kind) values($1,$2,'question_engagement')", [ids.student, course]);

if (fixture.engine === 'postgres') {
    await actor('other');
    const otherEnrollment = await rpc('academy_enroll', [course, null]);
    const [askA, askB] = await Promise.all([fixture.connectSession('other'), fixture.connectSession('other')]);
    try {
        const idsCreated = await Promise.all([
            askA.rpc('academy_ask_question', [otherEnrollment, 'Concurrent question one', null]),
            askB.rpc('academy_ask_question', [otherEnrollment, 'Concurrent question two', null]),
        ]);
        assert.notEqual(idsCreated[0], idsCreated[1]);
    } finally { await Promise.all([askA.db.close(), askB.db.close()]); }
    await owner();
    assert.equal(await claimCount(course, 'question_engagement', ids.other), 1);
    assert.equal((await sql("select count(*)::int n from public.loyalty_transactions tx join public.course_questions q on q.id=tx.source_id where q.course_id=$1 and tx.user_id=$2 and tx.source_type='course_question_asked'", [course, ids.other])).rows[0].n, 1);

    const parallelCourse = await publishCourse('Concurrent author answers');
    await actor('student');
    const parallelEnrollment = await rpc('academy_enroll', [parallelCourse, null]);
    const q1 = await rpc('academy_ask_question', [parallelEnrollment, 'What is the first approach?', null]);
    const q2 = await rpc('academy_ask_question', [parallelEnrollment, 'What is the second approach?', null]);
    const [answerA, answerB] = await Promise.all([fixture.connectSession('trainer'), fixture.connectSession('trainer')]);
    try {
        const answerIds = await Promise.all([
            answerA.rpc('academy_answer_question', [q1, 'First independent author answer']),
            answerB.rpc('academy_answer_question', [q2, 'Second independent author answer']),
        ]);
        assert.notEqual(answerIds[0], answerIds[1]);
    } finally { await Promise.all([answerA.db.close(), answerB.db.close()]); }
    await owner();
    assert.equal(await claimCount(parallelCourse, 'author_answer', ids.trainer), 1);
    assert.equal(await rewardCount(parallelCourse, 'course_answer_given'), 1);
}

console.log(`PASS Q&A reward bounds, historical backfill and ${fixture.engine === 'postgres' ? 'independent-session races' : 'native SQL rules'}`);
await db.close();
