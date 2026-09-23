// Archive admission regression. The PostgreSQL branch uses independent sessions
// and observed lock waits; PGlite proves state transitions, not concurrency.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ rollout: true, obligations: true, reviewSubmissions: true, completionGaps: true });
const { db, sql, actor, owner, service, rpc, ids } = fixture;
let checks = 0, races = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const denied = async (...args) => { await fixture.expectDenied(...args); checks++; };
const time = hours => new Date(Date.now() + hours * 3600000).toISOString();
const meeting = { title: 'Archive boundary workshop', startsAt: time(24), endsAt: time(25), timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: 'https://teams.microsoft.com/meet/123', required: true };
async function approve(version) {
    await actor('admin');
    const token = (await sql('select submission_id from course_versions where id=$1', [version])).rows[0].submission_id;
    await rpc('academy_review_course', [version, true, null, token]);
}
async function makeCourse(title, mode = 'live') {
    await actor('trainer');
    const { course_id: course, version_id: version } = await rpc('academy_create_course', [{ title, category: 'IT', delivery_mode: mode }]);
    let lesson = null;
    if (mode !== 'live') {
        lesson = (await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md)values($1,$2,'Preserved lesson',0,'Published content remains available')returning id", [course, version])).rows[0].id;
        const questions = Array.from({ length: 4 }, (_, i) => ({ question_text: `Question ${i + 1}`, options: Array.from({ length: 4 }, (_, j) => ({ option_text: `Answer ${j + 1}`, is_correct: j === 0 })) }));
        await rpc('academy_replace_quiz', [course, questions]);
    }
    await rpc('academy_submit_for_review', [course]); await approve(version);
    return { course, version, lesson };
}
async function makeRun(c, title, { capacity = 1, publish = true, users = [] } = {}) {
    await actor('trainer');
    const run = await rpc('academy_create_run', [{ courseId: c.course, versionId: c.version, title, capacity }]);
    const session = await rpc('academy_save_session', [{ ...meeting, runId: run }]);
    if (publish) { await actor('admin'); await rpc('academy_publish_run', [run]); }
    const registrations = {};
    for (const who of users) { await actor(who); registrations[who] = await rpc('academy_register_run', [run]); }
    return { run, session, registrations };
}
async function waitingState(run) {
    await owner();
    return (await sql('select status,enrollment_id from course_run_registrations where run_id=$1 and user_id=$2', [run, ids.other])).rows[0];
}
async function finishQuiz(enrollmentId) {
    const questions = (await sql('select * from academy_get_quiz($1)', [enrollmentId])).rows;
    equal(questions.length, 4);
    return rpc('academy_submit_quiz', [enrollmentId, questions.map(q => ({ question_id: q.question_id, selected_option_id: q.options[0].id }))]);
}
// Wait for a real lock conflict, not an assumed ordering established by sleep.
async function waitForBlock(waiterPid, holderPid) {
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
        const result = await sql('select $2::int=any(pg_blocking_pids($1::int)) blocked', [waiterPid, holderPid]);
        if (result.rows[0].blocked) { checks++; return; }
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.fail('Contending request did not wait on the course admission lock');
}
async function archiveFirst(c, who, operation, expectedError) {
    const archive = await fixture.connectSession('admin'), contender = await fixture.connectSession(who);
    try {
        for (const connection of [archive, contender]) await connection.db.exec("set statement_timeout='8s';set lock_timeout='6s'");
        const aPid = (await archive.sql('select pg_backend_pid() pid')).rows[0].pid;
        const bPid = (await contender.sql('select pg_backend_pid() pid')).rows[0].pid;
        await archive.db.exec('begin'); await archive.rpc('academy_archive_course', [c.course]);
        const pending = operation(contender).then(value => ({ value }), error => ({ error }));
        await owner(); await waitForBlock(bPid, aPid);
        await archive.db.exec('commit');
        const outcome = await pending;
        if (expectedError) { assert.match(outcome.error?.message ?? '', expectedError); checks++; }
        else { assert.equal(outcome.error, undefined); checks++; }
        races++;
    } finally {
        await archive.db.exec('rollback'); await contender.db.exec('rollback');
        await archive.db.close(); await contender.db.close();
    }
}

