// B3.10: TCM jako niezależny recenzent, na prawdziwych migracjach Akademii.
// Wyścig dwóch decyzji wymaga dwóch połączeń, więc biegnie tylko na Postgresie.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const f = await createAcademyDatabase({ patrykCycle: true });
const { db, ids, sql, actor, owner, rpc } = f;
let checks = 0;
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const denied = async (...args) => { await f.expectDenied(...args); checks++; };
const tcm = '00000000-0000-0000-0000-000000000010', tcmAuthor = '00000000-0000-0000-0000-000000000011',
    tcmCo = '00000000-0000-0000-0000-000000000012', tcmGone = '00000000-0000-0000-0000-000000000013',
    tcm2 = '00000000-0000-0000-0000-000000000014';
const future = hours => new Date(Date.now() + hours * 3600000).toISOString();
const dir = new URL('../supabase/migrations/', import.meta.url);
const apply = async suffix => {
    const names = fs.readdirSync(dir).filter(name => name.endsWith(suffix));
    assert.equal(names.length, 1, suffix);
    await owner();
    await db.exec(fs.readFileSync(new URL(names[0], dir), 'utf8'));
};
const QUIZ = Array.from({ length: 4 }, (_, n) => ({ question_text: `Pytanie ${n}`, order_index: n, options: Array.from({ length: 4 }, (_, i) => ({ option_text: 'Odp ' + i, is_correct: i === 0 })) }));
const REVIEW_COURSE = 'select academy_review_course($1,$2,$3,$4)';
const token = async version => (await sql('select submission_id from course_versions where id=$1', [version])).rows[0].submission_id;

