// Hosted-only backup/restore exercise over the disposable native Supabase fixture.
// This proves a real PostgreSQL dump/restore and Storage API byte transfer in CI;
// it does not inspect or restore production backups.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { assertHostedStorage, localStatus } from './lib/academy-storage-gate.mjs';
import { seal, verify } from '../../ops/academy/restore/verify.mjs';

assertHostedStorage();
const settings = localStatus(fs.readFileSync(process.env.ACADEMY_STORAGE_STATUS_FILE, 'utf8'));
const runnerTemp = process.env.RUNNER_TEMP;
assert(runnerTemp && runnerTemp !== '/', 'runner_temp_required');
const work = await mkdtemp(join(runnerTemp, 'academy-restore-'));
await fs.promises.chmod(work, 0o700);
const source = join(work, 'source');
const target = join(work, 'target');
const backupInContainer = `/tmp/academy-restore-${randomUUID()}.dump`;
const restoredInContainer = `/tmp/academy-restore-${randomUUID()}.dump`;
const targetName = `academy_restore_${randomUUID().replaceAll('-', '')}`;
const container = 'supabase_db_academy-storage-ci';
const client = new pg.Client({ connectionString: settings.database });
const service = createClient(settings.api, settings.service, { auth: { persistSession: false, autoRefreshToken: false } });
const exportSql = await readFile(new URL('../../ops/academy/restore/export.sql', import.meta.url), 'utf8');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const safeName = name => typeof name === 'string' && name && !name.includes('\\') && !name.includes('\0') && !name.startsWith('/')
  && name.split('/').every(part => part && part !== '.' && part !== '..');
const docker = (...args) => execFileSync('docker', args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 });
const objects = area => join(area, 'objects');

async function exportDatabase(connection, path) {
  const result = await connection.query(exportSql);
  const rows = (Array.isArray(result) ? result : [result]).flatMap(item => item.rows ?? []);
  assert.equal(rows.length, 1, 'one_consistent_export_required');
  const payload = Object.values(rows[0])[0];
  assert.equal(typeof payload, 'string', 'export_must_be_json_text');
  await writeFile(path, `${payload}\n`, { mode: 0o600 });
}

async function putObject(area, bucket, name, bytes) {
  assert(safeName(name), 'unsafe_storage_object_path');
  const file = join(objects(area), bucket, name);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes, { mode: 0o600 });
}

async function storageBytes(bucket, name) {
  const result = await service.storage.from(bucket).download(name);
  assert.ifError(result.error);
  return Buffer.from(await result.data.arrayBuffer());
}

