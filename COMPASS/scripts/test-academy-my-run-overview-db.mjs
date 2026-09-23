import assert from 'node:assert/strict';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const f = await createAcademyDatabase({ myRunOverview: true });
const { db, ids, sql, actor, owner, rpc } = f;
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const denied = async (...args) => { await f.expectDenied(...args); checks++; };
const overview = (page = 1, limit = 25) => rpc('academy_my_run_overview', [page, limit]);

try {
    await actor('admin');
    await rpc('academy_set_rollout', ['open', []]);
    await rpc('academy_set_trainer', [ids.trainer, true]);
    await actor('trainer');
    const { course_id: course, version_id: version } = await rpc('academy_create_course', [
        { title: 'Paginowana lista rezerwowa', category: 'IT', delivery_mode: 'live' },
    ]);
    await rpc('academy_submit_for_review', [course]);
    const submission = (await sql('select submission_id from course_versions where id=$1', [version])).rows[0].submission_id;
    await actor('admin');
    await rpc('academy_review_course', [version, true, null, submission]);

    // The second learner holds every place. A thousand real waitlisted rows
    // must not cause a thousand run DTOs and sessions to reach the page.
    await owner();
    await sql(`INSERT INTO course_runs(course_id,version_id,title,capacity,created_by,created_at)
        SELECT $1,$2,'Grupa '||n,1,$3,now()-interval '1 day'+(n||' seconds')::interval
        FROM generate_series(1,1005) n`, [course, version, ids.trainer]);
    await sql(`INSERT INTO course_sessions(run_id,title,starts_at,ends_at,time_zone,meeting_mode,external_join_url,required,created_by,sync_status)
        SELECT id,'Spotkanie '||title,'2030-09-15T10:00:00Z','2030-09-15T11:00:00Z',
            'Europe/Warsaw','external_link','https://teams.microsoft.com/meet/123456789',true,$2,'ready'
        FROM course_runs WHERE course_id=$1`, [course, ids.trainer]);
    await sql("select set_config('request.jwt.claim.sub',$1,false)", [ids.admin]);
    await sql("UPDATE course_runs SET status='published',published_by=$2,published_at=now() WHERE course_id=$1", [course, ids.admin]);
    await owner();
    await sql(`INSERT INTO course_enrollments(user_id,course_id,version_id,run_id)
        SELECT $2,$1,$3,id FROM course_runs WHERE course_id=$1`, [course, ids.other, version]);
    await sql(`INSERT INTO course_run_registrations(run_id,user_id,enrollment_id,status)
        SELECT run_id,user_id,id,'confirmed' FROM course_enrollments WHERE course_id=$1 AND user_id=$2 AND run_id IS NOT NULL`,
    [course, ids.other]);
    await sql(`INSERT INTO course_run_registrations(run_id,user_id,status)
        SELECT id,$2,'waitlisted' FROM course_runs WHERE course_id=$1`, [course, ids.student]);

    await actor('student');
    const first = await overview();
    equal(first.waiting.total, 1005);
    equal(first.waiting.items.length, 25);
    equal(first.waiting.items[0].courseTitle, 'Paginowana lista rezerwowa');
    equal(first.upcoming, null);
    const last = await overview(41);
    equal(last.waiting.items.length, 5);
    const idsSeen = [];
    for (let page = 1; page <= 41; page++) idsSeen.push(...(await overview(page)).waiting.items.map(item => item.runId));
    equal(idsSeen.length, 1005);
    equal(new Set(idsSeen).size, 1005);
    equal((await overview(42)).waiting.items.length, 0);

    await owner();
    const cancelledRun = (await sql(`INSERT INTO course_runs(course_id,version_id,title,capacity,status,created_by)
        VALUES($1,$2,'Odwołana edycja',1,'cancelled',$3) RETURNING id`, [course, version, ids.trainer])).rows[0].id;
    await sql("INSERT INTO course_run_registrations(run_id,user_id,status) VALUES($1,$2,'waitlisted')", [cancelledRun, ids.student]);
    await actor('student');
    equal((await overview()).waiting.total, 1005);

    await owner();
    const futureRun = (await sql(`INSERT INTO course_runs(course_id,version_id,title,capacity,created_by)
        VALUES($1,$2,'Odległa edycja',1,$3) RETURNING id`,
    [course, version, ids.trainer])).rows[0].id;
    await sql(`INSERT INTO course_sessions(run_id,title,starts_at,ends_at,time_zone,meeting_mode,external_join_url,required,created_by,sync_status)
        VALUES($1,'Najbliższe dalekie spotkanie','2040-09-15T10:00:00Z','2040-09-15T11:00:00Z',
            'Europe/Warsaw','external_link','https://teams.microsoft.com/meet/123456789',true,$2,'ready')`, [futureRun, ids.trainer]);
    await sql("select set_config('request.jwt.claim.sub',$1,false)", [ids.admin]);
    await sql("UPDATE course_runs SET status='published',published_by=$2,published_at=now() WHERE id=$1", [futureRun, ids.admin]);
    await owner();
    const enrollment = (await sql(`INSERT INTO course_enrollments(user_id,course_id,version_id,run_id)
        VALUES($1,$2,$3,$4) RETURNING id`, [ids.student, course, version, futureRun])).rows[0].id;
    await sql(`INSERT INTO course_run_registrations(run_id,user_id,enrollment_id,status)
        VALUES($1,$2,$3,'confirmed')`, [futureRun, ids.student, enrollment]);
    await actor('student');
    equal((await overview()).upcoming.runId, futureRun);
    equal((await overview()).upcoming.sessionTitle, 'Najbliższe dalekie spotkanie');

    // Archival stops new admissions but preserves existing reservations.
    await actor('admin');
    await rpc('academy_archive_course', [course]);
    await actor('student');
    equal((await overview()).waiting.total, 1005);
    equal((await overview()).waiting.items[0].courseTitle, 'Paginowana lista rezerwowa');
    equal((await overview()).upcoming.runId, futureRun);
    await actor('other');
    equal((await overview()).waiting.total, 0);
    await denied('select public.academy_my_run_overview(0,25)', [], /parametry/);
    await denied('select public.academy_my_run_overview(1,26)', [], /parametry/);
    await actor('internal');
    await denied('select public.academy_my_run_overview(1,25)', [], /dostępu/);
    await actor('', 'anon');
    await denied('select public.academy_my_run_overview(1,25)', [], /permission denied/);
    await actor('admin');
    await rpc('academy_set_rollout', ['closed', []]);
    await actor('student');
    await denied('select public.academy_my_run_overview(1,25)', [], /dostępu/);
    console.log(`PASS ${checks} bounded learner run overview and access assertions`);
} finally {
    await db.close();
}
