import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertHostedStorage,localStatus,cleanPublicDump,storagePolicySql } from '../../../COMPASS/scripts/lib/academy-storage-gate.mjs';
import { projectStart } from './report-start.mjs';
// Run the host-native ACL regressions in the existing pre-Storage CI gate.
import './fixture-acl.test.mjs';
import { availabilitySchemaOrder, candidateClaimOrder, candidateStorageOrder, communicatorBootstrap } from './prepare-history.mjs';
import { assertCanonicalBaseline, canonicalSnapshot, canonicalSnapshotSha256 } from './canonical-contract.mjs';

test('canonical dependency contract includes production triggers, enums, ACLs and their exact definitions',()=>{
 assert.equal(canonicalSnapshot.source.project,'shduiynzemftkqqefscd');
 assert.match(canonicalSnapshotSha256,/^[a-f0-9]{64}$/);
 const tables=new Map(canonicalSnapshot.contract.tables.map(table=>[table.name,table]));
 assert.equal(tables.size,18);
 assert.equal(tables.get('profiles').columns.find(column=>column.name==='role').type,'user_role');
 assert(tables.get('profiles').triggers.some(trigger=>trigger.name==='trg_pin_profile_privilege_columns'));
 assert(tables.get('course_enrollments').triggers.some(trigger=>trigger.name==='trg_update_course_enrollment_stats'));
 assert(tables.get('audit_logs').constraints.some(constraint=>constraint.definition.includes('auth.users(id)')));
 assert(canonicalSnapshot.contract.functions.every(fn=>fn.definition.startsWith('CREATE OR REPLACE FUNCTION public.')));
 assert(canonicalSnapshot.contract.defaultPrivileges.some(entry=>entry.owner==='postgres'&&entry.objectType==='r'));
});

