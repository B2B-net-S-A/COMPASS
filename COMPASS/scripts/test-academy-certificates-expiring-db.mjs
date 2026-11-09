// Przypomnienie o wygasającym certyfikacie: tylko osoby objęte rolloutem, bez kont zakończonych.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const f = await createAcademyDatabase({ rollout: true });
const { db, ids, sql, actor, owner, rpc, expectDenied, engine } = f;
const read = name => fs.readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
let checks = 0;
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };

const expiring = async () => {
    await actor('', 'service_role');
    return (await sql('select recipient from public.academy_certificates_expiring(30) order by 1')).rows.map(row => row.recipient);
};
const setRollout = async (mode, pilot = []) => {
    await owner();
    await sql('update public.academy_rollout_settings set mode=$1,pilot_user_ids=$2', [mode, pilot]);
};

try {
    await db.exec(`CREATE TABLE public.academy_learner_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email text NOT NULL UNIQUE,user_id uuid REFERENCES auth.users(id),ended_at timestamptz,access_until timestamptz);
        GRANT ALL ON public.academy_learner_accounts TO service_role;`);
    // Definicja sprzed poprawki, z migracji B5.1 (reszty tej migracji test nie potrzebuje).
    const original = read('migrations/20261110113000_academy_b5_1_certificate_validity.sql').match(/CREATE FUNCTION public\.academy_certificates_expiring[\s\S]*?\n\$\$;/)[0];
    await db.exec(`${original}\nREVOKE ALL ON FUNCTION public.academy_certificates_expiring(integer) FROM PUBLIC,anon,authenticated;\nGRANT EXECUTE ON FUNCTION public.academy_certificates_expiring(integer) TO service_role;`);

    const course = (await sql("insert into public.courses(author_id,title,slug,category,status) values($1,'Certyfikat','certyfikat','IT','published') returning id", [ids.admin])).rows[0].id;
    const version = (await sql("insert into public.course_versions(course_id,version_number,status,metadata,completion_rules) values($1,1,'published',$2,'{}') returning id", [course, JSON.stringify({ prerequisite_course_ids: [] })])).rows[0].id;
    const validUntil = new Date(Date.now() + 10 * 86400000).toISOString();
    for (const who of ['student', 'other', 'internal']) {
        const enrollment = (await sql('insert into public.course_enrollments(user_id,course_id,version_id) values($1,$2,$3) returning id', [ids[who], course, version])).rows[0].id;
        await sql('insert into public.course_completions(enrollment_id,user_id,course_id,version_id,completed_at,certificate_snapshot) values($1,$2,$3,$4,now(),$5)',
            [enrollment, ids[who], course, version, JSON.stringify({ course_title: 'Certyfikat', valid_until: validUntil })]);
    }

    // Odtworzenie ustalenia: przy zamkniętym rolloucie lista obejmuje wszystkich.
    await setRollout('closed');
    equal(await expiring(), ['internal@example.test', 'other@example.test', 'student@example.test'], 'stara definicja ignoruje rollout');

    await owner();
    await db.exec(read('migrations/20261110160100_academy_certificates_expiring_rollout.sql'));

    await setRollout('closed');
    equal(await expiring(), [], 'zamknięty rollout nie tworzy przypomnień');

    await setRollout('pilot', [ids.student]);
    equal(await expiring(), ['student@example.test'], 'pilot obejmuje tylko swoją listę');

    await setRollout('pilot', [ids.student, ids.other]);
    await owner();
    await sql("insert into public.academy_learner_accounts(email,user_id,ended_at) values('other@example.test',$1,now())", [ids.other]);
    equal(await expiring(), ['student@example.test'], 'konto nauki zakończone nie dostaje przypomnienia');

    await owner();
    await sql("insert into public.academy_learner_accounts(email,user_id,access_until) values('student@example.test',$1,now()-interval '1 minute')", [ids.student]);
    equal(await expiring(), [], 'konto nauki po terminie dostępu nie dostaje przypomnienia');

    await owner();
    await sql("update public.academy_learner_accounts set access_until=now()+interval '1 day' where user_id=$1", [ids.student]);
    equal(await expiring(), ['student@example.test'], 'konto nauki w terminie dostaje przypomnienie');

    await owner();
    await sql("update public.profiles set employment_status='exited' where id=$1", [ids.student]);
    equal(await expiring(), [], 'odejście z firmy dalej wyklucza');

    for (const role of ['authenticated', 'anon']) {
        await actor('admin', role);
        await expectDenied('select public.academy_certificates_expiring(30)', [], /permission denied/); checks++;
    }

    await owner();
    await db.exec(read('rollbacks/20261110160100_academy_certificates_expiring_rollout.sql'));
    equal(await expiring(), ['internal@example.test', 'other@example.test'], 'cofnięcie przywraca starą listę');

    console.log(`Academy certificates expiring: ${checks} checks (${engine})`);
} finally {
    await db.close();
}
