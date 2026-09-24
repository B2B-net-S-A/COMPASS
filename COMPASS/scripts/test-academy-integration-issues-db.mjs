import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ live: true });
const { db, ids, sql, actor, owner, rpc, expectDenied } = fixture;
let checks = 0;
const expect = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const page = (cursor = null, limit = 50) => rpc('academy_integration_issues_page', [cursor?.updatedAt ?? null, cursor?.id ?? null, limit]);

async function seedCourse(author, count, title, baseYear, status = 'pending') {
    await actor(author);
    const created = await rpc('academy_create_course', [{ title, category: 'IT', delivery_mode: 'live' }]);
    await owner();
    const run = (await sql(`insert into public.course_runs(course_id,version_id,title,capacity,created_by)
        values($1,$2,$3,20,$4) returning id`, [created.course_id, created.version_id, title, ids[author]])).rows[0].id;
    await sql(`insert into public.course_sessions(run_id,title,starts_at,ends_at,time_zone,meeting_mode,external_join_url,created_by)
        select $1,$2||' '||n,'2030-01-01T10:00:00Z','2030-01-01T11:00:00Z','Europe/Warsaw',
            'external_link','https://teams.microsoft.com/meet/123456789',$3
        from generate_series(1,$4::integer) n`, [run, title, ids[author], count]);
    await sql(`insert into public.academy_integration_jobs(session_id,revision,kind,status,updated_at,last_error)
        select s.id,1,'sync_meeting',$2,
            make_timestamptz($3,1,1,0,0,0,'UTC') +
            ((substring(s.title from '([0-9]+)$')::integer / 2) * interval '1 second'),
            case when $2='failed' then 'fixture_failure' else null end
        from public.course_sessions s where s.run_id=$1`, [run, status, baseYear]);
    return run;
}

try {
    await actor('admin');
    await rpc('academy_set_trainer', [ids.trainer, true]);
    await rpc('academy_set_trainer', [ids.other, true]);
    await seedCourse('trainer', 225, 'Visible issues', 2030, 'failed');
    await seedCourse('other', 5, 'Foreign issues', 2035, 'failed');
    await seedCourse('trainer', 10, 'Finished jobs', 2036, 'done');

    await actor('trainer');
    expect((await rpc('academy_integration_issues')).length, 100);
    await owner();
    await db.exec(readFileSync(new URL('../supabase/migrations/20260923154003_academy_integration_issues_pagination.sql', import.meta.url), 'utf8'));
    await actor('trainer');

    const seen = [];
    let cursor = null;
    for (let number = 0; number < 5; number++) {
        const result = await page(cursor);
        expect(result.items.length, number === 4 ? 25 : 50);
        seen.push(...result.items);
        cursor = result.nextCursor;
        if (number < 4) {
            assert(cursor);
            expect(cursor.id, result.items.at(-1).id);
        } else expect(cursor, null);
    }
    expect(seen.length, 225);
    expect(new Set(seen.map(item => item.id)).size, 225);
    assert(seen.every(item => item.status === 'failed' && item.sessionTitle.startsWith('Visible issues'))); checks++;
    for (let i = 1; i < seen.length; i++) {
        const previous = seen[i - 1], current = seen[i];
        assert(previous.updatedAt > current.updatedAt || (previous.updatedAt === current.updatedAt && previous.id > current.id));
    }
    checks++;

    expect((await page()).items.length, 50);
    expect((await page(null, 100)).items.length, 100);
    expect((await rpc('academy_integration_issues')).length, 100); // deployed UI retains its old response
    await expectDenied('select public.academy_integration_issues_page(null,null,101)', [], /parametry/); checks++;
    await expectDenied('select public.academy_integration_issues_page(now(),null,50)', [], /parametry/); checks++;
    await expectDenied('select public.academy_integration_issues_page(null,null,0)', [], /parametry/); checks++;

    await actor('student');
    expect((await page()).items, []);
    expect((await page()).nextCursor, null);
    await actor('student', 'anon');
    await expectDenied('select public.academy_integration_issues_page()', [], /permission denied/); checks++;
    await actor('admin');
    const adminSeen = [];
    cursor = null;
    do {
        const result = await page(cursor, 100);
        adminSeen.push(...result.items);
        cursor = result.nextCursor;
    } while (cursor);
    expect(adminSeen.length, 230);
    expect(new Set(adminSeen.map(item => item.id)).size, 230);
    assert(adminSeen.some(item => item.sessionTitle.startsWith('Foreign issues'))); checks++;
    assert(adminSeen.every(item => item.status !== 'done')); checks++;

    console.log(`PASS ${checks} Academy integration issue pagination and access assertions (${fixture.engine})`);
} finally {
    await db.close();
}
