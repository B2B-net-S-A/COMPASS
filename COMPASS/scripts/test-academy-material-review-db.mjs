import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const f = await createAcademyDatabase({ materialReviewIndependence: true });
const { db, ids, sql, actor, owner, service, rpc } = f;
let checks = 0;

await actor('admin');
await rpc('academy_set_trainer', [ids.trainer, true]);
await actor('trainer');
const course = await rpc('academy_create_course', [{ title: 'Independent file review', category: 'IT', delivery_mode: 'live' }]);
const lesson = (await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Lesson',0,'Training') returning id", [course.course_id, course.version_id])).rows[0].id;

// This administrator contributes only a file: no lesson/quiz/metadata edit is made
// under their identity, and the scanner attaches the file as service_role.
await actor('admin');
const asset = await rpc('academy_reserve_material', [course.course_id, 'Slides.pdf', 'application/pdf', 100, 0, lesson]);
assert.equal(await rpc('academy_can_review_version', [course.version_id]), true); checks++;
await service();
await sql("insert into storage.objects(bucket_id,name,version,owner,owner_id,metadata) values('academy-materials',$1,gen_random_uuid()::text,$2::uuid,$2::text,$3)",
    [asset.storage_path, ids.admin, { size: 100, mimetype: 'application/pdf' }]);
await actor('admin');
await rpc('academy_finish_material_upload', [asset.id]);
await service();
const scan = (await sql('select to_jsonb(s) asset from academy_claim_material_scan() s')).rows[0].asset;
assert.equal(scan.id, asset.id); checks++;
assert.equal(await rpc('academy_accept_material_scan', [asset.id, scan.scan_started_at, 'a'.repeat(64), null]), true); checks++;
await owner();
assert.equal((await sql('select 1 from academy_private.version_contributors where version_id=$1 and user_id=$2', [course.version_id, ids.admin])).rows.length, 1); checks++;
assert.equal((await sql('select attachments from course_lessons where id=$1', [lesson])).rows[0].attachments[0].asset_id, asset.id); checks++;

await actor('admin');
assert.equal(await rpc('academy_can_review_version', [course.version_id]), false); checks++;
await actor('trainer');
await rpc('academy_submit_for_review', [course.course_id]);
await actor('admin');
await f.expectDenied('select academy_review_course($1,true,null)', [course.version_id], /independent_admin_review_required/); checks++;

const independent = '00000000-0000-0000-0000-000000000098';
await owner();
await sql("insert into auth.users(id,email) values($1,'independent@example.test')", [independent]);
await sql("insert into profiles(id,role,email) values($1,'admin','independent@example.test')", [independent]);
await actor(independent);
await rpc('academy_review_course', [course.version_id, true, null]); checks++;

// Cloning keeps the same asset reference. The original uploader must not be
// allowed to approve a later version that still contains their file.
await actor('trainer');
const next = await rpc('academy_begin_draft', [course.course_id]);
await actor('admin');
assert.equal(await rpc('academy_can_review_version', [next]), false); checks++;
await owner();
assert.equal((await sql('select 1 from academy_private.version_contributors where version_id=$1 and user_id=$2', [next, ids.admin])).rows.length, 1); checks++;
await actor('trainer');
await sql("update course_lessons set attachments='[]'::jsonb where version_id=$1", [next]);
await actor('admin');
assert.equal(await rpc('academy_can_review_version', [next]), false); checks++;

console.log(`PASS ${checks} independent review assertions for scanned and cloned materials`);
await db.close();

// Upgrade proof: a file linked before this migration must immediately block
// its uploader from approving the existing version, without a fresh edit.
const prior = await createAcademyDatabase({ runMaterials: true });
const p = prior;
await p.actor('admin');
await p.rpc('academy_set_trainer', [p.ids.trainer, true]);
await p.actor('trainer');
const oldCourse = await p.rpc('academy_create_course', [{ title: 'Already linked file', category: 'IT', delivery_mode: 'live' }]);
const oldLesson = (await p.sql("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Lesson',0,'Training') returning id", [oldCourse.course_id, oldCourse.version_id])).rows[0].id;
await p.owner();
const oldAsset = (await p.sql("insert into course_materials(course_id,version_id,lesson_id,uploaded_by,filename,storage_path,mime_type,size_bytes,status) values($1,$2,$3,$4,'Existing.pdf',$5,'application/pdf',100,'ready') returning id", [oldCourse.course_id, oldCourse.version_id, oldLesson, p.ids.admin, `${oldCourse.course_id}/existing.pdf`])).rows[0].id;
await p.actor('trainer');
await p.sql('update course_lessons set attachments=$1 where id=$2', [JSON.stringify([{ asset_id: oldAsset, name: 'Existing.pdf', storage_path: `${oldCourse.course_id}/existing.pdf`, mime_type: 'application/pdf', size_bytes: 100 }]), oldLesson]);
await p.actor('admin');
assert.equal(await p.rpc('academy_can_review_version', [oldCourse.version_id]), true); checks++;
await p.owner();
await p.db.exec(readFileSync(new URL('../supabase/migrations/20260923114717_academy_material_review_independence.sql', import.meta.url), 'utf8'));
assert.equal((await p.sql('select 1 from academy_private.version_contributors where version_id=$1 and user_id=$2', [oldCourse.version_id, p.ids.admin])).rows.length, 1); checks++;
await p.actor('admin');
assert.equal(await p.rpc('academy_can_review_version', [oldCourse.version_id]), false); checks++;
await p.db.close();
console.log('PASS 3 preexisting linked-asset backfill assertions');
