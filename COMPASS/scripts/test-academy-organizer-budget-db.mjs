import assert from 'node:assert/strict';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ organizerBudget: true });
const { db, ids, sql, actor, rpc } = fixture;
let checks = 0;
const denied = async (...args) => { await fixture.expectDenied(...args); checks++; };
const startsAt = new Date(Date.now() + 86_400_000).toISOString();
const endsAt = new Date(Date.now() + 90_000_000).toISOString();
const link = 'https://teams.microsoft.com/meet/123456789?p=training';
const baseSession = { title: 'Managed workshop', startsAt, endsAt, timeZone: 'Europe/Warsaw', mode: 'managed_teams', required: true };

try {
    await actor('admin');
    await rpc('academy_set_trainer', [ids.trainer, true]);
    await rpc('academy_set_trainer', [ids.other, true]);
    const host = await rpc('academy_save_organizer', [{
        profileId: ids.internal, tenantId: '11111111-1111-4111-8111-111111111111',
        objectId: '22222222-2222-4222-8222-222222222222', enabled: true,
    }]);
    const trainerHost = await rpc('academy_save_organizer', [{
        profileId: ids.trainer, tenantId: '11111111-1111-4111-8111-111111111111',
        objectId: '33333333-3333-4333-8333-333333333333', enabled: true,
    }]);

    await actor('trainer');
    const course = await rpc('academy_create_course', [{ title: 'Organizer capacity', category: 'IT', delivery_mode: 'live' }]);
    await rpc('academy_submit_for_review', [course.course_id]);
    const submission = (await sql('select submission_id from course_versions where id=$1', [course.version_id])).rows[0].submission_id;
    await actor('admin');
    await rpc('academy_review_course', [course.version_id, true, null, submission]);

    // 498 learner places + one trainer + a separate host exactly fills 500.
    // A second trainer must be rejected; 497 places leaves that person room.
    await actor('trainer');
    const run = await rpc('academy_create_run', [{ courseId: course.course_id, versionId: course.version_id, title: 'Separate host', capacity: 498 }]);
    await rpc('academy_save_session', [{ ...baseSession, runId: run, organizerId: host }]);
    await denied('select academy_set_run_staff($1,$2,true)', [run, ids.other], /limit 500/);
    await rpc('academy_update_run', [run, 'Separate host', 497]);
    await rpc('academy_set_run_staff', [run, ids.other, true]);
    await denied('select academy_update_run($1,$2,498)', [run, 'Too many invitees'], /limit 500/);
    assert.equal((await sql('select capacity from course_runs where id=$1', [run])).rows[0].capacity, 497); checks++;

    // When the host is already a trainer, count that person once.
    const samePerson = await rpc('academy_create_run', [{ courseId: course.course_id, versionId: course.version_id, title: 'Trainer hosts', capacity: 498 }]);
    await rpc('academy_set_run_staff', [samePerson, ids.other, true]);
    const session = await rpc('academy_save_session', [{ ...baseSession, runId: samePerson, organizerId: trainerHost }]);
    assert.ok(session); checks++;
    await denied('select academy_save_session($1)', [{ ...baseSession, id: session, runId: samePerson, organizerId: host }], /limit 500/);
    await rpc('academy_update_run', [samePerson, 'Trainer hosts', 497]);
    await rpc('academy_save_session', [{ ...baseSession, id: session, runId: samePerson, organizerId: host }]);

    // Repointing an organizer record would also send future cancellation jobs
    // to a different mailbox; create a new organizer instead.
    await actor('admin');
    await denied('select academy_save_organizer($1)', [{
        id: host, profileId: ids.other, tenantId: '11111111-1111-4111-8111-111111111111',
        objectId: '22222222-2222-4222-8222-222222222222', enabled: true,
    }], /powiązane spotkania Teams/);

    // A cancelled session can still have a pending remote cancellation; its
    // original mailbox must remain stable for the recovery worker.
    await actor('trainer');
    const cancelledRun = await rpc('academy_create_run', [{ courseId: course.course_id, versionId: course.version_id, title: 'Cancelled host', capacity: 499 }]);
    const cancelledSession = await rpc('academy_save_session', [{ ...baseSession, runId: cancelledRun, organizerId: trainerHost }]);
    await rpc('academy_cancel_session', [cancelledSession, 'Cancelled before publication']);
    await actor('admin');
    await denied('select academy_save_organizer($1)', [{
        id: trainerHost, profileId: ids.other, tenantId: '11111111-1111-4111-8111-111111111111',
        objectId: '33333333-3333-4333-8333-333333333333', enabled: true,
    }], /powiązane spotkania Teams/);

    // External links do not have a Compass-managed host or Graph invitations.
    await actor('trainer');
    const external = await rpc('academy_create_run', [{ courseId: course.course_id, versionId: course.version_id, title: 'External Teams', capacity: 500 }]);
    await rpc('academy_set_run_staff', [external, ids.other, true]);
    assert.ok(await rpc('academy_save_session', [{ ...baseSession, runId: external, mode: 'external_link', organizerId: null, externalJoinUrl: link }])); checks++;

    if (fixture.engine === 'postgres') {
        // Both changes fit separately, but cannot both commit for one run.
        const raceRun = await rpc('academy_create_run', [{ courseId: course.course_id, versionId: course.version_id, title: 'Concurrent budget', capacity: 497 }]);
        await rpc('academy_save_session', [{ ...baseSession, runId: raceRun, organizerId: host }]);
        const staff = await fixture.connectSession('trainer');
        const capacity = await fixture.connectSession('trainer');
        const results = await Promise.allSettled([
            staff.rpc('academy_set_run_staff', [raceRun, ids.other, true]),
            capacity.rpc('academy_update_run', [raceRun, 'Concurrent budget', 498]),
        ]);
        assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); checks++;
        const state = (await sql(`select r.capacity,
            (select count(*)::int from course_run_staff s where s.run_id=r.id and s.revoked_at is null) staff
            from course_runs r where r.id=$1`, [raceRun])).rows[0];
        assert.equal(state.capacity + state.staff + 2, 500); checks++;

        // A host reassignment and a new managed session must serialize too.
        await actor('admin');
        const movableHost = await rpc('academy_save_organizer', [{
            profileId: ids.trainer, tenantId: '11111111-1111-4111-8111-111111111111',
            objectId: '44444444-4444-4444-8444-444444444444', enabled: true,
        }]);
        await actor('trainer');
        const hostRaceRun = await rpc('academy_create_run', [{ courseId: course.course_id, versionId: course.version_id, title: 'Host reassignment race', capacity: 498 }]);
        await rpc('academy_set_run_staff', [hostRaceRun, ids.other, true]);
        const sessionWriter = await fixture.connectSession('trainer');
        const hostWriter = await fixture.connectSession('admin');
        const hostRace = await Promise.allSettled([
            sessionWriter.rpc('academy_save_session', [{ ...baseSession, runId: hostRaceRun, organizerId: movableHost }]),
            hostWriter.rpc('academy_save_organizer', [{
                id: movableHost, profileId: ids.internal, tenantId: '11111111-1111-4111-8111-111111111111',
                objectId: '44444444-4444-4444-8444-444444444444', enabled: true,
            }]),
        ]);
        assert.equal(hostRace.filter(result => result.status === 'fulfilled').length, 1); checks++;
        const hostState = (await sql(`select o.profile_id,
            (select count(*)::int from course_sessions s where s.organizer_id=o.id and s.run_id=$2) sessions
            from academy_organizers o where o.id=$1`, [movableHost, hostRaceRun])).rows[0];
        assert.equal(hostState.profile_id === ids.internal && hostState.sessions > 0, false); checks++;
    }

    // eslint-disable-next-line no-console
    console.log(`PASS ${checks} managed organizer capacity and external-link assertions`);
} finally {
    await db.close();
}
