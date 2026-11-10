// Wersja prosta, krok 1: zatwierdzone nagranie edycji widzi każdy z dostępem do Akademii, bez terminu.
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
    const rejected = await uploadRunMaterial(run, 'Odrzucone.mp4');
    await actor('admin');
    await rpc('academy_review_run_material', [recording.id, 'approve', null]);
    await rpc('academy_review_run_material', [rejected.id, 'reject', 'Słychać uczestników']);

    // Przed migracją: tylko zapisany.
    eq(await canRead('student', recording.id), true, 'zapisany przed');
    eq(await canRead('other', recording.id), false, 'niezapisany przed');

    await apply('20261006080417_academy_tcm_full_editor.sql');
    await apply('20261109213300_academy_run_material_availability.sql');
    await apply('20261110180000_academy_prosta_nagranie_w_bibliotece.sql');

    // Po migracji: każdy z dostępem, w katalogu i w Storage.
    eq(await canRead('other', recording.id), true, 'niezapisany po');
    eq(await canRead('student', recording.id), true, 'zapisany po');
    eq(await inCatalog('other', recording.id), 1, 'katalog');
    eq(await readsObject('other', recording.storage_path), 1, 'storage');
    await actor('', 'anon'); await expectDenied('select public.academy_can_read_asset($1)', [recording.id]); checks++;

    // Niezatwierdzone i odrzucone zostają u prowadzącego.
    eq(await canRead('other', pending.id), false, 'czeka na akceptację');
    eq(await canRead('student', pending.id), false, 'czeka na akceptację, zapisany');
    eq(await canRead('other', rejected.id), false, 'odrzucone');
    eq(await readsObject('other', pending.storage_path), 0, 'storage czekające');
    eq(await canRead('trainer', pending.id), true, 'prowadzący widzi czekające');

    // Bez terminu: upływ available_until niczego nie odbiera i nie kwalifikuje do usunięcia.
    await owner(); await sql("update course_materials set available_until=now()-interval '400 days' where id=$1", [recording.id]);
    eq(await canRead('other', recording.id), true, 'po terminie niezapisany');
    eq(await canRead('student', recording.id), true, 'po terminie zapisany');
    await owner();
    eq((await sql('select academy_private.material_cleanup_eligible(a,48,30) e from course_materials a where id=$1', [recording.id])).rows[0].e, false, 'sprzątanie');

    // Wycofane nagranie znika dla wszystkich poza prowadzącym.
    await actor('admin'); await rpc('academy_review_run_material', [recording.id, 'withdraw', 'Głos uczestnika w 12. minucie']);
    eq(await canRead('other', recording.id), false, 'wycofane, niezapisany');
    eq(await canRead('student', recording.id), false, 'wycofane, zapisany');
    eq(await canRead('trainer', recording.id), true, 'wycofane, prowadzący');

    // Kurs w archiwum: niezapisany traci dostęp, zapisany zostaje.
    const second = await uploadRunMaterial(run, 'Druga.mp4');
    await actor('admin'); await rpc('academy_review_run_material', [second.id, 'approve', null]);
    eq(await canRead('other', second.id), true, 'drugie nagranie');
    await owner(); await sql("update courses set status='archived' where id=$1", [c.course_id]);
    eq(await canRead('other', second.id), false, 'archiwum, niezapisany');
    eq(await canRead('student', second.id), true, 'archiwum, zapisany');
    await owner(); await sql("update courses set status='published' where id=$1", [c.course_id]);

    // Skrypt cofnięcia przywraca regułę „tylko zapisani”.
    await owner(); await db.exec(fs.readFileSync(fileURLToPath(new URL('../supabase/rollbacks/20261110180000_academy_prosta_nagranie_w_bibliotece.sql', import.meta.url)), 'utf8'));
    eq(await canRead('other', second.id), false, 'cofnięcie, niezapisany');
    eq(await canRead('student', second.id), true, 'cofnięcie, zapisany');
    await apply('20261110180000_academy_prosta_nagranie_w_bibliotece.sql');

    // Pilotaż: kto nie ma dostępu do Akademii, nie widzi nagrania.
    await actor('admin'); await rpc('academy_set_rollout', ['pilot', [ids.student]]);
    eq(await canRead('other', second.id), false, 'pilotaż bez dostępu');
    eq(await canRead('student', second.id), true, 'pilotaż z dostępem');

    console.log(`Academy recording library DB checks passed: ${checks}`);
} finally {
    await db.close();
}
