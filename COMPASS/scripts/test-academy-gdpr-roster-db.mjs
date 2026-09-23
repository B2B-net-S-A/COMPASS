// Dedicated SQL gate for the private roster used by GDPR Teams evidence export.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ live: true });
const { db, sql, actor, owner, service, rpc, ids } = fixture;
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const denied = async (...args) => { await fixture.expectDenied(...args); checks++; };
const tenant = '11111111-1111-4111-8111-111111111111';
const studentObject = '22222222-2222-4222-8222-222222222222';
const otherObject = '33333333-3333-4333-8333-333333333333';
const startsAt = new Date(Date.now() + 86400000).toISOString();
const endsAt = new Date(Date.now() + 90000000).toISOString();

try {
    await owner();
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260923135155_academy_gdpr_attendance_roster.sql', import.meta.url), 'utf8'));
    equal((await sql("select has_function_privilege('anon','public.academy_gdpr_attendance_roster(uuid[])','execute') anon,has_function_privilege('authenticated','public.academy_gdpr_attendance_roster(uuid[])','execute') auth,has_function_privilege('service_role','public.academy_gdpr_attendance_roster(uuid[])','execute') service")).rows[0],
        { anon: false, auth: false, service: true });

    await actor('admin'); await rpc('academy_set_trainer', [ids.trainer, true]);
    await actor('trainer');
    const { course_id: course, version_id: version } = await rpc('academy_create_course', [{ title: 'GDPR roster proof', category: 'IT', delivery_mode: 'live' }]);
    await rpc('academy_update_course', [course, { completion_rules: { quiz_required: false, require_all_lessons: false, attendance_percent: 80 } }]);
    await rpc('academy_submit_for_review', [course]);
    await actor('admin'); await rpc('academy_review_course', [version, true, null]);
    await actor('trainer');
    const run = await rpc('academy_create_run', [{ courseId: course, versionId: version, title: 'GDPR edition', capacity: 2 }]);
    const session = await rpc('academy_save_session', [{ runId: run, title: 'GDPR session', startsAt, endsAt, timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: 'https://teams.microsoft.com/meet/123', required: true }]);
    await actor('admin'); await rpc('academy_publish_run', [run]);
    await actor('student'); equal((await rpc('academy_register_run', [run])).status, 'confirmed');
    await actor('other'); equal((await rpc('academy_register_run', [run])).status, 'confirmed');
    await actor('trainer'); equal((await rpc('academy_register_run', [run])).status, 'waitlisted');
    await actor('admin');
    await rpc('academy_save_m365_identity', [{ userId: ids.student, tenantId: tenant, objectId: studentObject, verifiedEmail: 'student-alias@example.test' }]);
    await rpc('academy_save_m365_identity', [{ userId: ids.other, tenantId: tenant, objectId: otherObject, verifiedEmail: 'other-alias@example.test' }]);
    await owner(); await sql('update auth.users set email_confirmed_at=null where id=$1', [ids.other]);

    await actor('', 'anon'); await denied('select * from public.academy_gdpr_attendance_roster($1::uuid[])', [[session]], /permission denied/);
    await actor('student'); await denied('select * from public.academy_gdpr_attendance_roster($1::uuid[])', [[session]], /permission denied/);
    await actor('admin'); await denied('select * from public.academy_gdpr_attendance_roster($1::uuid[])', [[session]], /permission denied/);
    await service();
    const roster = (await sql('select session_id,participants from public.academy_gdpr_attendance_roster($1::uuid[])', [[session]])).rows;
    equal(roster.length, 1); equal(roster[0].session_id, session);
    const participants = roster[0].participants;
    equal(participants.map(p => p.profileId).sort(), [ids.student, ids.other].sort());
    equal(participants.find(p => p.profileId === ids.student).identities, [{ tenantId: tenant, objectId: studentObject }]);
    equal(participants.find(p => p.profileId === ids.other).identities, [{ tenantId: tenant, objectId: otherObject }]);
    equal(participants.find(p => p.profileId === ids.student).verifiedEmails.sort(), ['student@example.test', 'student-alias@example.test'].sort());
    equal(participants.find(p => p.profileId === ids.other).verifiedEmails, ['other-alias@example.test']);
    await denied('select * from public.academy_gdpr_attendance_roster($1::uuid[])', [Array(51).fill(session)], /invalid_academy_gdpr_session_ids/);
    await denied('select * from public.academy_gdpr_attendance_roster($1::uuid[])', [[]], /invalid_academy_gdpr_session_ids/);
    console.log(`Academy GDPR roster: ${checks} assertions passed (${fixture.engine}; private ACL, verified identities/emails, bounds).`);
} finally { await db.close(); }
