import assert from 'node:assert/strict';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ m365IdentitiesPagination: true });
const { db, ids, sql, actor, owner, rpc, expectDenied } = fixture;
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const page = (search = '', number = 1, limit = 25) => rpc('academy_list_m365_identities_page', [search, number, limit]);

try {
    await owner();
    await sql(`INSERT INTO public.academy_m365_identities
        (user_id,tenant_id,object_id,verified_email,verified_by,verified_at,invitation_target)
        SELECT $1,'10000000-0000-0000-0000-000000000000'::uuid,
            ('20000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
            'person'||lpad(n::text,3,'0')||'@teams.example.test',$2,
            '2030-01-01T00:00:00Z'::timestamptz,n=101
        FROM generate_series(1,101) n`, [ids.student, ids.admin]);

    await actor('admin');
    equal((await rpc('academy_list_m365_identities')).length, 100);
    const results = [];
    for (let number = 1; number <= 5; number++) {
        const result = await page('', number);
        equal(result.total, 101);
        equal(result.page, number);
        equal(result.pageSize, 25);
        equal(result.items.length, number === 5 ? 1 : 25);
        results.push(...result.items);
    }
    equal(results.length, 101);
    equal(new Set(results.map(item => item.id)).size, 101);
    equal(results.filter(item => item.invitationTarget).map(item => item.verifiedEmail), ['person101@teams.example.test']);
    for (let index = 1; index < results.length; index++) {
        assert(results[index - 1].id > results[index].id, 'equal timestamps use stable UUID ordering');
    }
    checks++;
    const found = await page('PERSON101@TEAMS.EXAMPLE.TEST');
    equal(found.total, 1);
    equal(found.items[0].verifiedEmail, 'person101@teams.example.test');
    equal((await page('', 6)).items, []);
    equal((await page('no-match')).total, 0);
    await expectDenied('select public.academy_list_m365_identities_page($1,$2,$3)', ['', 0, 25], /parametry/); checks++;
    await expectDenied('select public.academy_list_m365_identities_page($1,$2,$3)', ['', 1, 101], /parametry/); checks++;
    await expectDenied('select public.academy_list_m365_identities_page($1,$2,$3)', ['x'.repeat(101), 1, 25], /parametry/); checks++;

    await actor('student');
    await expectDenied('select public.academy_list_m365_identities_page()', [], /administrator/); checks++;
    await actor('student', 'anon');
    await expectDenied('select public.academy_list_m365_identities_page()', [], /permission denied/); checks++;
    await actor('', 'authenticated');
    await expectDenied('select public.academy_list_m365_identities_page()', [], /administrator/); checks++;
    console.log(`PASS ${checks} M365 identity pagination and authorization assertions (${fixture.engine})`);
} finally {
    await db.close();
}
