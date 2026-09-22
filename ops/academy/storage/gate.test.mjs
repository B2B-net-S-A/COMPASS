import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertHostedStorage,localStatus,cleanPublicDump,storagePolicySql } from '../../../COMPASS/scripts/lib/academy-storage-gate.mjs';
import { projectStart } from './report-start.mjs';
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
