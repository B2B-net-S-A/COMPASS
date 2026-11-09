// B4.3: autoryzacja, scalanie zakresów, wznawianie, automatyczne zaliczenie
// oraz odmowa ręcznego zaliczenia lekcji z nagraniem przez RPC (domknięcie B4.3).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ materials: true });
const { db, ids, sql, actor, owner, service, rpc, expectDenied } = fixture;
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const denied = async (...args) => { await expectDenied(...args); checks++; };
const save = `select public.academy_save_video_progress($1,$2,$3,$4,$5,$6::jsonb) r`;
const rules = { quiz_required: false, quiz_pass_percent: 80, require_all_lessons: true, attendance_percent: 80 };

async function addVideo(lesson, course, name) {
    await actor('trainer');
    const asset = await rpc('academy_reserve_material', [course.course_id, name, 'video/mp4', 100, 0, lesson]);
    await service();
    await sql("insert into storage.objects(bucket_id,name,version,owner,owner_id,metadata)values('academy-materials',$1,gen_random_uuid()::text,$2::uuid,$2::text,$3)", [asset.storage_path, ids.trainer, { size: 100, mimetype: 'video/mp4' }]);
    await actor('trainer');
    await rpc('academy_finish_material_upload', [asset.id]);
    await service();
    const claimed = (await sql('select to_jsonb(scan) asset from academy_claim_material_scan() scan')).rows[0].asset;
    eq(await rpc('academy_accept_material_scan', [asset.id, claimed.scan_started_at, 'a'.repeat(64), null]), true);
    return asset.id;
}
async function publishedCourse(title, extraRules = {}, videos = 1) {
    await actor('admin');
    await rpc('academy_set_trainer', [ids.trainer, true]);
    await actor('trainer');
    const course = await rpc('academy_create_course', [{ title, category: 'IT', completion_rules: { ...rules, ...extraRules } }]);
    const lesson = (await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md)values($1,$2,'Video',0,'Opis')returning id", [course.course_id, course.version_id])).rows[0].id;
    const assets = [];
    for (let i = 0; i < videos; i++) assets.push(await addVideo(lesson, course, `Part${i}.mp4`));
    await actor('trainer');
    await rpc('academy_submit_for_review', [course.course_id]);
    await actor('admin');
    await rpc('academy_review_course', [course.version_id, true, null]);
    return { course, lesson, assets };
}
const backdate = async (user, asset, seconds) => { await owner(); await sql(`update academy_video_progress set updated_at=now()-make_interval(secs=>$3) where user_id=$1 and asset_id=$2`, [user, asset, seconds]); };

const migration = name => fs.readFileSync(fileURLToPath(new URL(`../supabase/${name}`, import.meta.url)), 'utf8');
const mark = 'select public.academy_mark_lesson_complete($1,$2) r';

