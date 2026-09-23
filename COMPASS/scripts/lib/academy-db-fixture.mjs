/** Focused PostgreSQL fixture for the Academy migrations. No Docker or remote DB.
 * The pre-Academy application schema is the reviewed, canonical production
 * dependency snapshot. Host-native Auth/Storage are minimal; the hosted Storage
 * gate separately retains native Supabase infrastructure. This is upgrade proof
 * for that explicit dependency boundary, never a whole-application restore.
 */
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { installCanonicalBaseline, assertCanonicalBaseline } from '../../../ops/academy/storage/canonical-contract.mjs';

export async function createAcademyDatabase({ materials = false, live = false, staff = false, runMaterials = false, cleanup = false, revocations = false, rollout = false, obligations = false, reviewSubmissions = false, completionGaps = false, administrationControls = false, runsPagination = false, materialReviewIndependence = false, beforeAcademyMigrations, afterBaselineVerification } = {}) {
    if (materialReviewIndependence) runMaterials = true;
    if (runsPagination) administrationControls = true;
    if (administrationControls) completionGaps = true;
    if (completionGaps) { materials = true; live = true; staff = true; runMaterials = true; cleanup = true; revocations = true; rollout = true; obligations = true; reviewSubmissions = true; }
    if (rollout || obligations) revocations = true;
    if (revocations || reviewSubmissions) staff = true;
    if (cleanup) runMaterials = true;
    if (runMaterials) { materials = true; live = true; staff = true; }
    if (staff) live = true;
    const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
    const engine = process.env.ACADEMY_TEST_DATABASE_URL ? 'postgres' : 'pglite';
    let db;
    let connect;
    if (engine === 'postgres') {
        // A deliberately named empty CI database is the only accepted bootstrap.
        const target = new URL(process.env.ACADEMY_TEST_DATABASE_URL);
        assert.equal(target.pathname, '/academy_test', 'Hosted gate requires disposable academy_test bootstrap DB');
        const { default: pg } = await import(process.env.ACADEMY_PG_PATH
            ? pathToFileURL(process.env.ACADEMY_PG_PATH).href : 'pg');
        const admin = new pg.Client({ connectionString: target.href });
        await admin.connect();
        const database = `academy_fixture_${randomUUID().replaceAll('-', '')}`;
        await admin.query(`CREATE DATABASE ${database}`);
        target.pathname = `/${database}`;
        const clients = new Set();
        connect = async () => {
            const client = new pg.Client({ connectionString: target.href });
            await client.connect(); clients.add(client);
            return { query: (statement, params = []) => client.query(statement, params),
                exec: statement => client.query(statement),
                close: async () => { clients.delete(client); await client.end(); } };
        };
        db = await connect();
        db.close = async () => {
            await Promise.all([...clients].map(client => client.end())); clients.clear();
            await admin.query(`DROP DATABASE ${database}`); await admin.end();
        };
    } else {
        const { PGlite } = await import(process.env.ACADEMY_PGLITE_PATH
            ? pathToFileURL(process.env.ACADEMY_PGLITE_PATH).href : '@electric-sql/pglite');
        const { vector } = await import('@electric-sql/pglite/vector');
        db = new PGlite({ extensions: { vector } });
    }
    const ids = Object.fromEntries(['admin','trainer','student','other','internal'].map((name, index) =>
        [name, `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`]));
    const sql = (statement, params = []) => db.query(statement, params);
    async function actor(who, role = 'authenticated') {
        assert(['authenticated','anon','service_role'].includes(role));
        await db.exec('RESET ROLE');
        await sql("select set_config('request.jwt.claim.sub',$1,false)", [ids[who] ?? who ?? '']);
        await sql("select set_config('request.jwt.claim.role',$1,false)", [role]);
        await db.exec(`SET ROLE ${role}`);
    }
    async function owner() {
        await db.exec('RESET ROLE');
        // A maintenance connection has no browser JWT. Leaving the previous
        // learner claim would make real profile/contributor triggers treat the
        // fixture setup as that learner, even after RESET ROLE.
        await sql("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false)");
    }
    async function service() { await actor('', 'service_role'); }
    async function expectDenied(statement, params = [], message) {
        try { await sql(statement, params); }
        catch (error) {
            if (message) assert.match(error.message, message);
            return error;
        }
        assert.fail(`Expected SQL denial: ${statement}`);
    }
    function rpcArgs(name, args) {
        return args.map((value,index) => (index === 1 && ['academy_replace_quiz','academy_submit_quiz','submit_quiz_attempt'].includes(name) && Array.isArray(value)) ? JSON.stringify(value) : value);
    }
    async function rpc(name, args = []) {
        assert.match(name, /^[a-z][a-z0-9_]*$/);
        return (await sql(`select to_jsonb(public.${name}(${args.map((_,i) => '$'+(i+1)).join(',')})) as result`, rpcArgs(name,args))).rows[0].result;
    }
await db.exec(`DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,email_confirmed_at timestamptz);
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb,version text,owner uuid,owner_id text,UNIQUE(bucket_id,name)); ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated,anon,service_role; GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated,anon,service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth,public TO authenticated,anon,service_role;`);
const baselineProof = await installCanonicalBaseline(db);
await db.exec(`INSERT INTO loyalty_rules(code,name,category,points) VALUES
('course_first_publish_bonus','First publication','learning',100),
('course_completed_student','Course completed','learning',20),
('course_completed_company_student','Company course completed','learning',30),
('course_completed_author_reward','Author reward','learning',50),
('learning_streak_milestone','Learning streak','learning',25),
('course_question_asked','Question','learning',5),
('course_answer_given','Answer','learning',15);`);
for(const [name,id]of Object.entries(ids)){ await sql('insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())',[id,`${name}@example.test`]); await sql('insert into profiles(id,role,email,full_name)values($1,$2,$3,$4)',[id,name==='admin'?'admin':name==='internal'?'internal':'consultant',`${name}@example.test`,name]); }
const legacy=(await sql("insert into courses(author_id,title,slug,category,status)values($1,'Legacy','legacy','IT','published')returning id",[ids.admin])).rows[0].id;
const oldLesson=(await sql("insert into course_lessons(course_id,title,order_index)values($1,'Old lesson',0)returning id",[legacy])).rows[0].id;
await sql("insert into course_enrollments(user_id,course_id,completed_at,points_awarded,certificate_hash,completed_lessons)values($1,$2,now(),true,'preserved-legacy-hash',$3)",[ids.student,legacy,[oldLesson]]);

    if (beforeAcademyMigrations) await beforeAcademyMigrations(db);
    await assertCanonicalBaseline(db);
    // Dedicated negative tests may deliberately strengthen inherited defaults.
    // Such a variation never reports canonical upgrade parity.
    if (afterBaselineVerification) {
        await afterBaselineVerification(db);
        baselineProof.dependencyParity = false;
        baselineProof.variation = 'intentional_adversarial_test_mutation';
    }
    const suffixes = ['academy_versioned_foundation', ...(materials ? ['academy_materials'] : []), ...(live ? ['academy_live_sessions'] : []), ...(staff ? ['academy_staff_and_legacy_review'] : []), ...(runMaterials ? ['academy_run_materials'] : []), ...(revocations ? ['academy_completion_revocations'] : []), ...(rollout ? ['academy_rollout_gate'] : []), ...(obligations ? ['academy_session_obligations'] : []), ...(cleanup ? ['academy_material_cleanup'] : []), ...(reviewSubmissions ? ['academy_review_submission_token'] : []), ...(completionGaps ? ['academy_roster_progress', 'academy_operations_health', 'academy_attendance_recovery'] : []), ...(administrationControls ? ['academy_archive_controls', 'academy_review_history', 'academy_archive_prerequisite_guard'] : []), ...(runsPagination ? ['academy_runs_pagination'] : []), ...(materialReviewIndependence ? ['academy_material_review_independence'] : [])];
    const appliedMigrations = [];
    for (const suffix of suffixes) {
        const matches = fs.readdirSync(`${root}/supabase/migrations`).filter(file => file.endsWith(`_${suffix}.sql`));
        assert.equal(matches.length, 1, `migration ${suffix} is unambiguous`);
        const [name] = matches;
        try { await db.exec(fs.readFileSync(`${root}/supabase/migrations/${name}`, 'utf8')); }
        catch (error) { throw new Error(`${name}: ${error.message} (${error.where ?? ''})`, { cause: error }); }
        appliedMigrations.push(name);
    }
    async function connectSession(who, role = 'authenticated') {
        assert.equal(engine, 'postgres', 'Independent concurrency sessions require hosted PostgreSQL');
        const connection = await connect();
        const query = (statement, params = []) => connection.query(statement, params);
        async function sessionActor(user, sessionRole = 'authenticated') {
            assert(['authenticated','anon','service_role'].includes(sessionRole));
            await connection.exec('RESET ROLE');
            await query("select set_config('request.jwt.claim.sub',$1,false)", [ids[user] ?? user ?? '']);
            await query("select set_config('request.jwt.claim.role',$1,false)", [sessionRole]);
            await connection.exec(`SET ROLE ${sessionRole}`);
        }
        await sessionActor(who, role);
        return { db: connection, query, sql: query, actor: sessionActor,
            owner: async () => { await connection.exec('RESET ROLE'); await query("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false)"); }, service: () => sessionActor('', 'service_role'),
            rpc: async (name, args = []) => {
                assert.match(name, /^[a-z][a-z0-9_]*$/);
                return (await query(`select to_jsonb(public.${name}(${args.map((_,i) => '$'+(i+1)).join(',')})) as result`, rpcArgs(name,args))).rows[0].result;
            } };
    }
    return { db, ids, query: sql, sql, actor, owner, service, rpc, expectDenied, legacy, oldLesson, engine, connectSession, baselineProof, appliedMigrations };
}