try {
    const migration = await fs.readFile(new URL('../supabase/migrations/20260923093316_academy_archive_controls.sql', import.meta.url), 'utf8');
    await db.exec(migration); await db.exec(migration);
    const privileges = (await sql("select has_function_privilege('anon','public.academy_archive_course(uuid)','execute') anon_archive,has_function_privilege('authenticated','public.academy_archive_course(uuid)','execute') auth_archive,has_function_privilege('authenticated','academy_private.promote_run_waitlist(uuid)','execute') auth_promote,has_function_privilege('service_role','academy_private.confirm_registration(uuid)','execute') service_confirm")).rows[0];
    equal(privileges, { anon_archive: false, auth_archive: true, auth_promote: false, service_confirm: false });
    await actor('admin'); await rpc('academy_set_rollout', ['open', []]); await rpc('academy_set_trainer', [ids.trainer, true]);

    const c = await makeCourse('Archive prevents admission');
    const cancellation = await makeRun(c, 'Cancellation must not promote', { users: ['student', 'other'] });
    const capacity = await makeRun(c, 'Capacity must not promote', { users: ['student', 'other'] });
    const draft = await makeRun(c, 'Unpublished edition', { publish: false });
    equal(cancellation.registrations.other.status, 'waitlisted'); equal(capacity.registrations.other.status, 'waitlisted');
    await actor('trainer'); const nextVersion = await rpc('academy_begin_draft', [c.course]); await rpc('academy_submit_for_review', [c.course]);
    for (const who of ['trainer', 'student', 'internal']) { await actor(who); await denied('select academy_archive_course($1)', [c.course], /admin_required/); }
    await actor('', 'anon'); await denied('select academy_archive_course($1)', [c.course]);
    await service(); await denied('select academy_archive_course($1)', [c.course]);
    await actor('student'); await denied('select academy_private.promote_run_waitlist($1)', [cancellation.run]);
    await actor('admin'); await rpc('academy_archive_course', [c.course]); await rpc('academy_archive_course', [c.course]);
    equal((await sql("select count(*)::int n from academy_audit_events where course_id=$1 and action='COURSE_ARCHIVED'", [c.course])).rows[0].n, 1);
    equal((await sql('select status from courses where id=$1', [c.course])).rows[0].status, 'archived');
    const token = (await sql('select submission_id from course_versions where id=$1', [nextVersion])).rows[0].submission_id;
    await denied('select academy_review_course($1,true,null,$2)', [nextVersion, token], /pending_review_required/);
    await denied('select academy_publish_run($1)', [draft.run], /Program nie jest zatwierdzony/);
    await actor('trainer');
    await denied('select academy_begin_draft($1)', [c.course], /course_archived/);
    await denied('select academy_create_run($1)', [{ courseId: c.course, versionId: c.version, title: 'No new archived edition', capacity: 1 }], /zatwierdzonego/);
    await rpc('academy_update_run', [capacity.run, 'Existing edition remains manageable', 2]);
    equal(await waitingState(capacity.run), { status: 'waitlisted', enrollment_id: null });
    await actor('student'); await rpc('academy_cancel_registration', [cancellation.run]);
    equal(await waitingState(cancellation.run), { status: 'waitlisted', enrollment_id: null });
    await actor('other'); await denied('select academy_register_run($1)', [cancellation.run], /dostępna do zapisów/);
    await owner(); await sql('select academy_private.promote_run_waitlist($1)', [cancellation.run]);
    await denied('select academy_private.confirm_registration($1)', [cancellation.registrations.other.registrationId], /dostępna do zapisów/);
    equal(await waitingState(cancellation.run), { status: 'waitlisted', enrollment_id: null });
    equal((await sql('select count(*)::int n from course_enrollments where course_id=$1 and user_id=$2', [c.course, ids.other])).rows[0].n, 0);
    equal((await sql("select count(*)::int n from academy_audit_events where course_id=$1 and action='ACADEMY_REGISTRATION_CONFIRMED' and details->>'user_id'=$2", [c.course, ids.other])).rows[0].n, 0);
    await actor('other'); await rpc('academy_cancel_registration', [cancellation.run]);
    equal(await waitingState(cancellation.run), { status: 'cancelled', enrollment_id: null });
    // Archiving does not alter the roster or cancel the existing calendar event.
    await actor('student'); const continued = (await rpc('academy_list_runs', [c.course, capacity.run]))[0];
    equal(continued.myRegistration.enrollmentId, capacity.registrations.student.enrollmentId);
    equal(continued.sessions[0].status, 'scheduled'); equal(Boolean(continued.sessions[0].joinUrl), true);

    // A confirmed learner can complete the old program and receive its snapshot.
    const blended = await makeCourse('Continue archived blended program', 'blended');
    const blendedRun = await makeRun(blended, 'Preserved participation', { users: ['student'] });
    await actor('admin'); await rpc('academy_archive_course', [blended.course]);
    await actor('student');
    equal((await sql('select title from course_lessons where id=$1', [blended.lesson])).rows[0].title, 'Preserved lesson');
    await rpc('academy_mark_lesson_complete', [blendedRun.registrations.student.enrollmentId, blended.lesson]);
    equal((await finishQuiz(blendedRun.registrations.student.enrollmentId)).passed, true);
    await owner(); const started = time(-2), ended = time(-1);
    await sql('update course_sessions set starts_at=$2,ends_at=$3 where id=$1', [blendedRun.session, started, ended]);
    await actor('trainer'); await rpc('academy_confirm_session_window', [blendedRun.session, started, ended]);
    equal((await rpc('academy_record_attendance', [{ sessionId: blendedRun.session, enrollmentId: blendedRun.registrations.student.enrollmentId, status: 'present', attendedSeconds: 3600, note: 'Existing learner finished archived program' }])).completed, true);
    await actor('student');
    const completed = (await sql('select version_id,certificate_snapshot from course_completions where enrollment_id=$1', [blendedRun.registrations.student.enrollmentId])).rows[0];
    equal(completed.version_id, blended.version); equal(completed.certificate_snapshot.course_title, 'Continue archived blended program');
    await owner(); equal((await sql('select status from courses where id=$1', [blended.course])).rows[0].status, 'archived');

    const self = await makeCourse('Continue archived self paced program', 'self_paced');
    await actor('student'); const enrollment = await rpc('academy_enroll', [self.course, self.version]);
    await actor('admin'); await rpc('academy_archive_course', [self.course]);
    await actor('other'); await denied('select academy_enroll($1,$2)', [self.course, self.version], /published_version_required/);
    await actor('student'); equal(await rpc('academy_enroll', [self.course, self.version]), enrollment);
    await rpc('academy_mark_lesson_complete', [enrollment, self.lesson]);
    equal((await finishQuiz(enrollment)).completion.completed, true);
    equal((await sql('select version_id from course_completions where enrollment_id=$1', [enrollment])).rows[0].version_id, self.version);

    // Published courses still promote FIFO when a place actually becomes free.
    const normal = await makeCourse('Published admissions preserved');
    const normalRun = await makeRun(normal, 'Normal FIFO', { users: ['student', 'other'] });
    await actor('student'); await rpc('academy_cancel_registration', [normalRun.run]);
    const promoted = await waitingState(normalRun.run);
    equal(promoted.status, 'confirmed'); equal(Boolean(promoted.enrollment_id), true);

    const draftContent = await makeCourse('Archived drafts remain frozen');
    await actor('trainer'); const writableDraft = await rpc('academy_begin_draft', [draftContent.course]);
    await actor('admin'); await rpc('academy_archive_course', [draftContent.course]);
    await actor('trainer'); await denied("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Too late',0,'Blocked')", [draftContent.course,writableDraft], /version_not_editable|row-level security/);

    if (fixture.engine === 'postgres') {
        const registering = await makeCourse('Race archive before registration');
        const registeringRun = await makeRun(registering, 'Empty edition');
        await archiveFirst(registering, 'student', connection => connection.rpc('academy_register_run', [registeringRun.run]), /dostępna do zapisów/);
        await owner(); equal((await sql('select count(*)::int n from course_enrollments where run_id=$1', [registeringRun.run])).rows[0].n, 0);

        const cancelling = await makeCourse('Race archive before cancellation');
        const cancellingRun = await makeRun(cancelling, 'Waitlist cancellation race', { users: ['student', 'other'] });
        await archiveFirst(cancelling, 'student', connection => connection.rpc('academy_cancel_registration', [cancellingRun.run]));
        equal(await waitingState(cancellingRun.run), { status: 'waitlisted', enrollment_id: null });

        const growing = await makeCourse('Race archive before capacity increase');
        const growingRun = await makeRun(growing, 'Waitlist capacity race', { users: ['student', 'other'] });
        await archiveFirst(growing, 'trainer', connection => connection.rpc('academy_update_run', [growingRun.run, 'Larger archived edition', 2]));
        equal(await waitingState(growingRun.run), { status: 'waitlisted', enrollment_id: null });

        const publishing = await makeCourse('Race archive before edition publication');
        const publishingRun = await makeRun(publishing, 'Draft publication race', { publish: false });
        await archiveFirst(publishing, 'admin', connection => connection.rpc('academy_publish_run', [publishingRun.run]), /Program nie jest zatwierdzony/);
        await owner(); equal((await sql('select status from course_runs where id=$1', [publishingRun.run])).rows[0].status, 'draft');

        const creating = await makeCourse('Race archive before edition creation');
        await archiveFirst(creating, 'trainer', connection => connection.rpc('academy_create_run', [{ courseId: creating.course, versionId: creating.version, title: 'Blocked creation', capacity: 1 }]), /zatwierdzonego/);
        await owner(); equal((await sql('select count(*)::int n from course_runs where course_id=$1', [creating.course])).rows[0].n, 0);

        const reviewing = await makeCourse('Race archive before pending approval');
        await actor('trainer'); const pendingVersion = await rpc('academy_begin_draft', [reviewing.course]); await rpc('academy_submit_for_review', [reviewing.course]);
        await actor('admin'); const pendingToken = (await sql('select submission_id from course_versions where id=$1', [pendingVersion])).rows[0].submission_id;
        await archiveFirst(reviewing, 'admin', connection => connection.rpc('academy_review_course', [pendingVersion, true, null, pendingToken]), /pending_review_required/);
        await owner(); equal((await sql('select status from course_versions where id=$1', [pendingVersion])).rows[0].status, 'pending_review');

        const selfRace = await makeCourse('Race archived self paced admission', 'self_paced');
        await archiveFirst(selfRace, 'student', connection => connection.rpc('academy_enroll', [selfRace.course, selfRace.version]), /published_version_required/);
        await owner(); equal((await sql('select count(*)::int n from course_enrollments where course_id=$1', [selfRace.course])).rows[0].n, 0);

        // Inverse order: an admission committed first is valid historical access.
        const admitted = await makeCourse('Race registration before archive');
        const admittedRun = await makeRun(admitted, 'Admission wins first');
        const learner = await fixture.connectSession('student'), archiver = await fixture.connectSession('admin');
        try {
            for (const connection of [learner, archiver]) await connection.db.exec("set statement_timeout='8s';set lock_timeout='6s'");
            const learnerPid = (await learner.sql('select pg_backend_pid() pid')).rows[0].pid;
            const archivePid = (await archiver.sql('select pg_backend_pid() pid')).rows[0].pid;
            await learner.db.exec('begin'); const admittedRegistration = await learner.rpc('academy_register_run', [admittedRun.run]);
            equal(admittedRegistration.status, 'confirmed');
            const pending = archiver.rpc('academy_archive_course', [admitted.course]).then(value => ({ value }), error => ({ error }));
            await owner(); await waitForBlock(archivePid, learnerPid); await learner.db.exec('commit');
            equal((await pending).error, undefined); races++;
            await actor('student'); equal((await rpc('academy_list_runs', [admitted.course, admittedRun.run]))[0].myRegistration.enrollmentId, admittedRegistration.enrollmentId);
            await owner(); equal((await sql('select status from courses where id=$1', [admitted.course])).rows[0].status, 'archived');
        } finally {
            await learner.db.exec('rollback'); await archiver.db.exec('rollback');
            await learner.db.close(); await archiver.db.close();
        }
        // Direct draft edits take a version lock. An archive that wins first
        // rejects the edit, while an already-started edit finishes before it.
        const lockedDraft = await makeCourse('Archive wins direct content edit');
        await actor('trainer'); const lockedVersion = await rpc('academy_begin_draft', [lockedDraft.course]);
        const archiving = await fixture.connectSession('admin'), editor = await fixture.connectSession('trainer');
        try {
            for (const connection of [archiving, editor]) await connection.db.exec("set statement_timeout='8s';set lock_timeout='6s'");
            const archivePid = (await archiving.sql('select pg_backend_pid() pid')).rows[0].pid;
            const editorPid = (await editor.sql('select pg_backend_pid() pid')).rows[0].pid;
            await archiving.db.exec('begin'); await archiving.rpc('academy_archive_course', [lockedDraft.course]);
            const pending = editor.sql("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Blocked content',0,'After archive')", [lockedDraft.course,lockedVersion]).then(value => ({ value }), error => ({ error }));
            await owner(); await waitForBlock(editorPid, archivePid);
            await archiving.db.exec('commit');
            assert.match((await pending).error?.message ?? '', /version_not_editable|row-level security/); checks++; races++;
        } finally {
            await archiving.db.exec('rollback'); await editor.db.exec('rollback');
            await archiving.db.close(); await editor.db.close();
        }
        const editedDraft = await makeCourse('Direct content edit wins archive');
        await actor('trainer'); const editableVersion = await rpc('academy_begin_draft', [editedDraft.course]);
        const writer = await fixture.connectSession('trainer'), closing = await fixture.connectSession('admin');
        try {
            for (const connection of [writer, closing]) await connection.db.exec("set statement_timeout='8s';set lock_timeout='6s'");
            const writerPid = (await writer.sql('select pg_backend_pid() pid')).rows[0].pid;
            const closingPid = (await closing.sql('select pg_backend_pid() pid')).rows[0].pid;
            await writer.db.exec('begin');
            await writer.sql("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Kept content',0,'Before archive')", [editedDraft.course,editableVersion]);
            const pending = closing.rpc('academy_archive_course', [editedDraft.course]).then(value => ({ value }), error => ({ error }));
            await owner(); await waitForBlock(closingPid, writerPid);
            await writer.db.exec('commit');
            equal((await pending).error, undefined); races++;
            await owner(); equal((await sql("select count(*)::int n from course_lessons where version_id=$1 and title='Kept content'", [editableVersion])).rows[0].n, 1);
            equal((await sql('select status from courses where id=$1',[editedDraft.course])).rows[0].status, 'archived');
        } finally {
            await writer.db.exec('rollback'); await closing.db.exec('rollback');
            await writer.db.close(); await closing.db.close();
        }
        equal(races, 10);
    }
    console.log(`Academy archive controls: ${checks} assertions passed (${fixture.engine}); concurrent scenarios: ${races}${fixture.engine === 'pglite' ? ' (not executed; require hosted PostgreSQL)' : ''}.`);
} catch (error) {
    console.error('Academy archive regression failed', { message: error.message, code: error.code, where: error.where, actual: error.actual, expected: error.expected });
    process.exitCode = 1;
} finally { await db.close(); }