try {
    // The guard goes on first, so every automatic completion below also proves it does not block that path.
    await db.exec(migration('migrations/20261109213000_academy_video_progress.sql'));
    await db.exec(migration('migrations/20261110170000_academy_b4_3_mark_complete_guard.sql'));

    const { course, lesson, assets: [asset] } = await publishedCourse('Video progress');
    await actor('student');
    const enrollment = await rpc('academy_enroll', [course.course_id, null]);

    // Denials: anonymous, other user's enrollment, foreign asset, malformed payloads.
    await actor('', 'anon');
    await denied(save, [enrollment, lesson, asset, 1, 100, '[]']);
    await actor('other');
    await denied(save, [enrollment, lesson, asset, 1, 100, '[]'], /own_enrollment_required/);
    await actor('student');
    await denied(save, [enrollment, lesson, ids.admin, 1, 100, '[]'], /video_not_in_lesson/);
    for (const bad of ['{}', '[[1]]', '[[5,2]]', '[[-1,2]]', '[[0,102]]', '[["a","b"]]', JSON.stringify(Array.from({ length: 201 }, (_, i) => [i, i + 0.5]))]) await denied(save, [enrollment, lesson, asset, 1, 100, bad], /invalid_video_progress/);
    await denied(save, [enrollment, lesson, asset, -1, 100, '[]'], /invalid_video_progress/);
    await denied(save, [enrollment, lesson, asset, 1, 0, '[]'], /invalid_video_progress/);
    await denied(save, [enrollment, lesson, asset, 1, 90000, '[]'], /invalid_video_progress/);

    // No direct writes, and a user reads only their own row.
    await denied("insert into academy_video_progress(user_id,asset_id,duration_seconds)values($1,$2,10)", [ids.student, asset]);
    let result = (await sql(save, [enrollment, lesson, asset, 15, 100, '[[0,15]]'])).rows[0].r;
    eq([result.accepted, result.completed, result.watched_percent, result.threshold_percent], [true, false, 15, 90]);
    await denied('update academy_video_progress set position_seconds=99');
    await actor('other');
    eq((await sql('select count(*)::int n from academy_video_progress')).rows[0].n, 0);

    // Position is what another device resumes from.
    await actor('student');
    eq((await sql('select position_seconds::numeric p from academy_video_progress where asset_id=$1', [asset])).rows[0].p, '15.000');

    // Overlapping ranges merge; a claim far beyond elapsed time is dropped, position still saved.
    result = (await sql(save, [enrollment, lesson, asset, 95, 100, '[[10,95]]'])).rows[0].r;
    eq([result.accepted, result.completed, result.watched_percent], [false, false, 15]);
    eq((await sql('select position_seconds::numeric p from academy_video_progress where asset_id=$1', [asset])).rows[0].p, '95.000');

    // The same ranges pass once enough real time has elapsed, and 90% completes the lesson.
    await backdate(ids.student, asset, 60);
    await actor('student');
    result = (await sql(save, [enrollment, lesson, asset, 95, 100, '[[10,95]]'])).rows[0].r;
    eq([result.accepted, result.completed, result.already_completed, result.watched_percent], [true, true, false, 95]);
    eq((await sql('select completed_lessons from course_enrollments where id=$1', [enrollment])).rows[0].completed_lessons, [lesson]);

    // Calling the RPC on a completed video lesson stays idempotent.
    eq((await sql(mark, [enrollment, lesson])).rows[0].r.already_completed, true);

    // A later save does not re-award and a shorter reported duration cannot shrink the total.
    await backdate(ids.student, asset, 60);
    await actor('student');
    result = (await sql(save, [enrollment, lesson, asset, 5, 10, '[[0,5]]'])).rows[0].r;
    eq([result.completed, result.already_completed], [true, true]);
    eq((await sql('select duration_seconds::numeric d from academy_video_progress where asset_id=$1', [asset])).rows[0].d, '100.000');

    // Threshold configured on the version, and just below it does not complete.
    const custom = await publishedCourse('Custom threshold', { video_watch_percent: 60 });
    await actor('student');
    const customEnrollment = await rpc('academy_enroll', [custom.course.course_id, null]);
    await sql(save, [customEnrollment, custom.lesson, custom.assets[0], 25, 100, '[[0,25]]']);
    await backdate(ids.student, custom.assets[0], 120);
    await actor('student');
    result = (await sql(save, [customEnrollment, custom.lesson, custom.assets[0], 59, 100, '[[0,59]]'])).rows[0].r;
    eq([result.completed, result.threshold_percent], [false, 60]);
    // Manual completion through the RPC is refused below the threshold.
    await denied(mark, [customEnrollment, custom.lesson], /video_watch_required/);
    await backdate(ids.student, custom.assets[0], 120);
    await actor('student');
    result = (await sql(save, [customEnrollment, custom.lesson, custom.assets[0], 60, 100, '[[59,60]]'])).rows[0].r;
    eq(result.completed, true);

    // Several parts count as one session: finishing part one alone must not complete.
    const parts = await publishedCourse('Two parts', {}, 2);
    await actor('student');
    const partsEnrollment = await rpc('academy_enroll', [parts.course.course_id, null]);
    await sql(save, [partsEnrollment, parts.lesson, parts.assets[0], 25, 100, '[[0,25]]']);
    await backdate(ids.student, parts.assets[0], 120);
    await actor('student');
    result = (await sql(save, [partsEnrollment, parts.lesson, parts.assets[0], 100, 100, '[[25,100]]'])).rows[0].r;
    eq([result.completed, result.watched_percent], [false, 100]);
    await sql(save, [partsEnrollment, parts.lesson, parts.assets[1], 25, 100, '[[0,25]]']);
    await backdate(ids.student, parts.assets[1], 120);
    await actor('student');
    result = (await sql(save, [partsEnrollment, parts.lesson, parts.assets[1], 80, 100, '[[25,80]]'])).rows[0].r;
    eq([result.completed, result.watched_percent], [true, 90]);

    // Without any saved progress the RPC is refused, and nothing is recorded.
    const direct = await publishedCourse('Direct RPC');
    await actor('student');
    const directEnrollment = await rpc('academy_enroll', [direct.course.course_id, null]);
    await denied(mark, [directEnrollment, direct.lesson], /video_watch_required/);
    eq((await sql('select completed_lessons from course_enrollments where id=$1', [directEnrollment])).rows[0].completed_lessons, []);
    // One of two parts unwatched still blocks, even if the watched part alone is past the threshold.
    const partsFresh = await publishedCourse('Two parts direct', {}, 2);
    await actor('student');
    const partsFreshEnrollment = await rpc('academy_enroll', [partsFresh.course.course_id, null]);
    await sql(save, [partsFreshEnrollment, partsFresh.lesson, partsFresh.assets[0], 25, 100, '[[0,25]]']);
    await backdate(ids.student, partsFresh.assets[0], 120);
    await actor('student');
    await sql(save, [partsFreshEnrollment, partsFresh.lesson, partsFresh.assets[0], 100, 100, '[[25,100]]']);
    await denied(mark, [partsFreshEnrollment, partsFresh.lesson], /video_watch_required/);

    // Same rounding as the automatic path: 89.94% stays below 90, 89.96% rounds to 90.0 and the RPC completes.
    const watched = await publishedCourse('Watched elsewhere');
    await actor('student');
    const watchedEnrollment = await rpc('academy_enroll', [watched.course.course_id, null]);
    const setWatched = async end => { await owner(); await sql("insert into academy_video_progress(user_id,asset_id,position_seconds,duration_seconds,watched_ranges)values($1,$2,$3,100,jsonb_build_array(jsonb_build_array(0,$3::numeric))) on conflict(user_id,asset_id) do update set watched_ranges=excluded.watched_ranges", [ids.student, watched.assets[0], end]); await actor('student'); };
    await setWatched(89.94);
    await denied(mark, [watchedEnrollment, watched.lesson], /video_watch_required/);
    await setWatched(89.96);
    result = (await sql(mark, [watchedEnrollment, watched.lesson])).rows[0].r;
    eq([result.completed, result.already_completed], [true, false]);

    // A lesson without a recording is still completed manually.
    const text = await publishedCourse('Text only', {}, 0);
    await actor('student');
    const textEnrollment = await rpc('academy_enroll', [text.course.course_id, null]);
    result = (await sql(mark, [textEnrollment, text.lesson])).rows[0].r;
    eq([result.completed, result.already_completed], [true, false]);

    // The helper is not callable by learners.
    await denied('select academy_private.lesson_video_requirement_met($1,$2,$3)', [ids.student, direct.course.version_id, direct.lesson]);

    // Rollback restores the previous behaviour, then the guard re-applies cleanly.
    await owner();
    await db.exec(migration('rollbacks/20261110170000_academy_b4_3_mark_complete_guard.sql'));
    await actor('student');
    result = (await sql(mark, [directEnrollment, direct.lesson])).rows[0].r;
    eq(result.completed, true);
    await owner();
    await db.exec(migration('migrations/20261110170000_academy_b4_3_mark_complete_guard.sql'));
    await actor('student');
    await denied(mark, [partsFreshEnrollment, partsFresh.lesson], /video_watch_required/);

    console.log(`Academy video progress DB checks passed: ${checks}`);
} finally {
    await db.close();
}
