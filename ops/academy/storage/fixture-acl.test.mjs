import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { assertFixtureObjectPrivileges, readFixtureDefaultPrivileges, withFixtureDefaultPrivileges } from '../../../COMPASS/scripts/lib/academy-fixture-acl.mjs';
import { createAcademyDatabase } from '../../../COMPASS/scripts/lib/academy-db-fixture.mjs';

const { PGlite } = await import(process.env.ACADEMY_PGLITE_PATH
    ? pathToFileURL(process.env.ACADEMY_PGLITE_PATH).href
    : new URL('../../../COMPASS/node_modules/@electric-sql/pglite/dist/index.js', import.meta.url).href);
const roles = 'create role authenticated; create role anon; create role service_role;';
// This is the ACL delta pg_dump produces, not the original migration's explicit
// REVOKE authenticated/anon (neither role occurs in the source worker ACL).
const dump = `create schema academy_private;
create function public.worker(p_id uuid) returns boolean language sql security definer as $$select true$$;
revoke all on function public.worker(uuid) from public;
grant all on function public.worker(uuid) to service_role;
create function public.public_default() returns boolean language sql as $$select true$$;
create function academy_private.internal_worker() returns boolean language sql as $$select true$$;
revoke all on function academy_private.internal_worker() from public;
create table public.records(id int);
grant select on public.records to authenticated;
create sequence public.record_sequence;
grant usage on public.record_sequence to service_role;`;
const injectedDefaults = `alter default privileges grant execute on functions to authenticated,service_role;
alter default privileges in schema public grant execute on functions to anon with grant option;
alter default privileges grant all on tables to authenticated;
alter default privileges in schema public grant all on tables to anon;
alter default privileges grant usage on sequences to authenticated;
alter default privileges in schema public grant all on sequences to anon;
alter default privileges grant usage on types to authenticated;
alter default privileges in schema public grant usage on types to anon;
alter default privileges grant usage on schemas to authenticated;`;
const existingNative = `create schema auth; create schema storage;
create table storage.objects(id uuid); grant select on storage.objects to authenticated;
create function auth.uid() returns uuid language sql as $$select null::uuid$$;
create function public.native_extension() returns int language sql as $$select 1$$;
alter default privileges in schema storage grant select on tables to authenticated;`;
const nativeAcl = async db => (await db.query(`select n.nspname||'.'||c.relname as object,c.relacl::text as acl
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage'
    union all select n.nspname||'.'||p.proname,p.proacl::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='auth' or p.proname='native_extension' order by 1`)).rows;

test('native vector extension ACLs stay native while application function ACL drift still fails',async()=>{
    const {vector}=await import(new URL('../../../COMPASS/node_modules/@electric-sql/pglite/dist/vector/index.js',import.meta.url).href);
    const source=new PGlite({extensions:{vector}}),target=new PGlite({extensions:{vector}});
    try{
        for(const db of [source,target])await db.exec(roles+'CREATE EXTENSION vector;'+dump);
        const signature=(await target.query("select p.oid::regprocedure::text as signature from pg_proc p join pg_depend d on d.objid=p.oid and d.classid='pg_proc'::regclass join pg_extension e on e.oid=d.refobjid where d.deptype='e' and e.extname='vector' order by p.oid limit 1")).rows[0].signature;
        await target.exec(`GRANT EXECUTE ON FUNCTION ${signature} TO authenticated;`);
        assert.equal(await assertFixtureObjectPrivileges(source,target),5);
        await target.exec('GRANT EXECUTE ON FUNCTION public.worker(uuid) TO authenticated;');
        await assert.rejects(assertFixtureObjectPrivileges(source,target),/fixture_acl_mismatch:function:public.worker/);
    }finally{await Promise.all([source.close(),target.close()]);}
});

