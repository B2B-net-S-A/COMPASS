// B4.6 / G45: nagranie edycji tylko dla zapisanych, po terminie niedostępne, poza biblioteką.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ patrykCycle: true });
const { db, sql, ids, actor, owner, service, rpc, expectDenied } = fixture;
let checks = 0;
const eq = (a, b) => { assert.deepEqual(a, b); checks++; };
const denied = async (...args) => { await expectDenied(...args); checks++; };
const canRead = async (who, asset) => { await actor(who); return rpc('academy_can_read_asset', [asset]); };
const setUntil = 'select public.academy_set_run_material_availability($1,$2::timestamptz) r';
const future = new Date(Date.now() + 7 * 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

try {
    await actor('admin'); await rpc('academy_set_trainer', [ids.trainer, true]);
    await actor('trainer');
    const c = await rpc('academy_create_course', [{ title: 'Recording', category: 'IT', delivery_mode: 'live', completion_rules: { quiz_required: false, require_all_lessons: false, attendance_percent: 80 } }]);
    await rpc('academy_submit_for_review', [c.course_id]);
    const token = (await sql('select submission_id from course_versions where id=$1', [c.version_id])).rows[0].submission_id;
    await actor('admin'); await rpc('academy_review_course', [c.version_id, true, null, token]);
    await actor('trainer');
    const run = await rpc('academy_create_run', [{ courseId: c.course_id, versionId: c.version_id, title: 'Edycja', capacity: 5 }]);
    await rpc('academy_save_session', [{ runId: run, title: 'Spotkanie', startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: 'https://teams.microsoft.com/meet/1', required: true }]);
    await actor('admin'); await rpc('academy_publish_run', [run]);
    await actor('student'); await rpc('academy_register_run', [run]);
    await owner();
    await sql("update course_run_registrations set status='confirmed' where run_id=$1 and user_id=$2", [run, ids.student]);

    await actor('trainer');
    const asset = await rpc('academy_reserve_run_material', [run, 'Nagranie.mp4', 'video/mp4', 100, 0]);
    await service();
    await sql("insert into storage.objects(bucket_id,name,version,owner,owner_id,metadata)values('academy-materials',$1,gen_random_uuid()::text,$2::uuid,$2::text,$3)", [asset.storage_path, ids.trainer, { size: 100, mimetype: 'video/mp4' }]);
    await actor('trainer'); await rpc('academy_finish_material_upload', [asset.id]);
    await service();
    const job = (await sql('select to_jsonb(scan) asset from academy_claim_material_scan() scan')).rows[0].asset;
    await rpc('academy_accept_material_scan', [asset.id, job.scan_started_at, 'a'.repeat(64), null]);
    await actor('admin'); await rpc('academy_review_run_material', [asset.id, 'approve', null]);

    // Without a term it behaves as before; only the confirmed participant reads it.
    eq(await canRead('student', asset.id), true);
    eq(await canRead('other', asset.id), false);

    // Applying the migration keeps that behaviour until a term is set.
    await owner();
    for (const file of ['20261006080417_academy_tcm_full_editor.sql', '20261109213300_academy_run_material_availability.sql']) await db.exec(fs.readFileSync(fileURLToPath(new URL(`../supabase/migrations/${file}`, import.meta.url)), 'utf8'));
    eq(await canRead('student', asset.id), true);
    eq(await canRead('other', asset.id), false);

    // Who may set the term.
    await actor('student'); await denied(setUntil, [asset.id, future], /run_manager_required/);
    await actor('other'); await denied(setUntil, [asset.id, future], /run_manager_required/);
    await actor('', 'anon'); await denied(setUntil, [asset.id, future]);

    // Future term: still readable. Past term: gone for the learner, kept for the organizer.
    await actor('trainer'); await sql(setUntil, [asset.id, future]);
    eq(await canRead('student', asset.id), true);
    eq((await sql('select available_until is not null x from academy_material_catalog where id=$1', [asset.id])).rows[0].x, true);
    await actor('trainer'); await sql(setUntil, [asset.id, past]);
    eq(await canRead('student', asset.id), false);
    eq((await sql('select id from academy_material_catalog where id=$1', [asset.id])).rows.length, 0);
    eq(await canRead('trainer', asset.id), true);

    // Clearing the term restores access.
    await actor('trainer'); await sql(setUntil, [asset.id, null]);
    eq(await canRead('student', asset.id), true);

    // A lesson material cannot carry a term, and a run recording is never a lesson attachment.
    await owner();
    eq((await sql("select pg_get_constraintdef(oid) d from pg_constraint where conname='academy_available_until_run_only'")).rows[0].d.includes('run_id IS NOT NULL'), true);
    eq((await sql("select count(*)::int n from course_lessons where attachments @> jsonb_build_array(jsonb_build_object('asset_id',$1::text))", [asset.id])).rows[0].n, 0);

    // Cleanup: expired beyond retention is eligible, recently expired and open-ended are not.
    await owner();
    const eligible = async () => (await sql('select academy_private.material_cleanup_eligible(a,48,30) e from course_materials a where id=$1', [asset.id])).rows[0].e;
    await sql('update course_materials set available_until=now()-interval $$5 days$$ where id=$1', [asset.id]);
    eq(await eligible(), false);
    await sql('update course_materials set available_until=now()-interval $$31 days$$ where id=$1', [asset.id]);
    eq(await eligible(), true);
    await sql('update course_materials set available_until=null where id=$1', [asset.id]);
    eq(await eligible(), false);

    console.log(`Academy run material availability DB checks passed: ${checks}`);
} finally {
    await db.close();
}
