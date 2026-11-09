// B4.8 / G46: kurs dla nieobecnych powstaje z edycji jednym działaniem, z tą samą pulą, a program liczy się raz.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ patrykCycle: true });
const { db, sql, ids, actor, owner, rpc, expectDenied } = fixture;
let checks = 0;
const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
const denied = async (...args) => { await expectDenied(...args); checks++; };
const create = 'select public.academy_create_twin_course($1) r';
const migration = name => fs.readFileSync(fileURLToPath(new URL(`../supabase/migrations/${name}`, import.meta.url)), 'utf8');

try {
    await owner();
    for (const file of ['20260923125544_academy_quiz_attempt_window.sql', '20261006080417_academy_tcm_full_editor.sql', '20261109200100_academy_quiz_pool.sql', '20261109213400_academy_library.sql', '20261110130000_academy_twin_course.sql']) await db.exec(migration(file));

    await actor('admin'); await rpc('academy_set_trainer', [ids.trainer, true]);
    await actor('trainer');
    const rules = { quiz_required: true, quiz_pass_percent: 70, require_all_lessons: false, attendance_percent: 80 };
    const c = await rpc('academy_create_course', [{ title: 'PEGA podstawy', category: 'IT', delivery_mode: 'live', completion_rules: rules }]);
    await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md,estimated_minutes)values($1,$2,'Case Lifecycle',0,'Opis',18)", [c.course_id, c.version_id]);
    for (let i = 0; i < 4; i++) {
        const question = (await sql('insert into course_quiz_questions(course_id,version_id,order_index,question_text,topic_tag)values($1,$2,$3,$4,$5)returning id', [c.course_id, c.version_id, i, `Pytanie ${i}`, 'pega'])).rows[0].id;
        await sql("insert into course_quiz_options(question_id,order_index,option_text,is_correct,explanation)values($1,0,'Tak',true,'Bo tak'),($1,1,'Nie',false,null)", [question]);
    }
    await rpc('academy_submit_for_review', [c.course_id]);
    const token = (await sql('select submission_id from course_versions where id=$1', [c.version_id])).rows[0].submission_id;
    await actor('admin'); await rpc('academy_review_course', [c.version_id, true, null, token]);

    await actor('trainer');
    const run = await rpc('academy_create_run', [{ courseId: c.course_id, versionId: c.version_id, title: 'Edycja 1', capacity: 5 }]);
    await rpc('academy_save_session', [{ runId: run, title: 'Spotkanie', startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: 'https://teams.microsoft.com/meet/1', required: true }]);
    await actor('admin'); await rpc('academy_publish_run', [run]);
    await actor('student'); await rpc('academy_register_run', [run]);
    await actor('other'); await rpc('academy_register_run', [run]);

    // Denials and the edition must have ended.
    await actor('student'); await denied(create, [run], /run_manager_required/);
    await actor('', 'anon'); await denied(create, [run]);
    await actor('trainer'); await denied(create, [run], /run_not_finished/);

    // End the edition; "other" attended, "student" did not.
    await owner();
    await sql("update course_sessions set starts_at=now()-interval '2 hours', ends_at=now()-interval '1 hour' where run_id=$1", [run]);
    const session = (await sql('select id from course_sessions where run_id=$1', [run])).rows[0].id;
    const otherEnrollment = (await sql('select enrollment_id from course_run_registrations where run_id=$1 and user_id=$2', [run, ids.other])).rows[0].enrollment_id;
    await sql("insert into session_attendance(session_id,enrollment_id,status,attended_seconds,source,reviewed_by,note)values($1,$2,'present',3600,'manual',$3,'Lista obecności')", [session, otherEnrollment, ids.trainer]);

    await actor('trainer');
    const first = (await sql(create, [run])).rows[0].r;
    eq([first.created, first.absentees], [true, 1]);

    // A second click returns the same draft.
    const second = (await sql(create, [run])).rows[0].r;
    eq([second.created, second.course_id, second.absentees], [false, first.course_id, 1]);

    await owner();
    const twin = (await sql('select status,delivery_mode,source_run_id,programme_id from courses where id=$1', [first.course_id])).rows[0];
    eq([twin.status, twin.delivery_mode, twin.source_run_id], ['draft', 'self_paced', run]);
    const version = (await sql('select id,status,completion_rules from course_versions where course_id=$1', [first.course_id])).rows[0];
    eq([version.status, version.completion_rules.quiz_required, version.completion_rules.quiz_pass_percent, version.completion_rules.require_all_lessons], ['draft', true, 70, true]);

    // Same pool, as a copy: editing the twin cannot touch the published edition.
    const pool = async versionId => (await sql('select q.order_index,q.question_text,q.topic_tag,(select count(*)::int from course_quiz_options o where o.question_id=q.id) options,(select bool_or(o.is_correct and o.explanation is not null) from course_quiz_options o where o.question_id=q.id) explained from course_quiz_questions q where q.version_id=$1 order by 1', [versionId])).rows;
    eq(await pool(version.id), await pool(c.version_id));
    eq((await pool(version.id)).length, 4);
    eq((await sql('select count(*)::int n from course_quiz_questions a join course_quiz_questions b on a.id=b.id where a.version_id=$1 and b.version_id=$2', [version.id, c.version_id])).rows[0].n, 0);

    // Lessons copied without files; the absentee list holds only the person who missed it.
    eq((await sql('select title,attachments from course_lessons where version_id=$1', [version.id])).rows, [{ title: 'Case Lifecycle', attachments: [] }]);
    eq((await sql('select user_id from academy_twin_course_absentees where course_id=$1', [first.course_id])).rows, [{ user_id: ids.student }]);

    // Nothing was published: review stays independent, and learners cannot read the list.
    await actor('student');
    eq((await sql('select count(*)::int n from academy_twin_course_absentees')).rows[0].n, 0);
    await denied('insert into academy_twin_course_absentees(course_id,user_id,run_id)values($1,$2,$3)', [first.course_id, ids.student, run]);

    // One programme, counted once for someone who completed both forms.
    await owner();
    eq((await sql('select programme_id from courses where id=$1', [c.course_id])).rows[0].programme_id, twin.programme_id);
    await db.exec('SET session_replication_role = replica');
    const completion = "insert into course_completions(enrollment_id,user_id,course_id,version_id,completed_at,certificate_snapshot)values($1,$2,$3,$4,now(),'{}')";
    await sql(completion, [otherEnrollment, ids.other, c.course_id, c.version_id]);
    await sql(completion, [ids.admin, ids.other, first.course_id, version.id]);
    await db.exec('SET session_replication_role = DEFAULT');
    await actor('admin');
    const report = (await sql('select courses,completed_users from academy_programme_completions() where programme_id=$1', [twin.programme_id])).rows[0];
    eq([report.courses, report.completed_users], [2, 1]);
    await actor('student'); await denied('select * from academy_programme_completions()', [], /admin_required/);

    console.log(`Academy twin course DB checks passed: ${checks}`);
} finally {
    await db.close();
}