test('canonical parity fails on missing triggers, changed nullability, widened ACLs or default grants',async()=>{
 const {createAcademyDatabase}=await import('../../../COMPASS/scripts/lib/academy-db-fixture.mjs');
 const f=await createAcademyDatabase({beforeAcademyMigrations:async db=>{
  for(const mutation of [
   'DROP TRIGGER trg_update_course_enrollment_stats ON course_enrollments',
   'ALTER TABLE profiles ALTER COLUMN email DROP NOT NULL',
   'GRANT DELETE ON loyalty_transactions TO PUBLIC',
   'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO PUBLIC',
  ]){
   await db.exec('BEGIN');
   try{await db.exec(mutation);await assert.rejects(assertCanonicalBaseline(db),/canonical_academy_dependency_drift/);}
   finally{await db.exec('ROLLBACK');}
  }
 }});
 try{
  assert.equal(f.baselineProof.dependencyParity,true);
  await f.actor('student');await f.owner();
  assert.equal((await f.sql('select auth.uid() as id')).rows[0].id,null,'maintenance_fixture_must_clear_browser_claims');
 }
 finally{await f.db.close();}
});
test('refuses local Docker paths even if generic CI is set',()=>{
 assert.throws(()=>assertHostedStorage({CI:'true'}));assert.throws(()=>assertHostedStorage({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'self-hosted',RUNNER_OS:'Linux'}));
 assertHostedStorage({GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',RUNNER_OS:'Linux'});
});
test('accepts only local disposable API and database endpoints',()=>{
 const input={API_URL:'http://127.0.0.1:54321',DB_URL:'postgresql://postgres:synthetic@localhost:54322/postgres',ANON_KEY:'dummy',SERVICE_ROLE_KEY:'dummy'};
 assert.equal(localStatus(JSON.stringify(input)).api,input.API_URL);
 for(const values of [{API_URL:'https://production.supabase.co'},{DB_URL:'postgres://host:5432/postgres'},{DB_URL:'postgres://localhost:54322/production'}]) assert.throws(()=>localStatus(JSON.stringify({...input,...values})));
});
test('removes only psql markers/public creation and rejects native auth/storage writes',()=>{
 assert.equal(cleanPublicDump('\\restrict abc\nCREATE SCHEMA public;\nCREATE TABLE public.example(id uuid);\n\\unrestrict abc\n'),'CREATE TABLE public.example(id uuid);\n');
 for(const sql of ['CREATE FUNCTION auth.uid() returns uuid AS $$select null$$ language sql;','ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;','GRANT ALL ON SCHEMA auth TO authenticated;'])assert.throws(()=>cleanPublicDump(sql));
});
test('exports only allowlisted Academy storage policies',()=>{
 const p={schemaname:'storage',tablename:'objects',policyname:'academy_material_upload',cmd:'INSERT',permissive:'PERMISSIVE',roles:['authenticated'],qual:null,with_check:"bucket_id='academy-materials'"};
 assert.match(storagePolicySql(p),/WITH CHECK/);assert.throws(()=>storagePolicySql({...p,policyname:'allow_everything'}));assert.throws(()=>storagePolicySql({...p,roles:['postgres']}));
});
test('historical failures remain failures, separated from fixture evidence',()=>{
 const report=projectStart('historical-replay',1,'token secret-value\nApplying migration 20260101_fixture.sql\nERROR: relation "profiles" does not exist (SQLSTATE 42P01)\n',254);
 assert.equal(report.fullHistoricalReplay,'failed');assert.equal(report.sqlState,'42P01');assert.equal(report.lastMigration,'20260101_fixture.sql');assert(!JSON.stringify(report).includes('secret-value'));
 assert.equal(projectStart('academy-fixture',0,'',0).fullHistoricalReplay,'not_run_in_fixture_job');
});

test('a zero exit cannot pass a replay that skipped or never applied historical files',()=>{
 assert.equal(projectStart('historical-replay',0,'',254).outcome,'failed');
 assert.equal(projectStart('historical-replay',0,'Applying migration 001_one.sql\nSkipping migration invalid.sql',2).failureCategory,'incomplete_historical_replay');
 assert.equal(projectStart('historical-replay',0,'Applying migration 001_one.sql\n',1).fullHistoricalReplay,'passed');
});

test('Applying log entries prove starts; a failed startup does not prove committed migrations',()=>{
 const log='Applying migration 001_one.sql\nApplying migration 002_two.sql\n';
 for(const status of [1,124]){
  const report=projectStart('historical-replay',status,log,2);
  assert.equal(report.startedMigrationFiles,2);assert.equal(report.appliedMigrationFiles,null);
 }
 const incomplete=projectStart('historical-replay',0,log,3);
 assert.equal(incomplete.startedMigrationFiles,2);assert.equal(incomplete.appliedMigrationFiles,null);
 const completed=projectStart('historical-replay',0,log,2);
 assert.equal(completed.startedMigrationFiles,2);assert.equal(completed.appliedMigrationFiles,2);
});

test('reports the same-day ordering exception without changing failure semantics',()=>{
 const report=projectStart('historical-replay',1,'Applying migration 001_one.sql\nERROR: duplicate policy (SQLSTATE 42710)\n',2,[candidateStorageOrder.id]);
 assert.deepEqual(report.orderingExceptions,[candidateStorageOrder.id]);
 assert.equal(report.outcome,'failed');assert.equal(report.sqlState,'42710');
 assert.match(report.migrationRegistry,/explicit_order_exceptions/);
});

test('counts an archived bootstrap separately while requiring every replay file',()=>{
 const bootstrap=[{sourceRelativePath:communicatorBootstrap.sourceRelativePath,sha256:communicatorBootstrap.sha256}];
 const log='Applying migration 001_migration.sql\nApplying migration 002_archive.sql\n';
 const result=projectStart('historical-replay',0,log,2,[],bootstrap);
 assert.equal(result.outcome,'passed');assert.equal(result.historicalMigrationFiles,1);assert.equal(result.replayFilesExpected,2);
 assert.deepEqual(result.archivedBootstraps,bootstrap);
 assert.equal(projectStart('historical-replay',0,'Applying migration 001_migration.sql\n',2,[],bootstrap).outcome,'failed');
});

test('document indexing reproduces missing polish and matches the canonical simple index through later RPC removal',async()=>{
 const {PGlite}=await import('../../../COMPASS/node_modules/@electric-sql/pglite/dist/index.js');
 const {default:fs}=await import('node:fs');
 const db=new PGlite();
 const migration=name=>fs.readFileSync(new URL(`../../../COMPASS/supabase/migrations/${name}`,import.meta.url),'utf8');
 try {
  await db.exec(`CREATE TABLE app_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid,
   title text,category text,is_archived boolean DEFAULT false,is_public boolean DEFAULT true);`);
  assert.equal((await db.query("select count(*)::int n from pg_ts_config where cfgname='polish'")).rows[0].n,0);
  const indexing=migration('20260218_ai_document_indexing.sql');
  await assert.rejects(db.exec(indexing.replaceAll("'simple'","'polish'")),error=>error.code==='42704');
  await db.exec(indexing);
  // Canonical schema-only observation: the production expression uses simple
  // with these three coalesced fields, in this order. No production rows needed.
  await db.exec(`CREATE INDEX canonical_expected_document_index ON app_documents USING GIN
   (to_tsvector('simple'::regconfig,coalesce(text_content,'')||' '||coalesce(title,'')||' '||coalesce(description,'')));`);
  const expression=async name=>(await db.query('select pg_get_expr(indexprs,indrelid) expression from pg_index where indexrelid=$1::regclass',[name])).rows[0].expression;
  assert.equal(await expression('idx_app_documents_text_search'),await expression('canonical_expected_document_index'));
  await db.exec("INSERT INTO app_documents(title,category,text_content) VALUES('Łączność','other','Przykładowy dokument szkoleniowy');");
  assert.equal((await db.query("select title from search_documents_for_ai('dokument')")).rows[0].title,'Łączność');
  const security=migration('20260220_security_fixes.sql');
  const start=security.indexOf('CREATE OR REPLACE FUNCTION public.search_documents_for_ai(');
  const end=security.indexOf('-- ─── 2h. update_contract_status',start);
  assert(start>=0&&end>start,'document_search_security_section_missing');
  const hardened=security.slice(start,end);
  assert(!hardened.includes("'polish'"));
  await db.exec(hardened);
  assert.equal((await db.query("select title from search_documents_for_ai('dokument')")).rows[0].title,'Łączność');
  await db.exec(migration('20260505100001_phase9_remove_ai_assistant.sql'));
  assert.equal((await db.query("select to_regprocedure('search_documents_for_ai(text,text,integer)') value")).rows[0].value,null);
  assert.equal(await expression('idx_app_documents_text_search'),await expression('canonical_expected_document_index'));
 }finally{await db.close();}
});

test('uses original schema repair before availability and the archived communicator before attachment migrations',async()=>{
 const {PGlite}=await import('../../../COMPASS/node_modules/@electric-sql/pglite/dist/index.js');
 const {default:fs}=await import('node:fs');
 const db=new PGlite();
 const migration=name=>fs.readFileSync(new URL(`../../../COMPASS/supabase/migrations/${name}`,import.meta.url),'utf8');
 try {
  await db.exec(`CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA storage;
   CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE profiles(id uuid PRIMARY KEY,role text);
   CREATE TABLE candidates(id uuid PRIMARY KEY,status text);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT null::uuid$$;
   CREATE TABLE storage.objects(id uuid PRIMARY KEY,name text,bucket_id text);
   CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean);
   CREATE PUBLICATION supabase_realtime;`);
  await assert.rejects(db.exec(migration('20260216_availability_overhaul.sql')),error=>error.code==='42703');
  for(const [name] of availabilitySchemaOrder.files) await db.exec(migration(name));
  const columns=(await db.query("select table_name,column_name from information_schema.columns where table_schema='public' and table_name in ('profiles','candidates') and column_name='current_status' order by table_name")).rows;
  assert.deepEqual(columns.map(row=>row.table_name),['candidates','profiles']);
  await assert.rejects(db.exec(migration(communicatorBootstrap.before)),error=>error.code==='42P01');
  assert.equal((await db.query("select count(*)::int n from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages'")).rows[0].n,0);
  await db.exec(fs.readFileSync(new URL(`../../../COMPASS/supabase/_archive_scripts/${communicatorBootstrap.original}`,import.meta.url),'utf8'));
  assert.equal((await db.query("select count(*)::int n from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages'")).rows[0].n,1);
  await db.exec(migration(communicatorBootstrap.before));
  await db.exec(migration('20260216_chat_attachments_backup.sql'));
  await db.exec(migration('20260220_fix_conversation_rls.sql'));
  assert.equal((await db.query("select count(*)::int n from pg_tables where schemaname='public' and tablename in ('conversations','conversation_participants','messages') and rowsecurity")).rows[0].n,3);
  assert.equal((await db.query("select count(*)::int n from pg_policies where schemaname='public' and tablename in ('conversations','conversation_participants','messages')")).rows[0].n,4);
 }finally{await db.close();}
});

test('diagnoses duplicate invoice policies and candidate claim dependencies before applying documented order',async()=>{
 const {PGlite}=await import('../../../COMPASS/node_modules/@electric-sql/pglite/dist/index.js');
 const {default:fs}=await import('node:fs');
 const db=new PGlite();
 const migration=name=>fs.readFileSync(new URL(`../../../COMPASS/supabase/migrations/${name}`,import.meta.url),'utf8');
 try {
  await db.exec(`CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT null::uuid$$;
   CREATE TABLE profiles(id uuid PRIMARY KEY,role text);CREATE TABLE candidates(id uuid PRIMARY KEY,user_id uuid);`);
  const verify=migration('20260218_verify_and_fix_all.sql');
  const invoiceSection=verify.slice(verify.indexOf('CREATE TABLE IF NOT EXISTS invoices'),verify.indexOf('-- 1d. app_documents'));
  await db.exec(invoiceSection);
  await assert.rejects(db.exec(migration('20260219_invoices.sql')),error=>error.code==='42710');
  await db.exec('DROP TABLE invoices');
  await db.exec(migration('20260219_invoices.sql'));
  const invoicePolicies=async()=>(await db.query("select * from pg_policies where schemaname='public' and tablename='invoices' order by policyname")).rows;
  const original=await invoicePolicies();assert.equal(original.length,5);
  await db.exec(invoiceSection);assert.deepEqual(await invoicePolicies(),original);
  await assert.rejects(db.exec(migration('20260222_bugfix_rls_claim.sql')),error=>error.code==='42703');
  await db.exec(migration('20260222_etap2_candidates_extend.sql'));
  await db.exec(migration('20260222_bugfix_rls_claim.sql'));
  await assert.rejects(db.exec(migration('20260222_etap1b_fix_candidates_rls.sql')),error=>error.code==='42710');
  await db.exec('DROP TABLE candidates;CREATE TABLE candidates(id uuid PRIMARY KEY,user_id uuid)');
  for(const [name] of candidateClaimOrder.files)await db.exec(migration(name));
  const policy=(await db.query("select * from pg_policies where schemaname='public' and tablename='candidates' and policyname='Users can update own candidate'")).rows;
  assert.equal(policy.length,1);assert.match(policy[0].qual,/candidate_status = 'kandydat'/);assert.match(policy[0].with_check,/user_id IS NULL/);
 }finally{await db.close();}
});

test('historical Storage bootstrap and exact backup replay without duplicate policies',async()=>{
 const {PGlite}=await import('../../../COMPASS/node_modules/@electric-sql/pglite/dist/index.js');
 const {default:fs}=await import('node:fs');
 const db=new PGlite();
 const migration=name=>fs.readFileSync(new URL(`../../../COMPASS/supabase/migrations/${name}`,import.meta.url),'utf8');
 try {
  await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA storage;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT null::uuid$$;
   CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$SELECT string_to_array($1,'/')$$;
   CREATE TABLE public.profiles(id uuid PRIMARY KEY, role text);
   CREATE TABLE storage.objects(id uuid PRIMARY KEY,name text,bucket_id text);
   CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean);
   CREATE TABLE public.messages(id uuid PRIMARY KEY);`);
  // Reproduce the hosted failure first; the final lexical file creates an
  // already-existing policy. No exception is swallowed by the replay helper.
  for(const [name] of candidateStorageOrder.files.slice(1)) await db.exec(migration(name));
  await assert.rejects(db.exec(migration(candidateStorageOrder.files[0][0])),error=>error.code==='42710');
  await db.exec('DROP POLICY "Admins can upload Candidates CVs" ON storage.objects');
  for(const [name] of candidateStorageOrder.files) await db.exec(migration(name));
  const candidate=(await db.query("select * from pg_policies where schemaname='storage' and policyname='Admins can upload Candidates CVs'")).rows;
  assert.equal(candidate.length,1);assert.equal(candidate[0].cmd,'INSERT');
  assert.match(candidate[0].with_check,/bucket_id = 'documents'/);
  assert.match(candidate[0].with_check,/foldername\(name\)/);
  assert.match(candidate[0].with_check,/role = 'admin'/);
  await db.exec(migration('20260216_chat_attachments.sql'));
  const policies=async()=>(await db.query("select * from pg_policies where schemaname='storage' and policyname like 'Users can % chat attachments' order by policyname")).rows;
  const original=await policies();assert.equal(original.length,2);
  await db.exec(migration('20260216_chat_attachments_backup.sql'));
  assert.deepEqual(await policies(),original);
  await db.exec(migration('20260216_chat_attachments_backup.sql'));
  assert.deepEqual(await policies(),original);
  // An unrelated repeat is still an error: no blanket DROP or catch adapter.
  await assert.rejects(db.exec(migration('20260216_chat_attachments.sql')),error=>error.code==='42710');
 }finally{await db.close();}
});

test('integration script names match the final migrated RPC contracts',async()=>{
 const {createAcademyDatabase}=await import('../../../COMPASS/scripts/lib/academy-db-fixture.mjs');
 const {default:ts}=await import('../../../COMPASS/node_modules/typescript/lib/typescript.js');
 const {default:fs}=await import('node:fs');
 const f=await createAcademyDatabase({materials:true,live:true,staff:true,runMaterials:true,revocations:true,rollout:true,obligations:true,cleanup:true,reviewSubmissions:true,completionGaps:true});
 try {
  const source=ts.createSourceFile('storage-gate.mjs',fs.readFileSync(new URL('../../../COMPASS/scripts/test-academy-storage.mjs',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const calls=[];
  function visit(node){
   if(ts.isCallExpression(node)){
    const args=node.arguments;
    const index=ts.isIdentifier(node.expression)&&node.expression.text==='rpc'?1:ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='rpc'?0:-1;
    if(index>=0&&args[index]&&ts.isStringLiteral(args[index])&&args[index].text.startsWith('academy_')){
     const params=args[index+1];
     if(!params||ts.isObjectLiteralExpression(params))calls.push({name:args[index].text,params:params?params.properties.map(p=>p.name?.getText(source)).filter(Boolean):[]});
    }
   }
   ts.forEachChild(node,visit);
  }
  visit(source);assert(calls.length>=20,'integration_rpc_coverage_missing');
  for(const call of calls){
   const signatures=(await f.sql("select proargnames,pronargs,pronargdefaults from pg_proc join pg_namespace n on n.oid=pronamespace where n.nspname='public' and proname=$1",[call.name])).rows;
   assert(signatures.some(s=>call.params.every(key=>(s.proargnames??[]).includes(key))&&call.params.length>=s.pronargs-s.pronargdefaults),`named RPC contract drift: ${call.name}(${call.params.join(',')})`);
  }
 }finally{await f.db.close();}
});

test('native pg name arrays require explicit text-array projection', async () => {
 const {default:pg}=await import('../../../COMPASS/node_modules/pg/lib/index.js');
 assert.equal(Array.isArray(pg.types.getTypeParser(1003)('{authenticated}')),false);
 const roles=pg.types.getTypeParser(1009)('{authenticated}');
 assert.deepEqual(roles,['authenticated']);
 assert.match(storagePolicySql({schemaname:'storage',tablename:'objects',policyname:'academy_native_roles',cmd:'SELECT',permissive:'PERMISSIVE',roles,qual:'true',with_check:null}),/TO "authenticated"/);
});

test('restores public search path after pg_dump before replaying deparsed policy expressions',async()=>{
 const {createAcademyDatabase}=await import('../../../COMPASS/scripts/lib/academy-db-fixture.mjs');
 const f=await createAcademyDatabase({materials:true});
 try {
  const row=(await f.sql("select * from pg_policies where schemaname='storage' and policyname='academy_material_read'")).rows[0];
  const statement=storagePolicySql({...row,policyname:'academy_search_path_regression'});
  await f.sql("select set_config('search_path','',false)");
  await assert.rejects(f.sql(statement),/does not exist/);
  await f.sql("select set_config('search_path','public, extensions',false)");
  await f.sql(statement);
 }finally{await f.db.close();}
});