let stage = 'setup';
let targetClient;
let sourceConnected = false;
try {
  await mkdir(join(objects(source), 'academy-materials'), { recursive: true });
  await mkdir(join(objects(source), 'documents'), { recursive: true });
  await mkdir(join(objects(target), 'academy-materials'), { recursive: true });
  await mkdir(join(objects(target), 'documents'), { recursive: true });
  await client.connect(); sourceConnected = true;
  // Exercise a populated attendance table as well as a real learner completion.
  // The fixture is disposable; this synthetic review row is restore data only.
  const attendance = (await client.query(`select s.id as session_id, r.enrollment_id,
      (select id from public.profiles where role='admin' order by id limit 1) as reviewer_id
    from public.course_sessions s
    join public.course_run_registrations r on r.run_id=s.run_id and r.status='confirmed'
    where s.status='scheduled' order by s.id limit 1`)).rows[0];
  assert(attendance?.session_id && attendance.enrollment_id && attendance.reviewer_id, 'attendance_fixture_missing');
  await client.query(`insert into public.session_attendance
    (session_id,enrollment_id,status,attended_seconds,source,reviewed_by,note)
    values($1,$2,'insufficient',0,'manual',$3,'Synthetic CI restore evidence')`,
    [attendance.session_id, attendance.enrollment_id, attendance.reviewer_id]);
  stage = 'fixture_presence';
  const fixture = (await client.query(`select
    (select count(*)::int from public.courses) as courses,
    (select count(*)::int from public.course_enrollments) as enrollments,
    (select count(*)::int from public.course_completions) as completions,
    (select count(*)::int from public.session_attendance) as attendance,
    (select count(*)::int from public.course_materials where status='ready') as ready_materials,
    (select count(*)::int from public.course_runs) as runs,
    (select count(*)::int from public.course_sessions) as sessions`)).rows[0];
  for (const [key, count] of Object.entries(fixture)) assert(count > 0, `fixture_${key}_missing`);
  const files = (await client.query(`select bucket_id,name,metadata->>'mimetype' as mime
    from storage.objects where bucket_id='academy-materials'
       or (bucket_id='documents' and name like 'courses/%')
    order by bucket_id,name`)).rows;
  assert(files.some(file => file.bucket_id === 'academy-materials'), 'storage_fixture_missing');

  stage = 'source_snapshot';
  await exportDatabase(client, join(source, 'export.json'));
  for (const file of files) await putObject(source, file.bucket_id, file.name, await storageBytes(file.bucket_id, file.name));
  const manifest = join(work, 'source-manifest.json');
  const sealed = await seal(join(source, 'export.json'), objects(source), manifest, `hosted-${randomUUID()}`);
  assert(sealed.objectCount > 0, 'source_manifest_empty');

  stage = 'postgres_backup';
  docker('exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--format=custom', '--no-owner', '--no-acl', '-f', backupInContainer);
  docker('cp', `${container}:${backupInContainer}`, join(work, 'postgres.dump'));
  assert((await fs.promises.stat(join(work, 'postgres.dump'))).size > 0, 'postgres_backup_empty');

  stage = 'postgres_restore';
  await client.query(`CREATE DATABASE ${targetName} TEMPLATE template0`);
  docker('cp', join(work, 'postgres.dump'), `${container}:${restoredInContainer}`);
  docker('exec', container, 'pg_restore', '-U', 'postgres', '-d', targetName,
    '--no-owner', '--no-acl', '--clean', '--if-exists', '--exit-on-error', restoredInContainer);
  const targetUrl = new URL(settings.database); targetUrl.pathname = `/${targetName}`;
  targetClient = new pg.Client({ connectionString: targetUrl.href });
  await targetClient.connect();
  const restoredMetadata = (await targetClient.query(`select bucket_id,name
    from storage.objects where bucket_id='academy-materials'
       or (bucket_id='documents' and name like 'courses/%')
    order by bucket_id,name`)).rows;
  assert.deepEqual(restoredMetadata, files.map(({ bucket_id, name }) => ({ bucket_id, name })),
    'restored_storage_metadata_mismatch');
  await exportDatabase(targetClient, join(target, 'export.json'));

  stage = 'storage_restore';
  const restoreBucket = `academy-restore-${randomUUID()}`;
  const created = await service.storage.createBucket(restoreBucket, { public: false });
  assert.ifError(created.error);
  for (const file of files) {
    const logicalPath = `${file.bucket_id}/${file.name}`;
    const bytes = await readFile(join(objects(source), file.bucket_id, file.name));
    const uploaded = await service.storage.from(restoreBucket).upload(logicalPath, bytes,
      { upsert: false, contentType: file.mime ?? 'application/octet-stream' });
    assert.ifError(uploaded.error);
    await putObject(target, file.bucket_id, file.name, await storageBytes(restoreBucket, logicalPath));
  }
  const uploadedMetadata = (await client.query('select name from storage.objects where bucket_id=$1 order by name',
    [restoreBucket])).rows.map(row => row.name);
  assert.deepEqual(uploadedMetadata, files.map(file => `${file.bucket_id}/${file.name}`),
    'restored_storage_api_metadata_mismatch');

  stage = 'verify';
  const result = await verify(manifest, sealed.manifestSha256, join(target, 'export.json'), objects(target));
  assert.equal(result.ok, true, 'restored_database_or_storage_mismatch');
  assert.equal(result.objectCount, files.length, 'storage_object_inventory_mismatch');
  process.stdout.write(`${JSON.stringify({ check: 'academy_hosted_database_and_storage_restore', outcome: 'passed',
    academyTables: result.tableCount, storageObjects: result.objectCount,
    restoredStorageMetadata: restoredMetadata.length, fixture,
    databaseBackupSha256: digest(await readFile(join(work, 'postgres.dump'))),
    scope: 'synthetic_hosted_supabase_fixture_only' })}\n`);
} catch (error) {
  // The ephemeral fixture can contain auth credentials. Report only bounded stage
  // and error class, never raw SQL, dumps, object paths, keys or response bodies.
  process.stderr.write(`${JSON.stringify({ check: 'academy_hosted_database_and_storage_restore', outcome: 'failed',
    stage, errorType: error?.name ?? 'Error' })}\n`);
  process.exitCode = 1;
} finally {
  if (targetClient) await targetClient.end().catch(() => {});
  if (sourceConnected) await client.end().catch(() => {});
  for (const name of [backupInContainer, restoredInContainer]) {
    try { docker('exec', container, 'rm', '-f', name); } catch { /* service may already be stopping */ }
  }
  await rm(work, { recursive: true, force: true });
}
