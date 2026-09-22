import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertHostedStorage,localStatus,cleanPublicDump,storagePolicySql } from '../../../COMPASS/scripts/lib/academy-storage-gate.mjs';
import { projectStart } from './report-start.mjs';
// Run the host-native ACL regressions in the existing pre-Storage CI gate.
import './fixture-acl.test.mjs';
import { availabilitySchemaOrder, candidateClaimOrder, candidateStorageOrder, communicatorBootstrap } from './prepare-history.mjs';
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
 const f=await createAcademyDatabase({materials:true,live:true,staff:true,runMaterials:true,revocations:true,rollout:true,obligations:true,cleanup:true,reviewSubmissions:true});
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
