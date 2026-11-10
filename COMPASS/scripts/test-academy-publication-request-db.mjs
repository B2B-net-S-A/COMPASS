// Wersja prosta, krok 3: „Wyślij do publikacji” = zgoda trenera + dzwonek dla recenzentów; liczba oglądających.
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

    await apply('20261006080417_academy_tcm_full_editor.sql');
    await apply('20261109130000_academy_review_signal.sql');
    await apply('20261110150000_academy_b3_10_tcm_review.sql');
    await apply('20261109213000_academy_video_progress.sql');
    await apply('20261110200000_academy_prosta_wyslij_do_publikacji.sql');
    const send = 'select public.academy_request_run_publication($1,$2) r';
    const bells = async () => { await owner(); return (await sql("select user_id from notifications where title_pl='Nagranie czeka na akceptację' order by user_id")).rows.map(row => row.user_id); };

    // Bez materiału czekającego na akceptację nie ma czego wysłać.
    await actor('trainer'); await expectDenied(send, [run, true], /nothing_to_publish/); checks++;
    const recording = await uploadRunMaterial(run, 'Nagranie.mp4');

    // Odmowy: bez zgody, uczestnik, obcy, anon.
    await actor('trainer'); await expectDenied(send, [run, false], /trainer_consent_required/); checks++;
    await actor('trainer'); await expectDenied(send, [run, null], /trainer_consent_required/); checks++;
    await actor('student'); await expectDenied(send, [run, true], /run_manager_required/); checks++;
    await actor('other'); await expectDenied(send, [run, true], /run_manager_required/); checks++;
    await actor('', 'anon'); await expectDenied(send, [run, true]); checks++;
    await actor('trainer'); await expectDenied('insert into academy_run_publication_requests(run_id,requested_by,trainer_consent)values($1,$2,true)', [run, ids.trainer]); checks++;

    // Prowadzący wysyła: zgoda zapisana, dzwonek u recenzentów (admin), nie u autora prośby.
    await actor('trainer'); await sql(send, [run, true]);
    await owner();
    const request = (await sql('select requested_by, trainer_consent from academy_run_publication_requests where run_id=$1', [run])).rows[0];
    eq([request.requested_by, request.trainer_consent], [ids.trainer, true], 'zgoda');
    eq(await bells(), [ids.admin], 'dzwonek');
    eq((await sql("select count(*)::int n from academy_audit_events where action='ACADEMY_RUN_PUBLICATION_REQUESTED'")).rows[0].n, 1, 'audyt');

    // Prośbę widzi prowadzący i recenzent, uczestnik nie.
    await actor('trainer'); eq((await sql('select count(*)::int n from academy_run_publication_requests')).rows[0].n, 1, 'prowadzący widzi');
    await actor('admin'); eq((await sql('select count(*)::int n from academy_run_publication_requests')).rows[0].n, 1, 'recenzent widzi');
    await actor('student'); eq((await sql('select count(*)::int n from academy_run_publication_requests')).rows[0].n, 0, 'uczestnik nie widzi');

    // Ponowne wysłanie odświeża datę, nie dubluje wiersza.
    const second = await uploadRunMaterial(run, 'Slajdy.mp4');
    await actor('trainer'); await sql(send, [run, true]);
    await owner(); eq((await sql('select count(*)::int n from academy_run_publication_requests')).rows[0].n, 1, 'jeden wiersz');

    // Liczba oglądających: tylko dla prowadzącego, bez osób.
    await owner();
    await sql("insert into academy_video_progress(user_id,asset_id,position_seconds,duration_seconds)values($1,$2,10,600),($3,$2,20,600)", [ids.student, recording.id, ids.other]);
    await actor('trainer');
    const viewers = Object.fromEntries((await sql('select asset_id, viewers from public.academy_run_recording_viewers($1)', [run])).rows.map(row => [row.asset_id, row.viewers]));
    eq([viewers[recording.id], viewers[second.id]], [2, 0], 'oglądający');
    await actor('student'); eq((await sql('select count(*)::int n from public.academy_run_recording_viewers($1)', [run])).rows[0].n, 0, 'uczestnik bez liczb');

    await owner(); await db.exec(fs.readFileSync(fileURLToPath(new URL('../supabase/rollbacks/20261110200000_academy_prosta_wyslij_do_publikacji.sql', import.meta.url)), 'utf8'));
    eq((await sql("select to_regclass('public.academy_run_publication_requests') is null x")).rows[0].x, true, 'cofnięcie');

    console.log(`Academy publication request DB checks passed: ${checks}`);
} finally {
    await db.close();
}
