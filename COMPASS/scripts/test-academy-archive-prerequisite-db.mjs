import assert from 'node:assert/strict';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const f = await createAcademyDatabase({ administrationControls: true });
const { db, ids, sql, actor, owner, rpc } = f;
let checks = 0;
let races = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const denied = async (statement, params, pattern) => { await f.expectDenied(statement, params, pattern); checks++; };

async function course(title, prerequisites = []) {
    await actor('trainer');
    const row = await rpc('academy_create_course', [{ title, category: 'IT', delivery_mode: 'live', prerequisite_course_ids: prerequisites }]);
    return { id: row.course_id, version: row.version_id };
}
async function submit(row) {
    await actor('trainer'); await rpc('academy_submit_for_review', [row.id]);
    return (await sql('select submission_id from course_versions where id=$1', [row.version])).rows[0].submission_id;
}
async function approve(row, token) {
    await actor('admin');
    await rpc('academy_review_course', [row.version, true, null, token]);
}
async function published(title, prerequisites = []) {
    const row = await course(title, prerequisites);
    await approve(row, await submit(row));
    return row;
}
async function waitForBlock(waiterPid, holderPid) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
        const { rows } = await sql('select $2::int=any(pg_blocking_pids($1::int)) blocked', [waiterPid, holderPid]);
        if (rows[0].blocked) { checks++; return; }
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail('Archive/publication did not contend on the prerequisite course');
}

try {
    await actor('admin');
    await rpc('academy_set_rollout', ['open', []]);
    await rpc('academy_set_trainer', [ids.trainer, true]);

    const prerequisite = await published('Required foundation');
    const dependent = await published('Published dependent', [prerequisite.id]);
    const unrelated = await published('Unrelated course');
    await actor('admin');
    await denied('select academy_archive_course($1)', [prerequisite.id], /archive_prerequisite_in_use/);
    await owner();
    equal((await sql('select status from courses where id=$1', [prerequisite.id])).rows[0].status, 'published');
    equal((await sql("select count(*)::int n from academy_audit_events where course_id=$1 and action='COURSE_ARCHIVED'", [prerequisite.id])).rows[0].n, 0);
    await actor('admin'); await rpc('academy_archive_course', [unrelated.id]);
    equal((await sql('select status from courses where id=$1', [unrelated.id])).rows[0].status, 'archived');

    // Publishing a replacement version without the dependency unblocks archive.
    await actor('trainer'); await rpc('academy_update_course', [dependent.id, { prerequisite_course_ids: [] }]);
    const replacement = (await sql('select draft_version_id from courses where id=$1', [dependent.id])).rows[0].draft_version_id;
    const replacementToken = await submit({ ...dependent, version: replacement });
    await approve({ ...dependent, version: replacement }, replacementToken);
    await actor('admin'); await rpc('academy_archive_course', [prerequisite.id]);
    equal((await sql('select status from courses where id=$1', [prerequisite.id])).rows[0].status, 'archived');
    equal((await sql('select status,published_version_id from courses where id=$1', [dependent.id])).rows[0], { status: 'published', published_version_id: replacement });
    equal((await sql("select metadata->'prerequisite_course_ids' AS ids from course_versions where id=$1", [dependent.version])).rows[0].ids, [prerequisite.id]);

    // A draft referring to an archived prerequisite cannot become active later.
    const secondPrerequisite = await published('Foundation for pending review');
    const pending = await course('Pending dependent', [secondPrerequisite.id]);
    const token = await submit(pending);
    await actor('admin'); await rpc('academy_archive_course', [secondPrerequisite.id]);
    await denied('select academy_review_course($1,true,null,$2)', [pending.version, token], /published_visible_prerequisites_required/);
    equal((await sql('select status from course_versions where id=$1', [pending.version])).rows[0].status, 'pending_review');

    if (f.engine === 'postgres') {
        const firstPrerequisite = await published('Race archive first prerequisite');
        const firstDependent = await course('Race archive first dependent', [firstPrerequisite.id]);
        const firstToken = await submit(firstDependent);
        const archiver = await f.connectSession('admin'), reviewer = await f.connectSession('admin');
        try {
            for (const connection of [archiver, reviewer]) await connection.db.exec("set statement_timeout='8s';set lock_timeout='6s'");
            const archiverPid = (await archiver.sql('select pg_backend_pid() pid')).rows[0].pid;
            const reviewerPid = (await reviewer.sql('select pg_backend_pid() pid')).rows[0].pid;
            await archiver.db.exec('begin'); await archiver.rpc('academy_archive_course', [firstPrerequisite.id]);
            const pendingReview = reviewer.rpc('academy_review_course', [firstDependent.version, true, null, firstToken]).then(value => ({ value }), error => ({ error }));
            await owner(); await waitForBlock(reviewerPid, archiverPid);
            await archiver.db.exec('commit');
            assert.match((await pendingReview).error?.message ?? '', /published_visible_prerequisites_required/); checks++; races++;
            equal((await sql('select status from courses where id=$1', [firstDependent.id])).rows[0].status, 'pending_review');
        } finally {
            await archiver.db.exec('rollback'); await reviewer.db.exec('rollback');
            await archiver.db.close(); await reviewer.db.close();
        }

        const second = await published('Race publication first prerequisite');
        const next = await course('Race publication first dependent', [second.id]);
        const nextToken = await submit(next);
        const publisher = await f.connectSession('admin'), closing = await f.connectSession('admin');
        try {
            for (const connection of [publisher, closing]) await connection.db.exec("set statement_timeout='8s';set lock_timeout='6s'");
            const publisherPid = (await publisher.sql('select pg_backend_pid() pid')).rows[0].pid;
            const closingPid = (await closing.sql('select pg_backend_pid() pid')).rows[0].pid;
            await publisher.db.exec('begin'); await publisher.rpc('academy_review_course', [next.version, true, null, nextToken]);
            const pendingArchive = closing.rpc('academy_archive_course', [second.id]).then(value => ({ value }), error => ({ error }));
            await owner(); await waitForBlock(closingPid, publisherPid);
            await publisher.db.exec('commit');
            assert.match((await pendingArchive).error?.message ?? '', /archive_prerequisite_in_use/); checks++; races++;
            equal((await sql('select status from courses where id=$1', [second.id])).rows[0].status, 'published');
        } finally {
            await publisher.db.exec('rollback'); await closing.db.exec('rollback');
            await publisher.db.close(); await closing.db.close();
        }
    }
    console.log(`academy archive prerequisite: ${checks} assertions, ${races} PostgreSQL races (${f.engine})`);
} finally {
    await db.close();
}
