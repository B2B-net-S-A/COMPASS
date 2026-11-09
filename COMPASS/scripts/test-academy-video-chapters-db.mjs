// B4.4: kto czyta i kto zapisuje rozdziały nagrania.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ materials: true });
const { db, ids, sql, actor, service, rpc, expectDenied } = fixture;
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const denied = async (...args) => { await expectDenied(...args); checks++; };
const replace = 'select public.academy_replace_video_chapters($1,$2::jsonb) n';
const list = 'select position_seconds,title from academy_video_chapters where asset_id=$1 order by position_seconds';
const rules = { quiz_required: false, quiz_pass_percent: 80, require_all_lessons: true, attendance_percent: 80 };

try {
    await db.exec(fs.readFileSync(fileURLToPath(new URL('../supabase/migrations/20261109213100_academy_video_chapters.sql', import.meta.url)), 'utf8'));
    await actor('admin');
    await rpc('academy_set_trainer', [ids.trainer, true]);
    await actor('trainer');
    const course = await rpc('academy_create_course', [{ title: 'Chapters', category: 'IT', completion_rules: rules }]);
    const lesson = (await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md)values($1,$2,'Video',0,'Opis')returning id", [course.course_id, course.version_id])).rows[0].id;
    const add = async (name, mime) => {
        await actor('trainer');
        const asset = await rpc('academy_reserve_material', [course.course_id, name, mime, 100, 0, lesson]);
        await service();
        await sql("insert into storage.objects(bucket_id,name,version,owner,owner_id,metadata)values('academy-materials',$1,gen_random_uuid()::text,$2::uuid,$2::text,$3)", [asset.storage_path, ids.trainer, { size: 100, mimetype: mime }]);
        await actor('trainer');
        await rpc('academy_finish_material_upload', [asset.id]);
        await service();
        const claimed = (await sql('select to_jsonb(scan) asset from academy_claim_material_scan() scan')).rows[0].asset;
        await rpc('academy_accept_material_scan', [asset.id, claimed.scan_started_at, 'a'.repeat(64), null]);
        return asset.id;
    };
    const video = await add('Lecture.mp4', 'video/mp4');
    const pdf = await add('Notes.pdf', 'application/pdf');

    // Denials first.
    await actor('', 'anon');
    await denied(replace, [video, '[]']);
    await actor('student');
    await denied(replace, [video, JSON.stringify([{ position_seconds: 1, title: 'X' }])], /trainer_course_required/);
    await denied('insert into academy_video_chapters(asset_id,position_seconds,title)values($1,1,$2)', [video, 'X']);
    await actor('trainer');
    await denied(replace, [pdf, '[]'], /chapters_require_video/);
    for (const bad of ['{}', '[1]', '[{"position_seconds":-1,"title":"A"}]', '[{"position_seconds":1.5,"title":"A"}]', '[{"position_seconds":1,"title":"   "}]', `[{"position_seconds":1,"title":"${'x'.repeat(121)}"}]`, JSON.stringify(Array.from({ length: 101 }, (_, i) => ({ position_seconds: i, title: 'A' })))]) await denied(replace, [video, bad], /invalid_video_chapters/);
    await denied(replace, [video, '[{"position_seconds":5,"title":"A"},{"position_seconds":5,"title":"B"}]'], /duplicate_video_chapter/);

    // Replace is atomic and ordered on read.
    eq((await sql(replace, [video, '[{"position_seconds":60,"title":" Wstęp "},{"position_seconds":0,"title":"Start"}]'])).rows[0].n, 2);
    eq((await sql(list, [video])).rows, [{ position_seconds: 0, title: 'Start' }, { position_seconds: 60, title: 'Wstęp' }]);
    eq((await sql(replace, [video, '[{"position_seconds":10,"title":"Nowy"}]'])).rows[0].n, 1);
    eq((await sql(list, [video])).rows, [{ position_seconds: 10, title: 'Nowy' }]);

    // A learner without access reads nothing until enrolled.
    await actor('student');
    eq((await sql(list, [video])).rows, []);
    await actor('trainer');
    await rpc('academy_submit_for_review', [course.course_id]);
    await actor('admin');
    await rpc('academy_review_course', [course.version_id, true, null]);
    await actor('student');
    await rpc('academy_enroll', [course.course_id, null]);
    eq((await sql(list, [video])).rows, [{ position_seconds: 10, title: 'Nowy' }]);
    await denied(replace, [video, '[]'], /trainer_course_required/);

    console.log(`Academy video chapters DB checks passed: ${checks}`);
} finally {
    await db.close();
}
