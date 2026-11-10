// Wersja prosta, krok 2: postęp i czas trwania nagrania edycji, bez zaliczania lekcji.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const fixture = await createAcademyDatabase({ patrykCycle: true });
const { db, sql, ids, actor, owner, service, rpc, expectDenied } = fixture;
let checks = 0;
const eq = (a, b, label) => { assert.deepEqual(a, b, label); checks++; };
const canRead = async (who, asset, role) => { await actor(who, role); return (await sql('select public.academy_can_read_asset($1) r', [asset])).rows[0].r; };
const inCatalog = async (who, asset) => { await actor(who); return (await sql('select count(*)::int n from academy_material_catalog where id=$1', [asset])).rows[0].n; };
const readsObject = async (who, path) => { await actor(who); return (await sql("select count(*)::int n from storage.objects where bucket_id='academy-materials' and name=$1", [path])).rows[0].n; };
const apply = async file => { await owner(); await db.exec(fs.readFileSync(fileURLToPath(new URL(`../supabase/migrations/${file}`, import.meta.url)), 'utf8')); };

async function uploadRunMaterial(run, name) {
    await actor('trainer');
    const asset = await rpc('academy_reserve_run_material', [run, name, 'video/mp4', 100, 0]);
    await service();
    await sql("insert into storage.objects(bucket_id,name,version,owner,owner_id,metadata)values('academy-materials',$1,gen_random_uuid()::text,$2::uuid,$2::text,$3)", [asset.storage_path, ids.trainer, { size: 100, mimetype: 'video/mp4' }]);
    await actor('trainer'); await rpc('academy_finish_material_upload', [asset.id]);
    await service();
    const job = (await sql('select to_jsonb(scan) asset from academy_claim_material_scan() scan')).rows[0].asset;
    await rpc('academy_accept_material_scan', [asset.id, job.scan_started_at, 'a'.repeat(64), null]);
    return asset;
}

try {
    await actor('admin'); await rpc('academy_set_trainer', [ids.trainer, true]);
    await actor('trainer');
    const c = await rpc('academy_create_course', [{ title: 'Webinar', category: 'IT', delivery_mode: 'live', completion_rules: { quiz_required: false, require_all_lessons: false, attendance_percent: 80 } }]);
    await rpc('academy_submit_for_review', [c.course_id]);
    const token = (await sql('select submission_id from course_versions where id=$1', [c.version_id])).rows[0].submission_id;
    await actor('admin'); await rpc('academy_review_course', [c.version_id, true, null, token]);
    await actor('trainer');
    const run = await rpc('academy_create_run', [{ courseId: c.course_id, versionId: c.version_id, title: 'Edycja', capacity: 5 }]);
    await rpc('academy_save_session', [{ runId: run, title: 'Spotkanie', startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: 'https://teams.microsoft.com/meet/1', required: true }]);
    await actor('admin'); await rpc('academy_publish_run', [run]);
    await actor('student'); await rpc('academy_register_run', [run]);
    await owner(); await sql("update course_run_registrations set status='confirmed' where run_id=$1 and user_id=$2", [run, ids.student]);

    const recording = await uploadRunMaterial(run, 'Nagranie.mp4');
    const pending = await uploadRunMaterial(run, 'Szkic.mp4');
    await actor('admin'); await rpc('academy_review_run_material', [recording.id, 'approve', null]);

    await apply('20261109213000_academy_video_progress.sql');
    await apply('20261110190000_academy_prosta_postep_nagrania.sql');
    const save = 'select public.academy_save_recording_progress($1,$2,$3,$4::jsonb) r';
    const saved = async (who, asset, position, ranges) => { await actor(who); return (await sql(save, [asset, position, 600, JSON.stringify(ranges)])).rows[0].r; };
    const durations = async who => { await actor(who); return (await sql('select asset_id, duration_seconds::float d from public.academy_recording_durations($1::uuid[])', [[recording.id, pending.id]])).rows; };

    // Zapisany zapisuje i odczytuje swoją pozycję.
    eq((await saved('student', recording.id, 25, [[0, 25]])).accepted, true, 'zapis');
    await actor('student');
    eq(Number((await sql('select position_seconds from academy_video_progress where user_id=$1 and asset_id=$2', [ids.student, recording.id])).rows[0].position_seconds), 25, 'pozycja');
    eq(Number((await saved('student', recording.id, 40, [[25, 40]])).watched_percent), 6.7, 'procent');

    // Skok o kilka minut w jednym zapisie nie liczy się jako obejrzane.
    eq((await saved('student', recording.id, 590, [[40, 590]])).accepted, false, 'limit tempa');

    // Odmowy: bez dostępu do nagrania, niezatwierdzone, anon, złe zakresy, zapis bezpośredni.
    await actor('other'); await expectDenied(save, [recording.id, 1, 600, '[]'], /recording_not_available/); checks++;
    await actor('student'); await expectDenied(save, [pending.id, 1, 600, '[]'], /recording_not_available/); checks++;
    await actor('', 'anon'); await expectDenied(save, [recording.id, 1, 600, '[]']); checks++;
    await actor('student'); await expectDenied(save, [recording.id, 1, 600, '[[10,5]]'], /invalid_video_progress/); checks++;
    await actor('student'); await expectDenied(save, [recording.id, 1, 0, '[]'], /invalid_video_progress/); checks++;
    await actor('student'); await expectDenied('insert into academy_video_progress(user_id,asset_id,duration_seconds)values($1,$2,10)', [ids.student, recording.id]); checks++;

    // Czas trwania: tylko nagrania, które wywołujący może czytać.
    eq((await durations('student')).map(row => [row.asset_id, row.d]), [[recording.id, 600]], 'czas trwania');
    eq((await durations('other')).length, 0, 'czas trwania bez dostępu');

    // Po kroku 1 nagranie i postęp są dla każdego z dostępem.
    await apply('20261006080417_academy_tcm_full_editor.sql');
    await apply('20261109213300_academy_run_material_availability.sql');
    await apply('20261110180000_academy_prosta_nagranie_w_bibliotece.sql');
    eq((await saved('other', recording.id, 5, [[0, 5]])).accepted, true, 'po kroku 1');
    eq((await durations('other')).length, 1, 'czas trwania po kroku 1');

    // Cofnięcie usuwa funkcje.
    await owner(); await db.exec(fs.readFileSync(fileURLToPath(new URL('../supabase/rollbacks/20261110190000_academy_prosta_postep_nagrania.sql', import.meta.url)), 'utf8'));
    eq((await sql("select to_regprocedure('public.academy_save_recording_progress(uuid,numeric,numeric,jsonb)') is null x")).rows[0].x, true, 'cofnięcie');

    console.log(`Academy recording progress DB checks passed: ${checks}`);
} finally {
    await db.close();
}
