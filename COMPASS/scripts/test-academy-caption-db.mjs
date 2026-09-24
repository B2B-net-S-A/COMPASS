import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ runMaterials: true, materialProjection: true });
const { db, sql, ids, actor, owner, service, rpc } = fixture;
const migration = fileURLToPath(new URL('../supabase/migrations/20260924101350_academy_run_caption_association.sql', import.meta.url));
const rawReadRevoke = fileURLToPath(new URL('../supabase/migrations/20260924104028_academy_material_revoke_raw_read.sql', import.meta.url));
const captionGrantRepair = fileURLToPath(new URL('../supabase/migrations/20260924115540_academy_material_catalog_caption_grant.sql', import.meta.url));
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const denied = async (statement, params, reason) => {
  try { await sql(statement, params); assert.fail('Expected denial'); }
  catch (error) {
    if (error.code === 'ERR_ASSERTION') throw error;
    assert.match(error.message, reason); checks++;
  }
};

try {
  await db.exec(fs.readFileSync(migration, 'utf8'));
  // Production applied the raw-read revocation after the caption migration.
  await db.exec(fs.readFileSync(rawReadRevoke, 'utf8'));
  await actor('admin');
  await denied('select id from academy_material_catalog limit 1', [], /permission denied for table course_materials/);
  await owner();
  await db.exec(fs.readFileSync(captionGrantRepair, 'utf8'));
  await actor('admin');
  eq((await sql('select id from academy_material_catalog limit 1')).rows.length, 0);
  eq((await sql("select count(*)::int n from academy_material_catalog where status <> 'ready' and purged_at is null and cleanup_token is null and (scan_error is null or scan_error <> 'discarded_by_author')")).rows[0].n, 0);
  eq((await sql('select count(*)::int n from academy_material_catalog where purged_at is null and cleanup_token is not null')).rows[0].n, 0);
  await denied('select review_note,scan_error,cleanup_token from course_materials limit 1', [], /permission denied for table course_materials/);
  await actor('admin');
  await rpc('academy_set_trainer', [ids.trainer, true]);
  await actor('trainer');
  const course = await rpc('academy_create_course', [{ title: 'Captioned live run', category: 'IT', delivery_mode: 'live', completion_rules: { quiz_required: false, require_all_lessons: false, attendance_percent: 80 } }]);
  await rpc('academy_submit_for_review', [course.course_id]);
  await actor('admin');
  await rpc('academy_review_course', [course.version_id, true, null]);
  async function makeRun(title) {
    await actor('trainer');
    const run = await rpc('academy_create_run', [{ courseId: course.course_id, versionId: course.version_id, title, capacity: 2 }]);
    await rpc('academy_save_session', [{ runId: run, title: 'Spotkanie', startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: 'https://teams.microsoft.com/meet/123456789', required: true }]);
    await actor('admin');
    await rpc('academy_publish_run', [run]);
    return run;
  }
  const firstRun = await makeRun('First run');
  const secondRun = await makeRun('Second run');
  await actor('student');
  await rpc('academy_register_run', [firstRun]);
  await service();
  async function material(runId, filename, mimeType) {
    const { rows } = await sql(`insert into public.course_materials
      (course_id,version_id,run_id,uploaded_by,filename,storage_path,mime_type,size_bytes,status,review_status)
      values ($1,$2,$3,$4,$5,$6,$7,100,'ready','published') returning id`,
      [course.course_id, course.version_id, runId, ids.trainer, filename, `${runId}/${filename}`, mimeType]);
    return rows[0].id;
  }
  const video1 = await material(firstRun, 'video1.mp4', 'video/mp4');
  const video2 = await material(firstRun, 'video2.mp4', 'video/mp4');
  const otherRunVideo = await material(secondRun, 'other.mp4', 'video/mp4');
  const vtt1 = await material(firstRun, 'first.vtt', 'text/vtt');
  const vtt2 = await material(firstRun, 'second.vtt', 'text/vtt');
  const foreignVtt = await material(secondRun, 'foreign.vtt', 'text/vtt');

  await actor('student');
  await denied('select academy_set_run_caption($1,$2)', [vtt1, video1], /admin_required/);
  await actor('trainer');
  await denied('select academy_set_run_caption($1,$2)', [vtt1, video1], /admin_required/);
  await actor('admin');
  await denied('select academy_set_run_caption($1,$2)', [vtt1, otherRunVideo], /video_not_published_in_run/);
  await denied('select academy_set_run_caption($1,$2)', [video1, video2], /caption_run_required/);
  await rpc('academy_set_run_caption', [vtt1, video1]);
  await denied('select academy_set_run_caption($1,$2)', [vtt2, video1], /duplicate key/);
  await rpc('academy_set_run_caption', [vtt2, video2]);
  await actor('student');
  eq((await sql('select caption_for_asset_id from academy_material_catalog where id=$1', [vtt1])).rows[0].caption_for_asset_id, video1);
  eq((await sql('select caption_for_asset_id from academy_material_catalog where id=$1', [vtt2])).rows[0].caption_for_asset_id, video2);
  eq((await sql('select id from academy_material_catalog where id=$1', [foreignVtt])).rows.length, 0);
  await service();
  await denied('update course_materials set caption_for_asset_id=$1 where id=$2', [otherRunVideo, vtt1], /video_not_in_caption_run/);
  await actor('admin');
  await rpc('academy_set_run_caption', [vtt1, null]);
  eq((await sql('select caption_for_asset_id from academy_material_catalog where id=$1', [vtt1])).rows[0].caption_for_asset_id, null);
  await rpc('academy_set_run_caption', [vtt1, video1]);
  eq((await sql("select count(*)::int n from academy_audit_events where action='RUN_CAPTION_ASSIGNED'")).rows[0].n, 4);
  console.log(`PASS ${checks} caption association, isolation, authorization and audit assertions`);
} finally {
  if (fixture.engine === 'postgres') await db.close();
}
