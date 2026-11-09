// Przejęcie konta założonego zwykłą rejestracją na adres z listy kont nauki.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAcademyDatabase } from './lib/academy-db-fixture.mjs';

const f = await createAcademyDatabase();
const { db, sql, actor, owner, rpc, expectDenied, engine } = f;
const read = name => fs.readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
let checks = 0;
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
const uid = n => `00000000-0000-4000-8000-0000000002${String(n).padStart(2, '0')}`;
const aid = n => `00000000-0000-4000-8000-0000000003${String(n).padStart(2, '0')}`;

async function signup(n, email, patch = {}) {
    await owner();
    const row = { encrypted_password: 'hash-atakujacego', raw_user_meta_data: JSON.stringify({ full_name: 'Podstawiony' }), confirmation_token: 'token', last_sign_in_at: null, is_sso_user: false, ...patch };
    await sql('insert into auth.users(id,email,encrypted_password,raw_user_meta_data,confirmation_token,last_sign_in_at,is_sso_user) values($1,$2,$3,$4,$5,$6,$7)',
        [uid(n), email, row.encrypted_password, row.raw_user_meta_data, row.confirmation_token, row.last_sign_in_at, row.is_sso_user]);
    await sql("insert into public.profiles(id,role,email,full_name,avatar_url) values($1,$2,$3,'Podstawiony','https://zly.test/a.png')", [uid(n), patch.role ?? 'consultant', email]);
}
async function listed(n, email, patch = {}) {
    await owner();
    await sql('insert into public.academy_learner_accounts(id,email,full_name,ended_at,access_until,user_id) values($1,$2,$3,$4,$5,$6)',
        [aid(n), email, 'Z listy', patch.ended_at ?? null, patch.access_until ?? null, patch.user_id ?? null]);
}
const adopt = async n => { await actor('', 'service_role'); return rpc('academy_adopt_learner_user', [aid(n)]); };
const snapshot = async n => {
    await owner();
    const user = (await sql('select encrypted_password,email_confirmed_at is not null confirmed,confirmation_token,raw_app_meta_data,raw_user_meta_data from auth.users where id=$1', [uid(n)])).rows[0];
    const profile = (await sql('select academy_only,full_name,avatar_url from public.profiles where id=$1', [uid(n)])).rows[0];
    const account = (await sql('select user_id from public.academy_learner_accounts where id=$1', [aid(n)])).rows[0];
    return { user, profile, account };
};

try {
    await db.exec(`ALTER TABLE auth.users
            ADD COLUMN encrypted_password text, ADD COLUMN confirmation_token text, ADD COLUMN confirmation_sent_at timestamptz,
            ADD COLUMN recovery_token text, ADD COLUMN recovery_sent_at timestamptz, ADD COLUMN email_change text,
            ADD COLUMN email_change_token_new text, ADD COLUMN email_change_token_current text, ADD COLUMN email_change_sent_at timestamptz,
            ADD COLUMN reauthentication_token text, ADD COLUMN reauthentication_sent_at timestamptz,
            ADD COLUMN raw_app_meta_data jsonb, ADD COLUMN raw_user_meta_data jsonb, ADD COLUMN last_sign_in_at timestamptz,
            ADD COLUMN is_sso_user boolean NOT NULL DEFAULT false, ADD COLUMN deleted_at timestamptz, ADD COLUMN updated_at timestamptz;
        CREATE TABLE auth.identities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL,provider text NOT NULL);
        ALTER TABLE public.profiles ADD COLUMN academy_only boolean NOT NULL DEFAULT false;
        CREATE TABLE public.academy_learner_accounts(id uuid PRIMARY KEY,email text NOT NULL UNIQUE,full_name text,ended_at timestamptz,access_until timestamptz,user_id uuid UNIQUE REFERENCES auth.users(id));
        GRANT ALL ON public.academy_learner_accounts TO service_role;`);
    await db.exec(read('migrations/20261110160200_academy_adopt_learner_user.sql'));

    // Rejestracja podstawiona, nikt się nie logował: konto przejęte i oczyszczone.
    await signup(1, 'ofiara@example.test'); await listed(1, 'ofiara@example.test');
    equal(await adopt(1), uid(1));
    const adopted = await snapshot(1);
    equal(adopted.user.encrypted_password, null, 'hasło rejestrującego przepada');
    equal(adopted.user.confirmed, true);
    equal(adopted.user.confirmation_token, '', 'token pusty, nie NULL');
    equal(adopted.user.raw_app_meta_data.academy_only, true, 'znacznik jako wartość logiczna');
    equal(adopted.user.raw_user_meta_data, { full_name: 'Z listy' }, 'imię z listy, nie z rejestracji');
    equal(adopted.profile, { academy_only: true, full_name: 'Z listy', avatar_url: null });
    equal(adopted.account.user_id, uid(1));

    // Odmowa: konto, które już się logowało, zostaje nietknięte.
    await signup(2, 'uzywane@example.test', { last_sign_in_at: new Date().toISOString() }); await listed(2, 'uzywane@example.test');
    const before = await snapshot(2);
    equal(await adopt(2), null, 'konto po logowaniu nie jest przejmowane');
    equal(await snapshot(2), before, 'odmowa niczego nie zmienia');

    // Pozostałe odmowy.
    await signup(3, 'koniec@example.test'); await listed(3, 'koniec@example.test', { ended_at: new Date().toISOString() });
    equal(await adopt(3), null, 'konto nauki zakończone');
    await signup(4, 'termin@example.test'); await listed(4, 'termin@example.test', { access_until: new Date(Date.now() - 60000).toISOString() });
    equal(await adopt(4), null, 'konto nauki po terminie');
    await signup(5, 'sso@example.test', { is_sso_user: true }); await listed(5, 'sso@example.test');
    equal(await adopt(5), null, 'konto SSO');
    await signup(6, 'azure@example.test'); await listed(6, 'azure@example.test');
    await owner(); await sql("insert into auth.identities(user_id,provider) values($1,'azure')", [uid(6)]);
    equal(await adopt(6), null, 'konto z inną tożsamością');
    await signup(7, 'biuro@example.test', { role: 'internal' }); await listed(7, 'biuro@example.test');
    equal(await adopt(7), null, 'rola biurowa');
    await listed(8, 'brak@example.test');
    equal(await adopt(8), null, 'nie ma takiego użytkownika');
    await signup(9, 'zwiazane@example.test'); await listed(9, 'zwiazane@example.test', { user_id: uid(9) });
    equal(await adopt(9), null, 'konto już powiązane');
    equal(await adopt(1), null, 'drugie przejęcie niczego nie robi');

    // Tylko service_role.
    await signup(10, 'kolejne@example.test'); await listed(10, 'kolejne@example.test');
    for (const role of ['authenticated', 'anon']) {
        await actor('admin', role);
        await expectDenied('select public.academy_adopt_learner_user($1)', [aid(10)], /permission denied/); checks++;
    }

    await owner();
    await db.exec(read('rollbacks/20261110160200_academy_adopt_learner_user.sql'));
    equal((await sql("select to_regprocedure('public.academy_adopt_learner_user(uuid)') p")).rows[0].p, null);

    console.log(`Academy adopt learner: ${checks} checks (${engine})`);
} finally {
    await db.close();
}
