// Two-video lesson captions must be explicit, scoped and frozen with the version.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ materials: true });
const { db, sql, actor, service, rpc, ids } = fixture;
const migrationsDir = new URL('../supabase/migrations/', import.meta.url);
const matches = fs.readdirSync(migrationsDir).filter(name => name.endsWith('_academy_lesson_caption_association.sql'));
assert.equal(matches.length, 1, 'lesson caption migration must be unambiguous');
const migration = fileURLToPath(new URL(matches[0], migrationsDir));
let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const denied = async (statement, params, reason) => {
    try { await sql(statement, params); assert.fail('Expected denial'); }
    catch (error) {
        if (error.code === 'ERR_ASSERTION') throw error;
        assert.match(error.message, reason); checks++;
    }
};

try {
    await db.exec(fs.readFileSync(migration, 'utf8'));
    await actor('admin'); await rpc('academy_set_trainer', [ids.trainer, true]);
    await actor('trainer');
    const course = await rpc('academy_create_course', [{ title: 'Two captioned recordings', category: 'IT', completion_rules: { quiz_required: false, require_all_lessons: true } }]);
    const lesson = (await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Main lesson',0,'Content') returning id", [course.course_id, course.version_id])).rows[0].id;
    const otherLesson = (await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Other lesson',1,'Content') returning id", [course.course_id, course.version_id])).rows[0].id;
    await service();
    async function asset(lessonId, filename, mime, versionId = course.version_id) {
        const { rows } = await sql(`insert into course_materials(course_id,version_id,lesson_id,uploaded_by,filename,storage_path,mime_type,size_bytes,status)
            values($1,$2,$3,$4,$5,$6,$7,100,'ready') returning id`,
        [course.course_id, versionId, lessonId, ids.trainer, filename, `${lessonId}/${filename}`, mime]);
        return { asset_id: rows[0].id, name: filename, storage_path: `${lessonId}/${filename}`, mime_type: mime, size_bytes: 100 };
    }
    const firstVideo = await asset(lesson, 'one.mp4', 'video/mp4');
    const secondVideo = await asset(lesson, 'two.mp4', 'video/mp4');
    const firstVtt = await asset(lesson, 'one.vtt', 'text/vtt');
    const secondVtt = await asset(lesson, 'two.vtt', 'text/vtt');
    const otherVideo = await asset(otherLesson, 'other.mp4', 'video/mp4');
    const attachments = [firstVideo, secondVideo,
        { ...firstVtt, caption_for_asset_id: firstVideo.asset_id },
        { ...secondVtt, caption_for_asset_id: secondVideo.asset_id }];
    await actor('student');
    equal((await sql('update course_lessons set attachments=$1 where id=$2 returning id', [JSON.stringify(attachments), lesson])).rows.length, 0);
    await actor('trainer');
    await sql('update course_lessons set attachments=$1 where id=$2', [JSON.stringify(attachments), lesson]);
    equal((await sql('select attachments from course_lessons where id=$1', [lesson])).rows[0].attachments, attachments);
    await denied('update course_lessons set attachments=$1 where id=$2',
        [JSON.stringify([firstVideo, secondVideo, { ...firstVtt, caption_for_asset_id: secondVideo.asset_id }, { ...secondVtt, caption_for_asset_id: secondVideo.asset_id }]), lesson], /lesson_video_already_captioned/);
    await denied('update course_lessons set attachments=$1 where id=$2',
        [JSON.stringify([firstVideo, secondVideo, { ...firstVtt, caption_for_asset_id: otherVideo.asset_id }, secondVtt]), lesson], /video_not_in_caption_lesson/);
    await denied('update course_lessons set attachments=$1 where id=$2',
        [JSON.stringify([firstVideo, secondVideo, otherVideo, { ...firstVtt, caption_for_asset_id: otherVideo.asset_id }, secondVtt]), lesson], /video_not_in_caption_lesson/);
    await denied('update course_lessons set attachments=$1 where id=$2',
        [JSON.stringify([{ ...firstVideo, caption_for_asset_id: secondVideo.asset_id }, secondVideo, firstVtt, secondVtt]), lesson], /caption_must_be_verified_vtt/);
    await denied('update course_lessons set attachments=$1 where id=$2',
        [JSON.stringify([firstVideo, secondVideo, { ...firstVtt, caption_for_asset_id: 'not-a-uuid' }, secondVtt]), lesson], /invalid_lesson_caption_target/);
    await denied('update course_lessons set attachments=$1 where id=$2',
        [JSON.stringify([firstVideo, { ...firstVtt, caption_for_asset_id: firstVideo.asset_id }, { ...secondVtt, caption_for_asset_id: secondVideo.asset_id }]), lesson], /video_not_in_caption_lesson/);
    const detached = [firstVideo, { ...firstVtt, caption_for_asset_id: firstVideo.asset_id }, { ...secondVtt, caption_for_asset_id: null }];
    await sql('update course_lessons set attachments=$1 where id=$2', [JSON.stringify(detached), lesson]);
    equal((await sql('select attachments from course_lessons where id=$1', [lesson])).rows[0].attachments, detached);
    await rpc('academy_submit_for_review', [course.course_id]);
    equal((await sql('update course_lessons set attachments=$1 where id=$2 returning id', [JSON.stringify(attachments), lesson])).rows.length, 0);
    await actor('admin'); await rpc('academy_review_course', [course.version_id, true, null]);
    await actor('trainer');
    const nextVersion = await rpc('academy_begin_draft', [course.course_id]);
    const cloneRow = (await sql('select id,attachments from course_lessons where version_id=$1 and order_index=0', [nextVersion])).rows[0];
    equal(cloneRow.attachments, detached);
    await service();
    const newVideo = await asset(cloneRow.id, 'new-version.mp4', 'video/mp4', nextVersion);
    await actor('trainer');
    await denied('update course_lessons set attachments=$1 where id=$2',
        [JSON.stringify([newVideo, { ...firstVtt, caption_for_asset_id: newVideo.asset_id }]), cloneRow.id], /video_not_in_caption_lesson/);
    console.log(`PASS ${checks} lesson caption association database assertions`);
} finally { await db.close(); }
