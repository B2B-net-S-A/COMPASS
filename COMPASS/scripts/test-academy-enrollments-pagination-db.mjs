import assert from 'node:assert/strict';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const f = await createAcademyDatabase({ enrollmentsPagination: true });
const { db, ids, sql, actor, owner, rpc } = f;
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const denied = async (...args) => { await f.expectDenied(...args); checks++; };
const page = (active = 1, completed = 1, revoked = 1, limit = 24) =>
    rpc('academy_my_enrollments_page', [active, completed, revoked, limit]);

try {
    await actor('admin');
    await rpc('academy_set_rollout', ['open', []]);
    await rpc('academy_set_trainer', [ids.trainer, true]);
    await actor('trainer');
    const { course_id: course, version_id: version } = await rpc('academy_create_course', [{ title: 'Paged learning history', category: 'IT', delivery_mode: 'live' }]);
    await rpc('academy_submit_for_review', [course]);
    const submission = (await sql('select submission_id from course_versions where id=$1', [version])).rows[0].submission_id;
    await actor('admin');
    await rpc('academy_review_course', [version, true, null, submission]);

    await owner();
    await sql(`INSERT INTO public.course_runs(course_id,version_id,title,capacity,status,created_by,published_by,published_at,created_at)
        SELECT $1,$2,'History run '||n,20,'published',$3,$4,now(),now()-interval '1 day'+(n||' seconds')::interval
        FROM generate_series(1,1005) n`, [course, version, ids.trainer, ids.admin]);
    await sql(`INSERT INTO public.course_enrollments(user_id,course_id,version_id,run_id,enrolled_at)
        SELECT $2,$1,$3,r.id,r.created_at FROM public.course_runs r WHERE r.course_id=$1`, [course, ids.student, version]);
    await sql(`INSERT INTO public.course_run_registrations(run_id,user_id,enrollment_id,status)
        SELECT e.run_id,e.user_id,e.id,'confirmed' FROM public.course_enrollments e
        WHERE e.user_id=$1 AND e.course_id=$2 AND e.run_id IS NOT NULL`, [ids.student, course]);

    await actor('student');
    const first = await page();
    equal(first.totals.active, 1005);
    equal(first.totals.completed, 1); // Baseline legacy completion remains visible.
    equal(first.items.filter(item => item.enrollment.section === 'active').length, 24);
    equal(first.items.filter(item => item.enrollment.section === 'completed').length, 1);
    const last = await page(42);
    equal(last.items.filter(item => item.enrollment.section === 'active').length, 21);
    equal(last.totals.active, 1005);
    const allIds = [];
    for (let activePage = 1; activePage <= 42; activePage++) {
        const result = await page(activePage, 2, 2);
        allIds.push(...result.items.map(item => item.enrollment.id));
    }
    equal(allIds.length, 1005);
    equal(new Set(allIds).size, 1005);
    equal((await page(43)).items.filter(item => item.enrollment.section === 'active').length, 0);
    await denied('select public.academy_my_enrollments_page(0,1,1,24)', [], /parametry/);
    await denied('select public.academy_my_enrollments_page(1,1,1,51)', [], /parametry/);
    await actor('other');
    equal((await page()).totals.active, 0);
    await actor('internal');
    await denied('select public.academy_my_enrollments_page(1,1,1,24)', [], /dostępu/);
    await actor('', 'anon');
    await denied('select public.academy_my_enrollments_page(1,1,1,24)', [], /permission denied/);
    console.log(`PASS ${checks} Academy learner history pagination and access assertions`);
} finally {
    await db.close();
}