test('dump restore removes injected global/schema defaults temporarily and matches source ACLs', async () => {
    const source = new PGlite(), unsafe = new PGlite(), target = new PGlite();
    try {
        await source.exec(roles + dump);
        await unsafe.exec(roles + injectedDefaults + dump);
        assert.equal((await unsafe.query("select has_function_privilege('authenticated','public.worker(uuid)','execute') as allowed")).rows[0].allowed, true);
        await assert.rejects(assertFixtureObjectPrivileges(source, unsafe), /fixture_acl_mismatch/);
        await target.exec(roles + existingNative + injectedDefaults);
        const defaultsBefore = await readFixtureDefaultPrivileges(target), nativeBefore = await nativeAcl(target);
        await withFixtureDefaultPrivileges(target, async () => {
            await target.exec(dump);
            assert.equal(await assertFixtureObjectPrivileges(source, target), 5);
        });
        assert.deepEqual(await readFixtureDefaultPrivileges(target), defaultsBefore);
        assert.deepEqual(await nativeAcl(target), nativeBefore);
        const rights = (await target.query(`select
            has_function_privilege('authenticated','public.worker(uuid)','execute') as authenticated,
            has_function_privilege('anon','public.worker(uuid)','execute') as anon,
            has_function_privilege('service_role','public.worker(uuid)','execute') as service`)).rows[0];
        assert.deepEqual(rights, {authenticated:false,anon:false,service:true});
        await target.exec('set role authenticated');
        await assert.rejects(target.query("select public.worker(null)"), /permission denied/);
        await target.exec('reset role; create function public.after_import() returns bool language sql as $$select true$$');
        assert.equal((await target.query("select has_function_privilege('anon','public.after_import()','execute with grant option') as allowed")).rows[0].allowed,true);
        assert.equal((await target.query("select has_schema_privilege('authenticated','academy_private','usage') as allowed")).rows[0].allowed,false);
        // Schema-local native defaults were never normalized or changed.
        await target.exec('create table storage.after_import(id int)');
        assert.equal((await target.query("select has_table_privilege('authenticated','storage.after_import','select') as allowed")).rows[0].allowed,true);
    } finally { await Promise.all([source.close(), unsafe.close(), target.close()]); }
});

test('failed import rolls back objects and restores defaults; dump default changes do not escape', async () => {
    const target = new PGlite();
    try {
        await target.exec(roles + injectedDefaults);
        const before = await readFixtureDefaultPrivileges(target);
        await assert.rejects(withFixtureDefaultPrivileges(target, async () => {
            await target.exec(dump);
            await target.query('select deliberately_missing_column');
        }), /does not exist/);
        assert.deepEqual(await readFixtureDefaultPrivileges(target), before);
        assert.equal((await target.query("select to_regprocedure('public.worker(uuid)') as function")).rows[0].function,null);
        await withFixtureDefaultPrivileges(target, async () => {
            await target.exec(dump + 'alter default privileges in schema academy_private grant execute on functions to authenticated;');
        });
        assert.deepEqual(await readFixtureDefaultPrivileges(target), before);
    } finally { await target.close(); }
});

test('parity rejects table, sequence and effective inherited privileges, including NULL ACL defaults', async () => {
    const source = new PGlite(), target = new PGlite();
    try {
        await source.exec(roles + dump); await target.exec(roles + dump);
        assert.equal(await assertFixtureObjectPrivileges(source,target),5);
        for (const [grant,revoke] of [
            ['grant insert on public.records to anon','revoke insert on public.records from anon'],
            ['grant usage on public.record_sequence to anon','revoke usage on public.record_sequence from anon'],
            ['revoke execute on function public.public_default() from public','grant execute on function public.public_default() to public'],
            ['grant service_role to authenticated','revoke service_role from authenticated'],
        ]) {
            await target.exec(grant);
            await assert.rejects(assertFixtureObjectPrivileges(source,target),/fixture_acl_mismatch/);
            await target.exec(revoke);
            assert.equal(await assertFixtureObjectPrivileges(source,target),5);
        }
    } finally { await Promise.all([source.close(),target.close()]); }
});

test('actual Academy migrations revoke worker and legacy review RPCs under native-style default grants', async () => {
    const f = await createAcademyDatabase({materials:true,live:true,staff:true,runMaterials:true,revocations:true,rollout:true,obligations:true,cleanup:true,reviewSubmissions:true,completionGaps:true,
        afterBaselineVerification: db => db.exec(`alter default privileges grant execute on functions to authenticated,anon,service_role;
            alter default privileges in schema public grant all on functions to authenticated,anon,service_role;
            alter default privileges grant all on tables to authenticated,anon,service_role;
            alter default privileges in schema public grant all on sequences to authenticated,anon,service_role;`)});
    try {
        assert.equal(f.baselineProof.dependencyParity,false);
        for (const role of ['anon','authenticated']) {
            await f.actor('',role);
            await f.expectDenied("select public.academy_accept_material_scan(gen_random_uuid(),now(),repeat('a',64),null)",[],/permission denied/);
            await f.expectDenied('select public.academy_claim_material_scan()',[],/permission denied/);
            await f.expectDenied('select public.award_course_points(gen_random_uuid())',[],/permission denied/);
        }
        for (const role of ['anon','authenticated','service_role']) {
            await f.actor('',role);
            await f.expectDenied('select public.academy_review_course(gen_random_uuid(),true,null)',[],/permission denied/);
            await f.expectDenied('select public.academy_review_course(gen_random_uuid(),true)',[],/permission denied/);
        }
        await f.service();
        assert.equal(await f.rpc('academy_accept_material_scan',['00000000-0000-0000-0000-999999999999',new Date().toISOString(),'a'.repeat(64),null]),false);
    } finally { await f.db.close(); }
});
