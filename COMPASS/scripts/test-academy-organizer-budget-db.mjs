import assert from 'node:assert/strict';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ activationBudget: true });
const { db, ids, sql, actor, owner, rpc } = fixture;
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
    await owner();
    await denied("update course_sessions set status='scheduled' where id=$1", [cancelledSession], /nie można przywrócić/);
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

    // A profile or rollout change can make an instructor eligible again.
    // Neither path may add a 501st person to a published managed meeting.
    const activationRun = await rpc('academy_create_run', [{ courseId: course.course_id, versionId: course.version_id, title: 'Activation budget', capacity: 498 }]);
    const activationSession = await rpc('academy_save_session', [{ ...baseSession, runId: activationRun, organizerId: host }]);
    await actor('admin');
    await rpc('academy_publish_run', [activationRun]);
    await owner();
    await sql("update profiles set employment_status='exited' where id=$1", [ids.trainer]);
    await actor('admin');
    await rpc('academy_update_run', [activationRun, 'Trainer exited', 499]);
    await owner();
    await denied("update profiles set employment_status='active' where id=$1", [ids.trainer], /limit 500/);
    assert.equal((await sql('select employment_status from profiles where id=$1', [ids.trainer])).rows[0].employment_status, 'exited'); checks++;
    await actor('admin');
    await rpc('academy_update_run', [activationRun, 'Trainer restored', 498]);
    await owner();
    await sql("update profiles set employment_status='active' where id=$1", [ids.trainer]);

    await actor('admin');
    await rpc('academy_set_rollout', ['pilot', [ids.other]]);
    await rpc('academy_update_run', [activationRun, 'Trainer outside pilot', 499]);
    await denied('select academy_set_rollout($1,$2)', ['pilot', [ids.other, ids.trainer]], /limit 500/);
    await denied('select academy_set_rollout($1,$2)', ['open', []], /limit 500/);
    await owner();
    const rollout = (await sql('select mode,pilot_user_ids from academy_rollout_settings')).rows[0];
    assert.equal(rollout.mode, 'pilot'); checks++;
    assert.deepEqual(rollout.pilot_user_ids, [ids.other]); checks++;
    await actor('admin');
    await rpc('academy_update_run', [activationRun, 'Rollout restored', 498]);
    await rpc('academy_set_rollout', ['open', []]);

    // Drafts must reserve the same Teams budget before publication.
    await actor('trainer');
    const draftRun = await rpc('academy_create_run', [{ courseId: course.course_id, versionId: course.version_id, title: 'Draft activation budget', capacity: 498 }]);
    await rpc('academy_save_session', [{ ...baseSession, runId: draftRun, organizerId: host }]);
    await owner();
    await sql("update profiles set employment_status='exited' where id=$1", [ids.trainer]);
    await actor('admin');
    await rpc('academy_update_run', [draftRun, 'Draft author exited', 499]);
    await owner();
    await denied("update profiles set employment_status='active' where id=$1", [ids.trainer], /limit 500/);
    await actor('admin');
    await rpc('academy_update_run', [draftRun, 'Draft author restored', 498]);
    await owner();
    await sql("update profiles set employment_status='active' where id=$1", [ids.trainer]);
    await actor('admin');
    await rpc('academy_set_rollout', ['pilot', [ids.other]]);
    await rpc('academy_update_run', [draftRun, 'Draft author outside pilot', 499]);
    await denied('select academy_set_rollout($1,$2)', ['open', []], /limit 500/);
    await rpc('academy_update_run', [draftRun, 'Draft rollout restored', 498]);
    await rpc('academy_set_rollout', ['open', []]);

    if (fixture.engine === 'postgres') {
        // The profile writer and capacity writer each fit alone. Locking the
        // run during activation allows only one of them to commit.
        await owner();
        await sql("update profiles set employment_status='exited' where id=$1", [ids.trainer]);
        const profileWriter = await fixture.connectSession('admin');
        const capacityWriter = await fixture.connectSession('admin');
        await profileWriter.owner();
        const activationRace = await Promise.allSettled([
            profileWriter.sql("update profiles set employment_status='active' where id=$1", [ids.trainer]),
            capacityWriter.rpc('academy_update_run', [activationRun, 'Concurrent activation', 499]),
        ]);
        assert.equal(activationRace.filter(result => result.status === 'fulfilled').length, 1); checks++;
        await owner();
        const finalBudget = (await sql(`select academy_private.managed_invitation_budget(
            r.id,r.course_id,r.capacity,s.organizer_id) as people
            from course_runs r join course_sessions s on s.run_id=r.id where r.id=$1`, [activationRun])).rows[0].people;
        assert.equal(finalBudget, 500); checks++;

        // The first managed session and trainer reactivation race on a draft.
        // Either may commit, but their combined 501-person state must not.
        await actor('admin');
        await rpc('academy_update_run', [activationRun, 'Activation race settled', 498]);
        await owner();
        await sql("update profiles set employment_status='active' where id=$1", [ids.trainer]);
        await actor('admin');
        const firstSessionRun = await rpc('academy_create_run', [{ courseId: course.course_id, versionId: course.version_id, title: 'First session race', capacity: 498 }]);
        await rpc('academy_set_run_staff', [firstSessionRun, ids.other, true]);
        await owner();
        await sql("update profiles set employment_status='exited' where id=$1", [ids.trainer]);
        const firstSessionWriter = await fixture.connectSession('other');
        const firstActivationWriter = await fixture.connectSession('admin');
        await firstActivationWriter.owner();
        const firstSessionRace = await Promise.allSettled([
            firstSessionWriter.rpc('academy_save_session', [{ ...baseSession, runId: firstSessionRun, organizerId: host }]),
            firstActivationWriter.sql("update profiles set employment_status='active' where id=$1", [ids.trainer]),
        ]);
        assert.equal(firstSessionRace.filter(result => result.status === 'fulfilled').length, 1); checks++;
        const firstSessionBudget = (await sql(`select academy_private.managed_invitation_budget(
            r.id,r.course_id,r.capacity,s.organizer_id) as people
            from course_runs r join course_sessions s on s.run_id=r.id where r.id=$1`, [firstSessionRun])).rows[0]?.people;
        assert.ok(firstSessionBudget === undefined || firstSessionBudget <= 500); checks++;
        // Later cases use the trainer as an active author without a second facilitator.
        await actor('admin');
        await rpc('academy_set_run_staff', [firstSessionRun, ids.other, false]);
        await owner();
        await sql("update profiles set employment_status='active' where id=$1", [ids.trainer]);

        // External-link saves also take the mutex before their run lock;
        // otherwise they can deadlock with a concurrent profile activation.
        await actor('admin');
        const externalRaceRun = await rpc('academy_create_run', [{ courseId: course.course_id, versionId: course.version_id, title: 'External link race', capacity: 500 }]);
        await rpc('academy_set_run_staff', [externalRaceRun, ids.other, true]);
        await owner();
        await sql("update profiles set employment_status='exited' where id=$1", [ids.trainer]);
        const externalWriter = await fixture.connectSession('other');
        const externalActivationWriter = await fixture.connectSession('admin');
        await externalActivationWriter.owner();
        const externalRace = await Promise.allSettled([
            externalWriter.rpc('academy_save_session', [{ ...baseSession, runId: externalRaceRun, mode: 'external_link', organizerId: null, externalJoinUrl: link }]),
            externalActivationWriter.sql("update profiles set employment_status='active' where id=$1", [ids.trainer]),
        ]);
        assert.equal(externalRace.filter(result => result.status === 'fulfilled').length, 2); checks++;

        // A status-only no-op has no reason to wait for the budget mutex.
        await owner();
        await sql("update profiles set employment_status='exited' where id=$1", [ids.trainer]);
        const statusWriter = await fixture.connectSession('admin');
        const statusActivationWriter = await fixture.connectSession('admin');
        await statusWriter.owner();
        await statusActivationWriter.owner();
        const statusRace = await Promise.allSettled([
            statusWriter.sql("update course_sessions set status='scheduled' where id=$1", [activationSession]),
            statusActivationWriter.sql("update profiles set employment_status='active' where id=$1", [ids.trainer]),
        ]);
        assert.equal(statusRace.filter(result => result.status === 'fulfilled').length, 2); checks++;

        // Publishing a draft cannot make a simultaneous pilot expansion skip
        // the capacity check. The expansion fails even when publication races.
        await actor('admin');
        await rpc('academy_set_rollout', ['pilot', [ids.other]]);
        await rpc('academy_update_run', [draftRun, 'Pilot publication race', 499]);
        await owner();
        await sql("update profiles set role='admin' where id=$1", [ids.internal]);
        const rolloutWriter = await fixture.connectSession('admin');
        const publishWriter = await fixture.connectSession('internal');
        const publishRace = await Promise.allSettled([
            rolloutWriter.rpc('academy_set_rollout', ['open', []]),
            publishWriter.rpc('academy_publish_run', [draftRun]),
        ]);
        assert.equal(publishRace[0].status, 'rejected'); checks++;
        assert.equal(publishRace[1].status, 'fulfilled'); checks++;
        assert.equal((await sql('select status from course_runs where id=$1', [draftRun])).rows[0].status, 'published'); checks++;
        await actor('admin');
        await rpc('academy_update_run', [draftRun, 'Publication race reset', 498]);
        await rpc('academy_set_rollout', ['open', []]);

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
