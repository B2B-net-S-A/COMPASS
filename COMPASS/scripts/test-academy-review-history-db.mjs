import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const f = await createAcademyDatabase({ reviewSubmissions: true, rollout: true });
const { db, sql, actor, owner, service, rpc, ids } = f;
let checks = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
const denied = async (...args) => { await f.expectDenied(...args); checks++; };
const token = async version => (await sql('select submission_id from course_versions where id=$1', [version])).rows[0].submission_id;
try {
    await actor('admin'); await rpc('academy_set_rollout', ['open', []]);
    await rpc('academy_set_trainer', [ids.trainer, true]); await rpc('academy_set_trainer', [ids.other, true]);
    await actor('trainer');
    const { course_id: course, version_id: version } = await rpc('academy_create_course', [{ title: 'Review history', category: 'IT', delivery_mode: 'live' }]);
    await rpc('academy_submit_for_review', [course]); const first = await token(version);
    await actor('admin'); await rpc('academy_review_course', [version, false, 'Pierwszy historyczny powód', first]);

    // An existing rejection predates this migration: no token is inferred from
    // a later submission or from its adjacent COURSE_REVIEW_DECIDED record.
    await owner(); await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260923093432_academy_review_history.sql', import.meta.url), 'utf8'));
    await actor('trainer'); await rpc('academy_update_course', [course, { description: 'Poprawiony program' }]);
    await rpc('academy_submit_for_review', [course]); const second = await token(version);
    await actor('admin'); await rpc('academy_review_course', [version, false, 'Drugi powód po poprawkach', second]);
    await actor('trainer'); await rpc('academy_submit_for_review', [course]); const third = await token(version);
    await actor('admin'); await rpc('academy_review_course', [version, true, null, third]);
    await rpc('academy_review_course', [version, true, null, third]);
    await rpc('academy_archive_course', [course]);
    const initial = await rpc('academy_course_review_history', [course]);
    equal(initial.items.length, 7); equal(initial.nextCursor, null);
    equal(initial.items.filter(i => i.action === 'COURSE_REVIEW_SUBMITTED').length, 3);
    equal(initial.items.filter(i => i.action === 'COURSE_SUBMITTED').length, 0);
    equal(initial.items.filter(i => i.action === 'COURSE_REVIEW_DECIDED').length, 0);
    equal(initial.items.filter(i => i.action === 'COURSE_PUBLISHED').length, 1);
    equal(initial.items.find(i => i.reason === 'Pierwszy historyczny powód').submissionId, null);
    equal(initial.items.find(i => i.reason === 'Drugi powód po poprawkach').submissionId, second);
    equal(initial.items.find(i => i.action === 'COURSE_PUBLISHED').submissionId, third);
    equal(initial.items.find(i => i.action === 'COURSE_REVIEW_SUBMITTED' && i.submissionId === first).versionNumber, 1);
    equal((await sql('select rejection_reason from course_versions where id=$1', [version])).rows[0].rejection_reason, null);
    equal(initial.items.filter(i => i.action === 'COURSE_REJECTED').map(i => i.reason).sort(), ['Drugi powód po poprawkach', 'Pierwszy historyczny powód']);

    // Literal older audit evidence and equal timestamps exercise compatibility
    // and keyset order without exposing arbitrary audit details or profile email.
    await owner();
    for (const [index, action, details] of [
        [1, 'COURSE_SUBMITTED', { version_id: version }],
        [2, 'LEGACY_COURSE_REVIEWED', { version_id: version, approved: false, reason: 'Stara publikacja wymaga poprawy', secret: 'private-audit-payload' }],
        [3, 'LEGACY_COURSE_REVIEWED', { version_id: version, approved: true, reason: 'Historyczny program sprawdzony' }],
        [4, 'COURSE_REJECTED', { version_id: version, reason: 'Imported older decision' }],
        [5, 'COURSE_ARCHIVED', { version_id: 'malformed-version', submission_id: 'malformed-submission' }],
    ]) await sql('insert into academy_audit_events(id,actor_id,course_id,action,details,created_at) values($1,$2,$3,$4,$5,$6)', [`99999999-9999-4999-8999-${String(index).padStart(12, '0')}`, ids.admin, course, action, details, '2020-01-01T00:00:00.123456Z']);
    const countBefore = (await sql('select count(*)::int n from academy_audit_events')).rows[0].n;
    await actor('trainer');
    equal((await sql('select * from academy_audit_events')).rows, []); // Raw table remains admin-only.
    const all = await rpc('academy_course_review_history', [course]);
    equal(all.items.length, 12);
    equal(all.items.filter(i => i.action === 'COURSE_SUBMITTED').length, 1);
    equal(all.items.find(i => i.reason === 'Imported older decision').submissionId, null);
    equal(all.items.find(i => i.reason === 'Stara publikacja wymaga poprawy').approved, false);
    equal(all.items.find(i => i.id.endsWith('000000000005')).versionNumber, null);
    equal(all.items.find(i => i.id.endsWith('000000000005')).submissionId, null);
    assert(!JSON.stringify(all).includes('private-audit-payload')); checks++;
    assert(!JSON.stringify(all).includes('@')); checks++;
    equal(Object.keys(all.items[0]).sort(), ['action', 'actorName', 'approved', 'createdAt', 'id', 'reason', 'submissionId', 'versionNumber'].sort());
    const seen = [];
    let cursor = null;
    do {
        const page = await rpc('academy_course_review_history', [course, cursor?.createdAt ?? null, cursor?.id ?? null, 2]);
        seen.push(...page.items.map(item => item.id)); cursor = page.nextCursor;
    } while (cursor);
    equal(seen, all.items.map(item => item.id)); equal(new Set(seen).size, seen.length);
    equal(seen.slice(-5), [5, 4, 3, 2, 1].map(i => `99999999-9999-4999-8999-${String(i).padStart(12, '0')}`));
    await denied('select academy_course_review_history($1,null,null,0)', [course], /parametry/);
    await denied('select academy_course_review_history($1,null,null,51)', [course], /parametry/);
    await denied('select academy_course_review_history($1,now(),null,20)', [course], /parametry/);
    await denied("select academy_course_review_history($1,'infinity',$2,20)", [course, version], /parametry/);

    // Course-bound authorization: another trainer, an attendee and a facilitator
    // cannot read history; an explicitly assigned editor can, until revoked.
    await actor('other'); await denied('select academy_course_review_history($1)', [course], /uprawnień/);
    const otherCourse = await rpc('academy_create_course', [{ title: 'Other author', category: 'IT', delivery_mode: 'live' }]);
    await actor('trainer'); await denied('select academy_course_review_history($1)', [otherCourse.course_id], /uprawnień/);
    await actor('student'); await denied('select academy_course_review_history($1)', [course], /uprawnień/);
    await actor('admin'); await rpc('academy_set_course_staff', [course, ids.other, 'editor', true]);
    await actor('other'); equal((await rpc('academy_course_review_history', [course])).items.length, 12);
    equal((await sql('select * from academy_audit_events')).rows, []);
    await actor('admin'); await rpc('academy_set_course_staff', [course, ids.other, 'editor', false]);
    await rpc('academy_set_course_staff', [course, ids.other, 'facilitator', true]);
    await actor('other'); await denied('select academy_course_review_history($1)', [course], /uprawnień/);
    await actor('admin'); await rpc('academy_set_trainer', [ids.trainer, false]);
    await actor('trainer'); await denied('select academy_course_review_history($1)', [course], /uprawnień/);
    await actor('', 'anon'); await denied('select academy_course_review_history($1)', [course], /permission denied/);
    await service(); await denied('select academy_course_review_history($1)', [course], /permission denied/);
    await actor('admin'); await rpc('academy_set_rollout', ['closed', []]);
    equal((await rpc('academy_course_review_history', [course])).items.length, 12);
    equal((await rpc('academy_course_review_history', [otherCourse.course_id])).items.length, 0);
    await denied('select academy_course_review_history($1)', ['00000000-0000-4000-8000-000000000099'], /uprawnień/);
    // Only our explicitly invoked state changes, never a history read, add audit.
    await owner(); const beforeRead = (await sql('select count(*)::int n from academy_audit_events')).rows[0].n;
    assert(beforeRead >= countBefore); checks++;
    await actor('admin'); await rpc('academy_course_review_history', [course]);
    await owner(); equal((await sql('select count(*)::int n from academy_audit_events')).rows[0].n, beforeRead);
    console.log(`Academy review history: ${checks} assertions PASS (${f.engine})`);
} finally { await db.close(); }
