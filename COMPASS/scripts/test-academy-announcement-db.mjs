// Wersja prosta, krok 4: organizator publikuje zapowiedź szkolenia na żywo sam; nagranie nadal wymaga drugiej osoby.
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


try {
    // Kolejka produkcyjna: B3.10 (TCM publikuje edycje) jest przed tą migracją.
    for (const file of ['20261006080417_academy_tcm_full_editor.sql', '20261109130000_academy_review_signal.sql', '20261110150000_academy_b3_10_tcm_review.sql', '20261110210000_academy_prosta_zapowiedz_bez_drugiej_osoby.sql']) await apply(file);
    const tcm = '00000000-0000-0000-0000-0000000000a1';
    await owner();
    await sql("insert into auth.users(id,email,email_confirmed_at) values($1,'tcm@example.test',now())", [tcm]);
    await sql("insert into profiles(id,role,email,full_name) values($1,'talent_community','tcm@example.test','tcm')", [tcm]);
    await actor('admin'); await rpc('academy_set_trainer', [ids.trainer, true]);
    const publish = 'select public.academy_publish_announcement($1) v';
    const rules = { quiz_required: false, require_all_lessons: false, attendance_percent: 80 };

    // TCM zakłada webinar i publikuje zapowiedź sam, bez recenzji.
    await actor(tcm);
    const live = await rpc('academy_create_course', [{ title: 'Webinar DORA', category: 'Webinar', delivery_mode: 'live', completion_rules: rules }]);
    await actor('trainer'); await expectDenied(publish, [live.course_id], /organizer_required/); checks++;
    await actor('student'); await expectDenied(publish, [live.course_id], /organizer_required/); checks++;
    await actor('', 'anon'); await expectDenied(publish, [live.course_id]); checks++;
    await actor(tcm);
    eq((await sql(publish, [live.course_id])).rows[0].v, live.version_id, 'publikacja');
    await owner();
    const course = (await sql('select status, published_version_id, draft_version_id from courses where id=$1', [live.course_id])).rows[0];
    eq([course.status, course.published_version_id, course.draft_version_id], ['published', live.version_id, null], 'kurs opublikowany');
    eq((await sql("select count(*)::int n from academy_audit_events where action='ACADEMY_ANNOUNCEMENT_PUBLISHED' and course_id=$1", [live.course_id])).rows[0].n, 1, 'audyt');

    // Drugie wywołanie nic nie zmienia.
    await actor(tcm); eq((await sql(publish, [live.course_id])).rows[0].v, live.version_id, 'idempotentne');

    // Organizator sam zakłada termin i sam go publikuje (jest twórcą edycji); zapisy otwarte.
    const session = { title: 'Webinar', startsAt: new Date(Date.now() + 86400000).toISOString(), endsAt: new Date(Date.now() + 90000000).toISOString(), timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: 'https://teams.microsoft.com/meet/1', required: true };
    await actor(tcm);
    const run = await rpc('academy_create_run', [{ courseId: live.course_id, versionId: live.version_id, title: 'Webinar 18.11', capacity: 200 }]);
    await rpc('academy_save_session', [{ runId: run, ...session }]);
    await rpc('academy_publish_run', [run]);
    await owner(); eq((await sql('select status from course_runs where id=$1', [run])).rows[0].status, 'published', 'organizator publikuje własną edycję');
    await actor('student'); eq((await rpc('academy_register_run', [run])) !== null, true, 'zapis');

    // Szkolenie we własnym tempie nadal wymaga recenzji.
    await actor(tcm);
    const selfPaced = await rpc('academy_create_course', [{ title: 'Kurs DORA', category: 'IT', delivery_mode: 'self_paced', completion_rules: { ...rules, require_all_lessons: true } }]);
    await expectDenied(publish, [selfPaced.course_id], /live_course_required/); checks++;
    await expectDenied(publish, ['00000000-0000-0000-0000-00000000ffff'], /course_not_found/); checks++;

    // Kurs mieszany niesie lekcje i test: zapowiedź bez recenzji go nie publikuje, a jego edycja
    // nadal wymaga osoby spoza twórców.
    const blended = await rpc('academy_create_course', [{ title: 'Kurs mieszany', category: 'IT', delivery_mode: 'blended', completion_rules: { ...rules, require_all_lessons: true } }]);
    await expectDenied(publish, [blended.course_id], /live_course_required/); checks++;
    await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md,estimated_minutes)values($1,$2,'Lekcja',0,'Tekst',15)", [blended.course_id, blended.version_id]);
    await rpc('academy_submit_for_review', [blended.course_id]);
    const token = (await sql('select submission_id from course_versions where id=$1', [blended.version_id])).rows[0].submission_id;
    await actor('admin'); await rpc('academy_review_course', [blended.version_id, true, null, token]);
    await actor(tcm);
    const blendedRun = await rpc('academy_create_run', [{ courseId: blended.course_id, versionId: blended.version_id, title: 'Mieszany', capacity: 20 }]);
    await rpc('academy_save_session', [{ runId: blendedRun, ...session }]);
    await expectDenied('select public.academy_publish_run($1)', [blendedRun], /independent_admin_review_required/); checks++;

    // Poprawka opublikowanego webinaru to zmiana treści: idzie do recenzji, nie przez zapowiedź.
    await actor(tcm); await rpc('academy_begin_draft', [live.course_id]);
    await expectDenied(publish, [live.course_id], /announcement_draft_required/); checks++;

    // Archiwum nie wraca przez zapowiedź.
    const archived = await rpc('academy_create_course', [{ title: 'Stary webinar', category: 'Webinar', delivery_mode: 'live', completion_rules: rules }]);
    await owner(); await sql("update courses set status='archived' where id=$1", [archived.course_id]);
    await actor(tcm); await expectDenied(publish, [archived.course_id], /course_archived/); checks++;

    await owner(); await db.exec(fs.readFileSync(fileURLToPath(new URL('../supabase/rollbacks/20261110210000_academy_prosta_zapowiedz_bez_drugiej_osoby.sql', import.meta.url)), 'utf8'));
    eq((await sql("select to_regprocedure('public.academy_publish_announcement(uuid)') is null x")).rows[0].x, true, 'cofnięcie');
    eq((await sql("select pg_get_functiondef('academy_private.guard_run_review()'::regprocedure) like '%global_editor%' x")).rows[0].x, false, 'cofnięcie wyzwalacza');

    console.log(`Academy announcement DB checks passed: ${checks}`);
} finally {
    await db.close();
}