async function submittedCourse(who, title) {
    await actor(who);
    const course = await rpc('academy_create_course', [{ title, category: 'IT', delivery_mode: 'live' }]);
    const lesson = (await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Moduł',0,'Treść') returning id", [course.course_id, course.version_id])).rows[0].id;
    await rpc('academy_replace_quiz', [course.course_id, QUIZ]);
    await rpc('academy_submit_for_review', [course.course_id]);
    return { ...course, lesson, token: await token(course.version_id) };
}

try {
    // Migracja nie może ruszyć na bazie bez B0.8: warunek kolejności ma być głośny.
    await apply('_academy_tcm_full_editor.sql');
    const b310 = fs.readFileSync(new URL(fs.readdirSync(dir).find(n => n.endsWith('_academy_b3_10_tcm_review.sql')), dir), 'utf8');
    await owner();
    await assert.rejects(() => db.exec(b310), /b3_10_wymaga_B0_8/);
    checks++;
    await db.exec('ROLLBACK').catch(() => {});
    await apply('_academy_review_signal.sql');
    await apply('_academy_b3_10_tcm_review.sql');

    await owner();
    for (const [id, name] of [[tcm, 'tcm'], [tcmAuthor, 'tcmauthor'], [tcmCo, 'tcmco'], [tcmGone, 'tcmgone'], [tcm2, 'tcm2']]) {
        await sql('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [id, `${name}@example.test`]);
        await sql("insert into profiles(id,role,email,full_name) values($1,'talent_community',$2,$3)", [id, `${name}@example.test`, name]);
    }
    await actor('admin');
    await rpc('academy_set_trainer', [ids.trainer, true]);
    await rpc('academy_set_rollout', ['open', []]);

    await actor(tcm);
    equal(await rpc('academy_is_reviewer'), true, 'aktywny TCM jest recenzentem');
    equal(await rpc('is_admin'), false, 'TCM nie staje się adminem');
    await actor('admin');
    equal(await rpc('academy_is_reviewer'), true, 'admin nadal jest recenzentem');
    for (const who of ['trainer', 'student', 'other']) {
        await actor(who);
        equal(await rpc('academy_is_reviewer'), false, `${who} nie jest recenzentem`);
    }
    await owner();
    await sql("update profiles set employment_status='exited' where id=$1", [tcmGone]);
    await actor(tcmGone);
    equal(await rpc('academy_is_reviewer'), false, 'TCM po odejściu nie recenzuje');

    // Sygnał w dzwonku: TCM dostaje wezwanie, a autor i odchodzący nie.
    const foreign = await submittedCourse('trainer', 'Kurs trenera');
    await owner();
    const bell = async user => (await sql("select count(*)::int n from notifications where user_id=$1 and action_url='/admin/learning' and title_pl like 'Szkolenie czeka%'", [user])).rows[0].n;
    equal(await bell(tcm), 1, 'TCM dostaje sygnał o zgłoszeniu');
    equal(await bell(ids.admin), 1, 'admin nadal dostaje sygnał');
    equal(await bell(tcmGone), 0, 'odchodzący TCM nie dostaje sygnału');
    equal(await bell(ids.trainer), 0, 'autor nie dostaje wezwania');

    // Kolejka czytana tak jak w panelu, z konta TCM.
    await actor(tcm);
    const pending = await sql("select v.id from course_versions v join courses c on c.id=v.course_id where v.status='pending_review' and c.status<>'archived'");
    assert.ok(pending.rows.some(row => row.id === foreign.version_id));
    checks++;
    equal((await sql('select id from courses where id=$1', [foreign.course_id])).rows.length, 1);

    // TCM zatwierdza cudzy kurs; token zostaje częścią decyzji.
    equal(await rpc('academy_can_review_version', [foreign.version_id]), true);
    await denied(REVIEW_COURSE, [foreign.version_id, true, null, null], /review_submission_changed/);
    await denied(REVIEW_COURSE, [foreign.version_id, true, null, '00000000-0000-4000-8000-000000000999'], /review_submission_changed/);
    await rpc('academy_review_course', [foreign.version_id, true, null, foreign.token]);
    await owner();
    const reviewed = (await sql('select status,reviewed_by from course_versions where id=$1', [foreign.version_id])).rows[0];
    equal(reviewed, { status: 'published', reviewed_by: tcm }, 'TCM zatwierdził cudzy kurs');
    equal((await sql("select count(*)::int n from academy_audit_events where action='COURSE_REVIEW_DECIDED' and actor_id=$1 and details->>'submission_id'=$2", [tcm, foreign.token])).rows[0].n, 1, 'decyzja TCM jest w audycie');

    // TCM-autor dostaje odmowę, a drugi TCM może zatwierdzić.
    const own = await submittedCourse(tcmAuthor, 'Kurs TCM');
    await actor(tcmAuthor);
    equal(await rpc('academy_can_review_version', [own.version_id]), false, 'TCM-autor nie jest recenzentem własnej wersji');
    await denied(REVIEW_COURSE, [own.version_id, true, null, own.token], /independent/);
    await denied(REVIEW_COURSE, [own.version_id, false, 'Odrzucam własne', own.token], /independent/);
    await owner();
    equal((await sql("select count(*)::int n from notifications where user_id=$1 and body_pl='Kurs TCM'", [tcmAuthor])).rows[0].n, 0, 'TCM-autor nie dostaje wezwania do własnej wersji');
    equal((await sql("select count(*)::int n from notifications where user_id=$1 and body_pl='Kurs TCM'", [tcm])).rows[0].n, 1, 'inny TCM dostaje wezwanie do tej wersji');
    equal((await sql('select status from course_versions where id=$1', [own.version_id])).rows[0].status, 'pending_review');
    await actor(tcm);
    await rpc('academy_review_course', [own.version_id, true, null, own.token]);
    checks++;

    // Autor kursu odpada także wtedy, gdy kolejną wersję przygotował ktoś inny.
    await actor(tcm2);
    const nextOwn = await rpc('academy_begin_draft', [own.course_id]);
    await rpc('academy_submit_for_review', [own.course_id]);
    const nextToken = await token(nextOwn);
    await actor(tcmAuthor);
    equal(await rpc('academy_can_review_version', [nextOwn]), false, 'autor kursu nie recenzuje cudzej wersji własnego kursu');
    await denied(REVIEW_COURSE, [nextOwn, true, null, nextToken], /independent/);
    await actor(tcm);
    await rpc('academy_review_course', [nextOwn, true, null, nextToken]);
    checks++;

    // TCM-współtwórca: prawdziwa edycja przez RPC zapisuje go jako współtwórcę.
    await actor('trainer');
    const co = await rpc('academy_create_course', [{ title: 'Współtworzony', category: 'IT', delivery_mode: 'self_paced' }]);
    const coLesson = (await sql("insert into course_lessons(course_id,version_id,title,order_index,content_md) values($1,$2,'Moduł',0,'Treść') returning id", [co.course_id, co.version_id])).rows[0].id;
    await rpc('academy_replace_quiz', [co.course_id, QUIZ]);
    await actor(tcmCo);
    await sql('update course_lessons set title=$1 where id=$2', ['Poprawione przez TCM', coLesson]);
    await actor('trainer');
    await rpc('academy_submit_for_review', [co.course_id]);
    const coToken = await token(co.version_id);
    await actor(tcmCo);
    equal(await rpc('academy_can_review_version', [co.version_id]), false, 'TCM-współtwórca nie jest niezależny');
    await denied(REVIEW_COURSE, [co.version_id, true, null, coToken], /independent/);

    // Zwykłe role dostają odmowę z komunikatem recenzenta.
    for (const who of ['trainer', 'student']) {
        await actor(who);
        await denied(REVIEW_COURSE, [co.version_id, true, null, coToken], /reviewer_required/);
    }
    await actor(tcmGone);
    await denied(REVIEW_COURSE, [co.version_id, true, null, coToken], /reviewer_required/);

    // Przegląd kursu sprzed wersjonowania idzie tą samą regułą niezależności.
    await owner();
    await sql('update courses set legacy_review_required=true where id=$1', [foreign.course_id]);
    await actor('trainer');
    await denied('select academy_review_legacy_course($1,true,null,$2)', [foreign.course_id, foreign.version_id], /independent/);
    await actor(tcm);
    await rpc('academy_review_legacy_course', [foreign.course_id, true, null, foreign.version_id]);
    await owner();
    equal((await sql('select legacy_review_required from courses where id=$1', [foreign.course_id])).rows[0].legacy_review_required, false, 'TCM rozstrzyga przegląd starego kursu');
    await sql('update courses set legacy_review_required=true where id=$1', [own.course_id]);
    await actor(tcmAuthor);
    await denied('select academy_review_legacy_course($1,true,null,$2)', [own.course_id, own.version_id], /independent/);
    await owner();
    await sql('update courses set legacy_review_required=false where id=$1', [own.course_id]);

    // Edycja: cudza publikowana przez TCM, autorska i współtworzona z odmową.
    const editionFor = async (who, course, version, title) => {
        await actor(who);
        const run = await rpc('academy_create_run', [{ courseId: course, versionId: version, title, capacity: 20 }]);
        await rpc('academy_save_session', [{ runId: run, title: 'Spotkanie', startsAt: future(24), endsAt: future(26), timeZone: 'Europe/Warsaw', mode: 'external_link', externalJoinUrl: 'https://teams.microsoft.com/meet/123456789', required: true }]);
        return run;
    };
    const run = await editionFor('trainer', foreign.course_id, foreign.version_id, 'Edycja trenera');
    await actor(tcm);
    equal(await rpc('academy_can_review_run', [run]), true);
    await rpc('academy_publish_run', [run]);
    await owner();
    equal((await sql('select status,published_by from course_runs where id=$1', [run])).rows[0], { status: 'published', published_by: tcm }, 'TCM opublikował cudzą edycję');

    const ownRun = await editionFor(tcmAuthor, own.course_id, own.version_id, 'Edycja autora TCM');
    await actor(tcmAuthor);
    equal(await rpc('academy_can_review_run', [ownRun]), false, 'TCM-autor nie publikuje własnej edycji');
    await denied('select academy_publish_run($1)', [ownRun], /independent/);

    const coRun = await editionFor('trainer', foreign.course_id, foreign.version_id, 'Edycja współtworzona');
    await actor(tcmCo);
    await rpc('academy_update_run', [coRun, 'Poprawiona przez TCM', 20]);
    equal(await rpc('academy_can_review_run', [coRun]), false, 'TCM-współtwórca edycji nie jest niezależny');
    await denied('select academy_publish_run($1)', [coRun], /independent/);

    await actor('student');
    await denied('select academy_publish_run($1)', [coRun], /reviewer_required/);

    // Materiał edycji: TCM zatwierdza cudzy, odmowa dla osoby wgrywającej i dla autora kursu.
    const material = async (runId, uploader, name) => {
        await owner();
        const course = (await sql('select course_id,version_id from course_runs where id=$1', [runId])).rows[0];
        return (await sql("insert into course_materials(course_id,version_id,run_id,uploaded_by,filename,storage_path,mime_type,size_bytes,status,review_status) values($1,$2,$3,$4,$5,$6,'application/pdf',100,'ready','pending_review') returning id", [course.course_id, course.version_id, runId, uploader, name, `${course.course_id}/${name}`])).rows[0].id;
    };
    const REVIEW_MATERIAL = 'select academy_review_run_material($1,$2,$3)';
    const fromTrainer = await material(run, ids.trainer, 'trainer.pdf');
    await actor(tcm);
    const queue = await sql("select id from academy_material_catalog where run_id is not null and status='ready' and review_status='pending_review'");
    assert.ok(queue.rows.some(row => row.id === fromTrainer), 'TCM widzi materiał w kolejce');
    checks++;
    await rpc('academy_review_run_material', [fromTrainer, 'approve', null]);
    await owner();
    equal((await sql('select review_status,reviewed_by from course_materials where id=$1', [fromTrainer])).rows[0], { review_status: 'published', reviewed_by: tcm }, 'TCM zatwierdził materiał');

    const ownUpload = await material(run, tcm, 'tcm.pdf');
    await actor(tcm);
    await denied(REVIEW_MATERIAL, [ownUpload, 'approve', null], /inna osoba/);

    await actor(tcm);
    await rpc('academy_publish_run', [ownRun]);
    checks++;
    const authorsRunFile = await material(ownRun, ids.trainer, 'autor.pdf');
    await actor(tcmAuthor);
    await denied(REVIEW_MATERIAL, [authorsRunFile, 'approve', null], /independent/);
    await actor('admin');
    await rpc('academy_review_run_material', [authorsRunFile, 'approve', null]);
    checks++;

    await actor('student');
    await denied(REVIEW_MATERIAL, [ownUpload, 'approve', null], /reviewer_required/);

    // Pakiet: TCM zwraca cudzy, odmowa dla współtwórcy i zwykłej roli.
    await owner();
    const handover = (await sql("insert into academy_handovers(course_id,version_id,status,contributors,submitted_by,submitted_at) values($1,$2,'submitted',$3,$4,now()) returning id", [foreign.course_id, foreign.version_id, [ids.trainer, tcmCo], ids.trainer])).rows[0].id;
    await actor(tcmCo);
    await denied('select academy_review_handover($1,false,$2)', [handover, 'Do poprawy'], /independent/);
    await actor('student');
    await denied('select academy_review_handover($1,false,$2)', [handover, 'Do poprawy'], /reviewer_required/);
    await actor(tcm);
    await rpc('academy_review_handover', [handover, false, 'Do poprawy']);
    await owner();
    equal((await sql('select status,reviewed_by from academy_handovers where id=$1', [handover])).rows[0], { status: 'rejected', reviewed_by: tcm }, 'TCM rozstrzygnął pakiet');

    // Reszta uprawnień admina zostaje poza zasięgiem TCM.
    await actor(tcm);
    await denied('select academy_archive_course($1)', [foreign.course_id], /admin_required/);
    await denied('select academy_set_rollout($1,$2)', ['closed', []], /admin_required/);
    await denied('select academy_set_trainer($1,true)', [ids.other], /admin_required/);
    await denied('select academy_revoke_completion($1,$2)', [tcm, 'Brak uprawnień'], /admin_required/);
    await denied('select academy_private.reviewer_eligible($1)', [tcm]);

    if (f.engine === 'postgres') {
        // Dwie decyzje na ten sam token: druga czeka na blokadę i nie nadpisuje pierwszej.
        const race = await submittedCourse('trainer', 'Wyścig');
        const first = await f.connectSession(tcm), second = await f.connectSession(tcm2);
        try {
            await first.db.exec('BEGIN');
            await first.sql(REVIEW_COURSE, [race.version_id, true, null, race.token]);
            await second.db.exec('BEGIN');
            let completed = false;
            const late = second.sql(REVIEW_COURSE, [race.version_id, false, 'Spóźnione odrzucenie', race.token])
                .then(result => ({ result }), error => ({ error })).finally(() => { completed = true; });
            await new Promise(resolve => setTimeout(resolve, 100));
            equal(completed, false, 'druga decyzja czeka na blokadę kursu');
            await first.db.exec('COMMIT');
            const outcome = await late;
            assert.match(outcome.error?.message ?? '', /pending_review_required/);
            checks++;
            await second.db.exec('ROLLBACK');
        } finally { await first.db.close(); await second.db.close(); }
        await owner();
        equal((await sql('select status,reviewed_by,rejection_reason from course_versions where id=$1', [race.version_id])).rows[0], { status: 'published', reviewed_by: tcm, rejection_reason: null }, 'wygrywa pierwsza decyzja');

        // Nieaktualny podgląd po wycofaniu i ponownym zgłoszeniu.
        const again = await submittedCourse('trainer', 'Ponowne zgłoszenie');
        await actor('trainer');
        await rpc('academy_withdraw_submission', [again.course_id, again.token]);
        await rpc('academy_submit_for_review', [again.course_id]);
        const fresh = await token(again.version_id);
        assert.notEqual(fresh, again.token);
        checks++;
        await actor(tcm);
        await denied(REVIEW_COURSE, [again.version_id, true, null, again.token], /review_submission_changed/);
        await owner();
        equal((await sql('select status from course_versions where id=$1', [again.version_id])).rows[0].status, 'pending_review', 'stary token niczego nie zmienił');
        await actor(tcm);
        await rpc('academy_review_course', [again.version_id, true, null, fresh]);
        checks++;
    }

    // Cofnięcie zwraca akceptację adminowi, a akceptacja TCM znów nie przechodzi.
    await owner();
    await db.exec(fs.readFileSync(new URL('../supabase/rollbacks/20261110150000_academy_b3_10_tcm_review.sql', import.meta.url), 'utf8'));
    const afterRollback = await submittedCourse('trainer', 'Po cofnięciu');
    await actor(tcm);
    equal(await rpc('academy_can_review_version', [afterRollback.version_id]), false, 'po cofnięciu TCM nie recenzuje');
    await denied(REVIEW_COURSE, [afterRollback.version_id, true, null, afterRollback.token], /admin_required/);
    await actor('admin');
    await rpc('academy_review_course', [afterRollback.version_id, true, null, afterRollback.token]);
    checks++;

    console.log(`PASS ${checks} asercji B3.10 (${f.engine}); TCM recenzuje niezależnie, reszta uprawnień admina bez zmian`);
} catch (error) {
    console.error({ error: error.message, where: error.where, stack: error.stack });
    process.exitCode = 1;
} finally { await db.close(); }
