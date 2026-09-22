/** Focused PostgreSQL fixture for the Academy migrations. No Docker or remote DB.
 * Base tables are extracted from committed migrations; only Supabase auth/storage
 * infrastructure and unrelated profile/loyalty columns are represented minimally.
 * This does not replace replaying the entire repository migration history in CI.
 */
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function createAcademyDatabase({ materials = false, live = false, staff = false, runMaterials = false, cleanup = false, revocations = false, rollout = false, obligations = false, reviewSubmissions = false, beforeAcademyMigrations } = {}) {
    if (rollout || obligations) revocations = true;
    if (revocations || reviewSubmissions) staff = true;
    if (cleanup) runMaterials = true;
    if (runMaterials) { materials = true; live = true; staff = true; }
    if (staff) live = true;
    const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '');
    const initial = fs.readFileSync(`${root}/supabase/migrations/20260429_lms_akademia.sql`, 'utf8');
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
        db = new PGlite();
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
    async function owner() { await db.exec('RESET ROLE'); }
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
CREATE TYPE public.loyalty_tier_t AS ENUM ('scout','explorer','pathfinder','navigator','captain','admiral','legend');
CREATE TABLE public.profiles(id uuid primary key,role text NOT NULL,email text,full_name text,is_external boolean DEFAULT false,employment_status text DEFAULT 'active',loyalty_points integer NOT NULL DEFAULT 0,loyalty_tier public.loyalty_tier_t NOT NULL DEFAULT 'scout',learning_streak_current integer NOT NULL DEFAULT 0,learning_streak_longest integer NOT NULL DEFAULT 0,learning_streak_last_date date);
CREATE TYPE public.course_type_t AS ENUM('consultant','company');
CREATE TABLE public.loyalty_rules(code text PRIMARY KEY,points integer,is_active boolean DEFAULT true);
CREATE TABLE public.loyalty_transactions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid,points integer,source_type text,source_id uuid,description text,status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('pending','confirmed','reversed')),confirmed_at timestamptz,reverses_id uuid REFERENCES public.loyalty_transactions(id),created_at timestamptz DEFAULT now());
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin') $$;
CREATE FUNCTION public.award_course_points(uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'legacy'::text $$;
CREATE FUNCTION public.award_first_publish_bonus(uuid) RETURNS text LANGUAGE sql AS $$ SELECT 'legacy'::text $$;`);
for(const t of ['courses','course_lessons','course_quiz_questions','course_quiz_options','course_enrollments','course_quiz_attempts','course_ratings']){
const m=initial.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\([\\s\\S]*?\\n\\);`));assert(m,t);await db.exec(m[0]);}
await db.exec(`ALTER TABLE courses ADD COLUMN course_type course_type_t NOT NULL DEFAULT 'consultant',ADD COLUMN is_official boolean DEFAULT false,ADD COLUMN prerequisite_course_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE course_lessons ADD COLUMN unlock_after_days integer NOT NULL DEFAULT 0,ADD COLUMN ai_summary text,ADD COLUMN ai_summary_generated_at timestamptz;
ALTER TABLE course_enrollments ADD COLUMN certificate_hash text,ADD COLUMN certificate_issued_at timestamptz,ADD COLUMN last_accessed_lesson_id uuid REFERENCES course_lessons(id),ADD COLUMN last_accessed_at timestamptz,ADD COLUMN lesson_completion_dates jsonb NOT NULL DEFAULT '{}';
ALTER TABLE course_ratings ENABLE ROW LEVEL SECURITY;
INSERT INTO loyalty_rules(code,points) VALUES('course_first_publish_bonus',100),('course_completed_student',20),('course_completed_company_student',30),('course_completed_author_reward',50),('learning_streak_milestone',25),('course_question_asked',5),('course_answer_given',15);
GRANT USAGE ON SCHEMA auth,public TO authenticated,anon,service_role; GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated,anon,service_role; GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated,anon,service_role;`);
const triggers=initial.slice(initial.indexOf('CREATE OR REPLACE FUNCTION update_course_ratings_stats()'),initial.indexOf('-- 10.'));
await db.exec(triggers);
for(const [name,id]of Object.entries(ids)){ await sql('insert into auth.users(id,email,email_confirmed_at)values($1,$2,now())',[id,`${name}@example.test`]); await sql('insert into profiles(id,role,email,full_name)values($1,$2,$3,$4)',[id,name==='admin'?'admin':name==='internal'?'internal':'consultant',`${name}@example.test`,name]); }
const legacy=(await sql("insert into courses(author_id,title,slug,category,status)values($1,'Legacy','legacy','IT','published')returning id",[ids.admin])).rows[0].id;
const oldLesson=(await sql("insert into course_lessons(course_id,title,order_index)values($1,'Old lesson',0)returning id",[legacy])).rows[0].id;
await sql("insert into course_enrollments(user_id,course_id,completed_at,points_awarded,certificate_hash,completed_lessons)values($1,$2,now(),true,'preserved-legacy-hash',$3)",[ids.student,legacy,[oldLesson]]);

