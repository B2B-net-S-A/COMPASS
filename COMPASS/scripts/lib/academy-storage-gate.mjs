import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { createAcademyDatabase } from './academy-db-fixture.mjs';

export function assertHostedStorage(env = process.env) {
    assert.equal(env.GITHUB_ACTIONS, 'true', 'hosted_storage_gate_only');
    assert.equal(env.RUNNER_ENVIRONMENT, 'github-hosted', 'hosted_storage_gate_only');
    assert.equal(env.RUNNER_OS, 'Linux', 'hosted_storage_gate_only');
}
export function localStatus(raw) {
    const status=JSON.parse(raw), api=new URL(status.API_URL), database=new URL(status.DB_URL);
    assert(['127.0.0.1','localhost'].includes(api.hostname) && api.protocol==='http:' && api.port==='54321', 'local_api_only');
    assert(['127.0.0.1','localhost'].includes(database.hostname) && database.port==='54322' && database.pathname==='/postgres', 'local_database_only');
    assert(typeof status.ANON_KEY==='string' && typeof status.SERVICE_ROLE_KEY==='string', 'local_keys_missing');
    return { api:api.origin, database:database.href, anon:status.ANON_KEY, service:status.SERVICE_ROLE_KEY };
}
export function cleanPublicDump(dump) {
    // pg_dump's psql-only safety markers are not SQL. Native public already exists.
    const result=dump.replace(/^\\(?:un)?restrict[^\n]*\n/gm,'').replace(/^CREATE SCHEMA public;\n/gm,'');
    assert(!/\b(?:CREATE|ALTER) (?:SCHEMA (?:auth|storage)(?:\s|;)|(?:TABLE|FUNCTION) (?:auth|storage)\.)/i.test(result), 'native_schema_overwrite_forbidden');
    assert(!/\b(?:GRANT|REVOKE)[^;]*\bON (?:SCHEMA (?:auth|storage)|(?:ALL [^;]+ IN SCHEMA )?(?:auth|storage)\.)/i.test(result), 'native_schema_grant_forbidden');
    return result;
}
const ident=value=>'"'+String(value).replaceAll('"','""')+'"';
export function storagePolicySql(row) {
    assert(row.schemaname==='storage' && row.tablename==='objects' && /^academy_[a-z_]+$/.test(row.policyname), 'academy_storage_policy_only');
    assert(['ALL','SELECT','INSERT','UPDATE','DELETE'].includes(row.cmd));
    assert(['PERMISSIVE','RESTRICTIVE'].includes(row.permissive));
    assert(Array.isArray(row.roles) && row.roles.every(role=>['authenticated','anon','service_role','public'].includes(role)), 'invalid_storage_policy_roles');
    return `CREATE POLICY ${ident(row.policyname)} ON storage.objects AS ${row.permissive} FOR ${row.cmd} TO ${row.roles.map(ident).join(',')}${row.qual?' USING ('+row.qual+')':''}${row.with_check?' WITH CHECK ('+row.with_check+')':''};`;
}

/** Import only the Academy fixture's application schema into native Supabase.
 * Auth, Storage schema/tables/functions/grants and object bytes stay native.
 * No users, profiles, enrollments, objects or course records are copied.
 */
export async function installAcademyStorageFixture(status) {
    assertHostedStorage();
    const sql=new pg.Client({connectionString:status.database});await sql.connect();
    const bootstrap=new URL(status.database);bootstrap.pathname='/academy_test';
    // Supabase's postgres role is sufficient for this isolated test database.
    await sql.query('CREATE DATABASE academy_test');
    process.env.ACADEMY_TEST_DATABASE_URL=bootstrap.href;
    const fixture=await createAcademyDatabase({materials:true,live:true,staff:true,runMaterials:true,revocations:true,rollout:true,obligations:true,cleanup:true,reviewSubmissions:true});
    try {
        const fixtureName=(await fixture.sql('select current_database() as name')).rows[0].name;
        assert(/^academy_fixture_[a-f0-9]{32}$/.test(fixtureName), 'invalid_fixture_database_name');
        // Same server/client major version. Docker is invoked exclusively after the hosted guard.
        const dump=execFileSync('docker',['exec','supabase_db_academy-storage-ci','pg_dump','-U','postgres','-d',fixtureName,'--schema-only','--no-owner','--schema=public','--schema=academy_private'],{encoding:'utf8',maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});
        await sql.query(cleanPublicDump(dump));
        const policies=(await fixture.sql("select schemaname,tablename,policyname,permissive,roles::text[] as roles,cmd,qual,with_check from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'academy_%' order by policyname")).rows;
        assert(policies.length>=6,'storage_policies_missing');
        for(const policy of policies) await sql.query(storagePolicySql(policy));
        const triggers=(await fixture.sql("select t.tgname,pg_get_triggerdef(t.oid) as definition from pg_trigger t where t.tgrelid='storage.objects'::regclass and not t.tgisinternal and t.tgname like 'academy_%'")).rows;
        assert(triggers.length>=1,'storage_final_byte_guard_missing');
        for(const trigger of triggers) {
            assert(/^academy_[a-z_]+$/.test(trigger.tgname), 'invalid_storage_trigger_name');
            assert(/ ON storage\.objects /i.test(trigger.definition), 'invalid_storage_trigger_target');
            await sql.query(trigger.definition);
        }
        const bucket=(await fixture.sql("select id,name,public,file_size_limit,allowed_mime_types from storage.buckets where id='academy-materials'")).rows[0];
        assert(bucket && !bucket.public, 'private_bucket_required');
        await sql.query('insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)values($1,$2,$3,$4,$5)',[bucket.id,bucket.name,bucket.public,bucket.file_size_limit,bucket.allowed_mime_types]);
        const rules=(await fixture.sql('select code,points,is_active from public.loyalty_rules')).rows;
        for(const rule of rules) await sql.query('insert into public.loyalty_rules(code,points,is_active)values($1,$2,$3)',[rule.code,rule.points,rule.is_active]);
        await sql.query('insert into public.academy_rollout_settings default values');
        await sql.query("NOTIFY pgrst, 'reload schema'");
        return sql;
    } catch(error) {await sql.end();throw error;} finally {await fixture.db.close();}
}
export function appendStorageReport(report) {
    console.log(JSON.stringify(report));
    if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\n### Real Auth / Storage with Academy fixture\n\n\`\`\`json\n${JSON.stringify(report,null,2)}\n\`\`\`\n`);
}
