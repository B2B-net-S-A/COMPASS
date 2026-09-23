import assert from 'node:assert/strict';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const f = await createAcademyDatabase({ runsPagination: true });
const { db, ids, sql, actor, owner, rpc } = f;
let checks = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
const denied = async (...args) => { await f.expectDenied(...args); checks++; };
const page = (courseId, offset, limit, scope, start = null, end = null, idsFilter = null) =>
    rpc('academy_list_runs_page', [courseId, offset, limit, scope, start, end, idsFilter]);

try {
    await actor('admin');
    await rpc('academy_set_rollout', ['open', []]);
    await rpc('academy_set_trainer', [ids.trainer, true]);
    await actor('trainer');
    const { course_id: course, version_id: version } = await rpc('academy_create_course', [{ title: 'Long edition history', category: 'IT', delivery_mode: 'live' }]);
    await rpc('academy_submit_for_review', [course]);
    const submission = (await sql('select submission_id from course_versions where id=$1', [version])).rows[0].submission_id;
    await actor('admin'); await rpc('academy_review_course', [version, true, null, submission]);

    // More than the original 200-run cap, with deterministic created_at order.
    await owner();
    await sql(`INSERT INTO course_runs(course_id,version_id,title,capacity,created_by,created_at)
        SELECT $1,$2,'Historic group '||n,20,$3,now()-interval '1 day' + (n||' seconds')::interval
        FROM generate_series(1,203) n`, [course, version, ids.trainer]);
    await actor('trainer');
    const run = await rpc('academy_create_run', [{ courseId: course, versionId: version, title: 'Next public group', capacity: 2 }]);
    const starts = '2030-09-15T10:00:00.000Z';
    const ends = '2030-09-15T11:00:00.000Z';
    const link = 'https://teams.microsoft.com/meet/123456789?p=secret';
    await rpc('academy_save_session', [{ runId: run, title: 'Next session', startsAt: starts, endsAt: ends, timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: link, required: true }]);
    await actor('admin'); await rpc('academy_publish_run', [run]);

    await actor('trainer');
    equal((await rpc('academy_list_runs', [course, null])).length, 200);
    const managed = [];
    for (const offset of [0, 100, 200]) managed.push(...await page(course, offset, 100, 'managed'));
    equal(managed.length, 204);
    equal(new Set(managed.map(item => item.id)).size, 204);
    equal(managed[0].id, run);
    equal(managed.at(-1).title, 'Historic group 1');
    equal((await page(course, 200, 5, 'managed')).length, 4);
    equal((await page(course, 204, 5, 'managed')).length, 0);

    const windowStart = '2030-09-01T00:00:00.000Z';
    const windowEnd = '2030-10-01T00:00:00.000Z';
    equal((await page(course, 0, 50, 'calendar', windowStart, windowEnd)).map(item => item.id), [run]);
    equal((await page(null, 0, 50, 'catalog', new Date().toISOString(), null, [course])).map(item => item.id), [run]);
    equal(await page(course, 0, 50, 'catalog', new Date().toISOString(), null, [ids.other]), []);
    equal(await page(course, 0, 50, 'my_calendar', windowStart, windowEnd), []);

    await actor('student');
    equal(await page(course, 0, 50, 'managed'), []);
    equal((await page(course, 0, 50, 'calendar', windowStart, windowEnd)).map(item => item.id), [run]);
    equal((await page(null, 0, 50, 'catalog', new Date().toISOString(), null, [course]))[0].sessions[0].joinUrl, null);
    equal(await page(course, 0, 50, 'registered'), []);
    const registration = await rpc('academy_register_run', [run]);
    equal(registration.status, 'confirmed');
    equal((await page(course, 0, 50, 'registered')).map(item => item.id), [run]);
    equal((await page(course, 0, 50, 'my_calendar', windowStart, windowEnd))[0].sessions[0].joinUrl, link);
    await denied('select academy_list_runs_page($1,-1,10,$2,null,null,null)', [course, 'managed'], /parametry/);
    await denied('select academy_list_runs_page($1,0,102,$2,null,null,null)', [course, 'managed'], /parametry/);
    await denied('select academy_list_runs_page($1,0,10,$2,null,null,null)', [course, 'calendar'], /parametry/);
    await denied('select academy_list_runs_page($1,0,10,$2,null,null,null)', [course, 'catalog'], /parametry/);
    await actor('internal'); await denied('select academy_list_runs_page($1,0,10,$2,null,null,null)', [course, 'managed'], /dostępu/);

    // A busy month remains browsable for a learner when it exceeds one page.
    await owner();
    await sql(`INSERT INTO course_runs(course_id,version_id,title,capacity,created_by,created_at)
        SELECT $1,$2,'Public group '||n,20,$3,now()-interval '2 days' + (n||' seconds')::interval
        FROM generate_series(1,55) n`, [course, version, ids.trainer]);
    await sql(`INSERT INTO course_sessions(run_id,title,starts_at,ends_at,time_zone,meeting_mode,external_join_url,required,status,sync_status,created_by)
        SELECT r.id,'Public lesson',$2::timestamptz,$3::timestamptz,'Europe/Warsaw','external_link',$4,true,'scheduled','ready',$5
        FROM course_runs r WHERE r.course_id=$1 AND r.title LIKE 'Public group %'`, [course, starts, ends, link, ids.trainer]);
    // These sessions fall in August Warsaw time but would fill the padded
    // September page before the in-month runs if filtering happened later.
    await sql(`INSERT INTO course_runs(course_id,version_id,title,capacity,created_by,created_at)
        SELECT $1,$2,'August group '||n,20,$3,now()-interval '3 days' + (n||' seconds')::interval
        FROM generate_series(1,55) n`, [course, version, ids.trainer]);
    await sql(`INSERT INTO course_sessions(run_id,title,starts_at,ends_at,time_zone,meeting_mode,external_join_url,required,status,sync_status,created_by)
        SELECT r.id,'August lesson','2030-08-31T21:30:00Z'::timestamptz,'2030-08-31T22:30:00Z'::timestamptz,
            'Europe/Warsaw','external_link',$2,true,'scheduled','ready',$3
        FROM course_runs r WHERE r.course_id=$1 AND r.title LIKE 'August group %'`, [course, link, ids.trainer]);
    await sql(`INSERT INTO course_runs(course_id,version_id,title,capacity,created_by)
        VALUES ($1,$2,'September boundary',20,$3)`, [course, version, ids.trainer]);
    await sql(`INSERT INTO course_sessions(run_id,title,starts_at,ends_at,time_zone,meeting_mode,external_join_url,required,status,sync_status,created_by)
        SELECT r.id,'Warsaw September 1','2030-08-31T22:30:00Z'::timestamptz,'2030-08-31T23:30:00Z'::timestamptz,
            'Europe/Warsaw','external_link',$2,true,'scheduled','ready',$3
        FROM course_runs r WHERE r.course_id=$1 AND r.title='September boundary'`, [course, link, ids.trainer]);
    await sql("select set_config('request.jwt.claim.sub',$1,false)", [ids.admin]);
    await sql("UPDATE course_runs SET status='published',published_by=$2,published_at=now() WHERE course_id=$1 AND (title LIKE 'Public group %' OR title LIKE 'August group %' OR title='September boundary')", [course, ids.admin]);
    await actor('student');
    const firstCalendar = await page(course, 0, 50, 'calendar', windowStart, windowEnd);
    const nextCalendar = await page(course, 50, 50, 'calendar', windowStart, windowEnd);
    equal(firstCalendar.length, 50); equal(nextCalendar.length, 7);
    equal(new Set([...firstCalendar, ...nextCalendar].map(item => item.id)).size, 57);
    equal(firstCalendar.every(item => !item.title.startsWith('August group')), true);
    equal(firstCalendar[0].title, 'September boundary');
    console.log(`PASS ${checks} Academy run pagination, filters and access assertions`);
} finally {
    await db.close();
}
