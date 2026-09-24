// Real PostgreSQL/PGlite state transitions; no Graph request or real meeting.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ obligations: true, reviewSubmissions: true, rollout: true });
const { db, sql, actor, owner, service, rpc, ids } = fixture;
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const denied = async (...args) => { await fixture.expectDenied(...args); checks++; };
const time = minutes => new Date(Date.now() + minutes * 60000).toISOString();
const tenant = '11111111-1111-4111-8111-111111111111';
const object = '22222222-2222-4222-8222-222222222222';
const started = time(-65), ended = time(-5);
const outcome = decisions => ({ kind: 'attendance_synced', onlineMeetingId: 'online-meeting', reports: [{ id: 'report', startDateTime: started, endDateTime: ended, records: [] }], evaluation: { decisions, unmatched: [] } });
const decision = (who, status = 'needs_review', seconds = 0) => ({ profileId: ids[who], status, attendedSeconds: seconds, reportIds: ['report'] });
const meeting = { eventId: 'managed-event', organizerId: object, joinUrl: 'https://teams.microsoft.com/meet/123', transactionId: 'stable-transaction' };

try {
    await owner();
    await db.exec(fs.readFileSync(new URL('../supabase/migrations/20260922154418_academy_attendance_recovery.sql', import.meta.url), 'utf8'));
    await actor('admin'); await rpc('academy_set_rollout', ['open', []]);
    await rpc('academy_set_trainer', [ids.trainer, true]);
    const organizer = await rpc('academy_save_organizer', [{ profileId: ids.internal, tenantId: tenant, objectId: object, enabled: true }]);
    await actor('trainer');
    const { course_id: course, version_id: version } = await rpc('academy_create_course', [{ title: 'Attendance recovery', category: 'IT', delivery_mode: 'live' }]);
    await rpc('academy_update_course', [course, { completion_rules: { quiz_required: false, require_all_lessons: false, attendance_percent: 80 } }]);
    await rpc('academy_submit_for_review', [course]);
    await actor('admin');
    const submission = (await sql('select submission_id from course_versions where id=$1', [version])).rows[0].submission_id;
    await rpc('academy_review_course', [version, true, null, submission]);

    async function makeRun(title, users, mode = 'managed_teams') {
        await actor('trainer');
        const run = await rpc('academy_create_run', [{ courseId: course, versionId: version, title, capacity: 4 }]);
        const session = await rpc('academy_save_session', [{ runId: run, title, startsAt: time(1440), endsAt: time(1500), timeZone: 'Europe/Warsaw', mode, organizerId: organizer, externalJoinUrl: 'https://teams.microsoft.com/meet/123', required: true }]);
        await actor('admin'); await rpc('academy_publish_run', [run]);
        const registrations = {};
        for (const user of users) { await actor(user); registrations[user] = await rpc('academy_register_run', [run]); }
        if (mode === 'managed_teams') {
            await service(); const [job] = await rpc('academy_claim_jobs', ['meeting', 1, 180]);
            equal(job.sessionId, session);
            await rpc('academy_complete_job', [job.id, job.leaseToken, { kind: 'meeting_synced', meeting }]);
        }
        await owner(); await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1', [session, started, time(30)]);
        await actor('trainer'); await rpc('academy_confirm_session_window', [session, started, ended]);
        return { run, session, registrations };
    }
    async function ready(session) {
        await owner(); await sql("update academy_integration_jobs set available_at=now() where session_id=$1 and status in ('pending','retry')", [session]);
        await service();
    }

    const initial = await makeRun('Mapping correction', ['student', 'other', 'trainer']);
    await actor('trainer');
    await rpc('academy_record_attendance', [{ sessionId: initial.session, enrollmentId: initial.registrations.other.enrollmentId, status: 'insufficient', attendedSeconds: 60, note: 'Verified manual decision must remain unchanged' }]);
    await ready(initial.session);
    const [firstImport] = await rpc('academy_claim_jobs', ['attendance', 1, 180]);
    equal(firstImport.kind, 'sync_attendance');
    await rpc('academy_complete_job', [firstImport.id, firstImport.leaseToken, outcome([decision('student', 'present', 3600), decision('other', 'present', 3600), decision('trainer')])]);
    const snapshot = (await sql('select to_jsonb(c) snapshot from course_completions c where enrollment_id=$1', [initial.registrations.student.enrollmentId])).rows[0].snapshot;
    assert(snapshot); checks++;
    equal((await sql('select status from session_attendance where enrollment_id=$1', [initial.registrations.trainer.enrollmentId])).rows[0].status, 'needs_review');
    const window = (await sql('select to_jsonb(s) snapshot from course_sessions s where id=$1', [initial.session])).rows[0].snapshot;

    // An unresolved successful job is no longer a dead end after identity correction.
    await actor('admin');
    await rpc('academy_save_m365_identity', [{ userId: ids.trainer, tenantId: tenant, objectId: '33333333-3333-4333-8333-333333333333', verifiedEmail: 'trainer-teams@example.test' }]);
    await rpc('academy_reconcile_attendance', [initial.session]);
    await rpc('academy_reconcile_attendance', [initial.session]);
    equal((await sql("select count(*)::int n from academy_integration_jobs where session_id=$1 and kind='sync_attendance' and status='pending'", [initial.session])).rows[0].n, 1);
    await service();
    equal((await sql('select to_jsonb(s) snapshot from course_sessions s where id=$1', [initial.session])).rows[0].snapshot, window);
    equal((await sql("select count(*)::int n from academy_audit_events where action='ACADEMY_ATTENDANCE_RECONCILIATION_REQUESTED' and details->>'session_id'=$1", [initial.session])).rows[0].n, 1);
    const [recovery] = await rpc('academy_claim_jobs', ['recovery', 1, 180]);
    equal(recovery.id, firstImport.id); equal(recovery.revision, firstImport.revision); equal(recovery.attempt, 1);
    const context = await rpc('academy_job_context', [recovery.id, recovery.leaseToken]);
    assert(context.participants.find(p => p.profileId === ids.trainer).verifiedEmails.includes('trainer-teams@example.test')); checks++;
    await actor('admin'); await denied('select academy_reconcile_attendance($1)', [initial.session], /jest w trakcie/);
    await service();
    await rpc('academy_complete_job', [recovery.id, recovery.leaseToken, outcome([decision('student', 'insufficient', 1), decision('other', 'present', 3600), decision('trainer', 'present', 3600)])]);
    equal((await sql('select to_jsonb(c) snapshot from course_completions c where enrollment_id=$1', [initial.registrations.student.enrollmentId])).rows[0].snapshot, snapshot);
    equal((await sql('select source,status,attended_seconds from session_attendance where enrollment_id=$1', [initial.registrations.other.enrollmentId])).rows[0], { source: 'manual', status: 'insufficient', attended_seconds: 60 });
    equal((await sql('select status from session_attendance where enrollment_id=$1', [initial.registrations.trainer.enrollmentId])).rows[0].status, 'present');

    // Neither a trainer nor a learner can request recovery through the RPC.
    for (const user of ['trainer', 'student']) {
        await actor(user); await denied('select academy_reconcile_attendance($1)', [initial.session], /administratora/);
    }
    await actor('', 'anon'); await denied('select academy_reconcile_attendance($1)', [initial.session], /permission denied/);
    await service(); await denied('select academy_reconcile_attendance($1)', [initial.session], /permission denied/);
    await actor('admin'); await denied('select academy_reconcile_attendance($1)', ['00000000-0000-4000-8000-000000000099'], /uprawnień/);

    // A dead worker cannot ACK evidence after recovery clears its expired lease.
    await rpc('academy_reconcile_attendance', [initial.session]);
    await service(); const [expired] = await rpc('academy_claim_jobs', ['expired', 1, 60]);
    await owner(); await sql("update academy_integration_jobs set lease_expires_at=now()-interval '1 second' where id=$1", [expired.id]);
    await actor('admin'); await rpc('academy_reconcile_attendance', [initial.session]);
    await service(); await denied('select academy_complete_job($1,$2,$3)', [expired.id, expired.leaseToken, outcome([])], /lease_lost/);
    const [replacement] = await rpc('academy_claim_jobs', ['replacement', 1, 180]);
    assert.notEqual(replacement.leaseToken, expired.leaseToken); checks++;
    await rpc('academy_complete_job', [replacement.id, replacement.leaseToken, outcome([])]);

    // 14:30 actual end / 15:00 planned end: a 14:36 cancellation must preserve
    // attendance under the newest roster revision, whether the old job is queued
    // or already downloading a report. A stale result never writes attendance.
    for (const state of ['pending', 'processing']) {
        const early = await makeRun(`Early end ${state}`, ['student', 'other']);
        await ready(early.session);
        const old = state === 'processing' ? (await rpc('academy_claim_jobs', ['old-attendance', 1, 180]))[0]
            : (await sql("select id,revision from academy_integration_jobs where session_id=$1 and kind='sync_attendance' and status='pending'", [early.session])).rows[0];
        await actor('student'); await rpc('academy_cancel_registration', [early.run]);
        await service();
        const revision = (await sql('select revision from course_sessions where id=$1', [early.session])).rows[0].revision;
        assert(revision > old.revision); checks++;
        equal((await sql("select kind from academy_integration_jobs where session_id=$1 and revision=$2 and status='pending' order by kind", [early.session, revision])).rows.map(r => r.kind), ['sync_attendance', 'sync_meeting']);
        if (state === 'processing') await rpc('academy_complete_job', [old.id, old.leaseToken, outcome([decision('other', 'present', 3600)])]);
        else equal((await sql('select status from academy_integration_jobs where id=$1', [old.id])).rows[0].status, 'skipped');
        equal((await sql('select count(*)::int n from session_attendance where session_id=$1', [early.session])).rows[0].n, 0);
        // The fresh meeting update is serialized before its attendance successor.
        const [sync] = await rpc('academy_claim_jobs', ['new-roster', 1, 180]);
        equal(sync.kind, 'sync_meeting'); equal(sync.revision, revision);
        await rpc('academy_complete_job', [sync.id, sync.leaseToken, { kind: 'meeting_synced', meeting }]);
        await ready(early.session); const [fresh] = await rpc('academy_claim_jobs', ['fresh-attendance', 1, 180]);
        equal(fresh.kind, 'sync_attendance'); equal(fresh.revision, revision);
        await rpc('academy_complete_job', [fresh.id, fresh.leaseToken, outcome([decision('other', 'present', 3600)])]);
        equal((await sql('select status from session_attendance where enrollment_id=$1', [early.registrations.other.enrollmentId])).rows[0].status, 'present');
    }
    const external = await makeRun('External attendance is manual', [], 'external_link');
    await actor('admin'); await denied('select academy_reconcile_attendance($1)', [external.session], /spotkania firmowego/);
    const cancelled = await makeRun('Cancelled session', []);
    await actor('admin'); await rpc('academy_cancel_session', [cancelled.session, 'The host cancelled this session']);
    await denied('select academy_reconcile_attendance($1)', [cancelled.session], /spotkania firmowego/);
    console.log(`Academy attendance recovery: ${checks} assertions PASS (${fixture.engine})`);
} finally { await db.close(); }