for (const [filename, tables] of [
    ['20260213_notifications_system.sql', ['notifications']],
    ['20260508000008_phase_a2_course_qa.sql', ['course_questions','course_answers']],
    ['20260508000010_phase_a2_drip_and_surveys.sql', ['course_survey_responses']],
    ['20260508000007_phase_a2_learning_paths.sql', ['learning_paths','learning_path_courses','learning_path_enrollments']],
]) {
    const source = fs.readFileSync(`${root}/supabase/migrations/${filename}`, 'utf8');
    for (const table of tables) {
        const statement = source.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table} \\([\\s\\S]*?\\n\\);`));
        assert(statement, `fixture definition for ${table}`);
        await db.exec(statement[0]);
        await db.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; GRANT ALL ON ${table} TO authenticated,anon,service_role`);
    }
    if (filename.includes('course_qa')) await db.exec(source.slice(source.indexOf('-- Trigger: updated_at'), source.indexOf('-- Loyalty rules')));
    if (filename.includes('learning_paths')) await db.exec(source.slice(source.indexOf('-- Trigger: updated_at'), source.indexOf('COMMIT;')));
}

    if (beforeAcademyMigrations) await beforeAcademyMigrations(db);
    const suffixes = ['academy_versioned_foundation', ...(materials ? ['academy_materials'] : []), ...(live ? ['academy_live_sessions'] : []), ...(staff ? ['academy_staff_and_legacy_review'] : []), ...(runMaterials ? ['academy_run_materials'] : []), ...(revocations ? ['academy_completion_revocations'] : []), ...(rollout ? ['academy_rollout_gate'] : []), ...(obligations ? ['academy_session_obligations'] : []), ...(cleanup ? ['academy_material_cleanup'] : []), ...(reviewSubmissions ? ['academy_review_submission_token'] : [])];
    for (const suffix of suffixes) {
        const name = fs.readdirSync(`${root}/supabase/migrations`).find(file => file.endsWith(`_${suffix}.sql`));
        assert(name, `migration ${suffix} exists`);
        try { await db.exec(fs.readFileSync(`${root}/supabase/migrations/${name}`, 'utf8')); }
        catch (error) { throw new Error(`${name}: ${error.message} (${error.where ?? ''})`, { cause: error }); }
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
            owner: () => connection.exec('RESET ROLE'), service: () => sessionActor('', 'service_role'),
            rpc: async (name, args = []) => {
                assert.match(name, /^[a-z][a-z0-9_]*$/);
                return (await query(`select to_jsonb(public.${name}(${args.map((_,i) => '$'+(i+1)).join(',')})) as result`, rpcArgs(name,args))).rows[0].result;
            } };
    }
    return { db, ids, query: sql, sql, actor, owner, service, rpc, expectDenied, legacy, oldLesson, engine, connectSession };
}
