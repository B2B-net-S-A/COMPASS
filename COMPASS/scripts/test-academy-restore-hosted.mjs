// Hosted-only backup/restore exercise over the disposable native Supabase fixture.
// This proves a real PostgreSQL dump/restore and Storage API byte transfer in CI;
// it does not inspect or restore production backups.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
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
const sourceStorageContainer = 'supabase_storage_academy-storage-ci';
const targetStorageContainer = `academy_restore_storage_${randomUUID().replaceAll('-', '')}`;
const targetStorageVolume = `academy_restore_files_${randomUUID().replaceAll('-', '')}`;
const client = new pg.Client({ connectionString: settings.database });
const service = createClient(settings.api, settings.service, { auth: { persistSession: false, autoRefreshToken: false } });
const exportSql = await readFile(new URL('../../ops/academy/restore/export.sql', import.meta.url), 'utf8');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const safeName = name => typeof name === 'string' && name && !name.includes('\\') && !name.includes('\0') && !name.startsWith('/')
  && name.split('/').every(part => part && part !== '.' && part !== '..');
const docker = (...args) => execFileSync('docker', args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 });
const objects = area => join(area, 'objects');
const storagePath = (bucket, name) => `${bucket}/${name.split('/').map(encodeURIComponent).join('/')}`;
const inspectContainer = name => JSON.parse(docker('inspect', name).toString('utf8'))[0];
const targetStorageHeaders = () => ({ Authorization: `Bearer ${settings.service}`, apikey: settings.service });

async function startTargetStorage() {
  assert(/^academy_restore_[a-f0-9]{32}$/.test(targetName), 'isolated_restore_database_required');
  const sourceInfo = inspectContainer(sourceStorageContainer);
  const dbInfo = inspectContainer(container);
  const network = Object.keys(sourceInfo.NetworkSettings.Networks).find(name => dbInfo.NetworkSettings.Networks[name]);
  assert(network, 'isolated_storage_database_network_missing');
  const env = new Map(sourceInfo.Config.Env.map(entry => {
    const separator = entry.indexOf('=');
    assert(separator > 0 && !entry.includes('\n'), 'invalid_storage_container_environment');
    return [entry.slice(0, separator), entry.slice(separator + 1)];
  }));
  assert(env.get('STORAGE_BACKEND') === 'file', 'isolated_file_storage_required');
  const fileRoot = env.get('STORAGE_FILE_BACKEND_PATH') ?? env.get('FILE_STORAGE_BACKEND_PATH');
  assert(fileRoot?.startsWith('/') && fileRoot !== '/', 'isolated_file_storage_path_required');
  const databaseUrl = new URL(env.get('DATABASE_URL'));
  const dbAliases = new Set([dbInfo.Name.replace(/^\//, ''), ...(dbInfo.NetworkSettings.Networks[network].Aliases ?? [])]);
  assert(['postgres:', 'postgresql:'].includes(databaseUrl.protocol) &&
    dbAliases.has(databaseUrl.hostname) && databaseUrl.pathname === '/postgres',
  'source_storage_database_not_local_fixture');
  databaseUrl.pathname = `/${targetName}`;
  env.set('DATABASE_URL', databaseUrl.href);
  for (const key of ['DATABASE_POOL_URL', 'DATABASE_MULTITENANT_URL', 'VECTOR_DATABASE_URL']) {
    if (!env.has(key)) continue;
    const alternateUrl = new URL(env.get(key));
    assert(['postgres:', 'postgresql:'].includes(alternateUrl.protocol) &&
      dbAliases.has(alternateUrl.hostname) && alternateUrl.pathname === '/postgres',
    'alternate_storage_database_url_not_local_fixture');
    alternateUrl.pathname = `/${targetName}`;
    env.set(key, alternateUrl.href);
  }
  env.set('DB_INSTALL_ROLES', 'false');
  env.set('DB_ALLOW_MIGRATION_REFRESH', 'false');
  const containerPort = Number(env.get('SERVER_PORT') ?? env.get('PORT') ?? 5000);
  assert(Number.isInteger(containerPort) && containerPort > 0 && containerPort < 65536, 'invalid_storage_container_port');
  const envFile = join(work, 'target-storage.env');
  await writeFile(envFile, [...env].map(([key, value]) => `${key}=${value}`).join('\n') + '\n', { mode: 0o600 });
  docker('volume', 'create', targetStorageVolume);
  try {
    docker('run', '--detach', '--pull=never', '--name', targetStorageContainer, '--network', network,
      '--env-file', envFile, '--mount', `type=volume,source=${targetStorageVolume},target=${fileRoot}`,
      '--publish', `127.0.0.1::${containerPort}`, sourceInfo.Config.Image);
  } finally {
    await rm(envFile, { force: true });
  }
  const published = docker('port', targetStorageContainer, `${containerPort}/tcp`).toString('utf8').trim();
  const match = /^127\.0\.0\.1:(\d+)$/.exec(published);
  assert(match, 'isolated_storage_loopback_port_required');
  const baseUrl = `http://127.0.0.1:${match[1]}`;
  let lastHttpStatus;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/bucket`, {
        headers: targetStorageHeaders(), redirect: 'error', signal: AbortSignal.timeout(2000),
      });
      lastHttpStatus = response.status;
      if (response.ok) return baseUrl;
    } catch { /* The disposable service may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const state = spawnSync('docker', ['inspect', '--format', '{{.State.Running}} {{.State.ExitCode}}',
    targetStorageContainer], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  const logs = spawnSync('docker', ['logs', '--tail', '100', targetStorageContainer],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 });
  const boundedLogs = `${logs.stdout ?? ''}\n${logs.stderr ?? ''}`.slice(-65536);
  const cause = /password authentication failed/i.test(boundedLogs) ? 'database_authentication'
    : /database .* does not exist/i.test(boundedLogs) ? 'database_missing'
    : /permission denied/i.test(boundedLogs) ? 'database_permission'
    : /migration/i.test(boundedLogs) ? 'storage_migration'
    : 'unclassified';
  const failure = new Error('isolated_storage_unavailable');
  failure.storageHttpStatus = lastHttpStatus;
  failure.storageContainerState = /^(true|false) (\d+)$/.exec(state.stdout?.trim() ?? '')?.slice(1);
  failure.storageStartupCategory = cause;
  failure.storageLogSha256 = boundedLogs ? digest(Buffer.from(boundedLogs)) : undefined;
  throw failure;
}

async function targetStorageResponse(baseUrl, bucket, name, method = 'GET', bytes, mime) {
  assert(['academy-materials', 'documents'].includes(bucket) && safeName(name), 'unsafe_storage_object_path');
  const url = `${baseUrl}/object/${method === 'GET' ? 'authenticated/' : ''}${storagePath(bucket, name)}`;
  return fetch(url, {
    method,
    headers: { ...targetStorageHeaders(), ...(method === 'POST' ? {
      'x-upsert': 'true', 'cache-control': 'max-age=3600', 'content-type': mime ?? 'application/octet-stream',
    } : {}) },
    ...(bytes ? { body: bytes } : {}), redirect: 'error', signal: AbortSignal.timeout(30000),
  });
}
function safeFailure(error) {
  const stderr = Buffer.isBuffer(error?.stderr) ? error.stderr.toString('utf8') : '';
  const safeAssertions = new Set(['isolated_restore_database_required', 'isolated_storage_database_network_missing',
    'invalid_storage_container_environment', 'isolated_file_storage_required',
    'isolated_file_storage_path_required', 'source_storage_database_not_local_fixture',
    'alternate_storage_database_url_not_local_fixture', 'invalid_storage_container_port',
    'isolated_storage_loopback_port_required']);
  const missingSchema = /schema "([a-z_][a-z0-9_]*)" does not exist/i.exec(stderr)?.[1];
  const knownSchemas = new Set(['auth', 'storage', 'extensions', 'vault', 'graphql_public', 'realtime',
    'supabase_migrations', 'public', 'academy_private', 'cron', 'net', 'graphql']);
  const deniedSchema = /permission denied for schema ([a-z_][a-z0-9_]*)/i.exec(stderr)?.[1];
  const deniedExtension = /permission denied to create extension "([a-z_][a-z0-9_-]*)"/i.exec(stderr)?.[1];
  const knownExtensions = new Set(['vector', 'pg_graphql', 'pg_net', 'pgcrypto', 'uuid-ossp',
    'pg_stat_statements', 'pgjwt', 'supabase_vault', 'wrappers', 'http']);
  const command = /Command was:\s*(?:--[^\n]*\n\s*)*(CREATE|ALTER|COMMENT ON|SECURITY LABEL FOR)\s+(EXTENSION|SCHEMA|EVENT TRIGGER|FUNCTION|TABLE|POLICY|TRIGGER|TYPE|VIEW|MATERIALIZED VIEW|INDEX)/i.exec(stderr);
  const classes = [
    ['archive_unreadable', /could not open input file|permission denied.*\.dump/i],
    ['authentication_failed', /password authentication failed|peer authentication failed|not permitted to log in/i],
    ['missing_role', /role .{0,120} does not exist/i],
    ['missing_extension', /extension .{0,120} is not available/i],
    ['missing_schema', /schema .{0,120} does not exist/i],
    ['superuser_required', /must be superuser|superuser is required/i],
    ['missing_relation', /relation .{0,120} does not exist/i],
    ['missing_function', /function .{0,120} does not exist/i],
    ['object_conflict', /already exists|duplicate key/i],
    ['permission_denied', /permission denied/i],
    ['restore_sql_error', /could not execute query/i],
  ];
  return {
    errorType: error?.name ?? 'Error',
    assertion: error?.name === 'AssertionError' && safeAssertions.has(error.message) ? error.message : undefined,
    storageHttpStatus: Number.isInteger(error?.storageHttpStatus) ? error.storageHttpStatus : undefined,
    storageContainerState: Array.isArray(error?.storageContainerState) ? error.storageContainerState : undefined,
    storageStartupCategory: ['database_authentication', 'database_missing', 'database_permission',
      'storage_migration', 'unclassified'].includes(error?.storageStartupCategory)
      ? error.storageStartupCategory : undefined,
    storageLogSha256: /^[a-f0-9]{64}$/.test(error?.storageLogSha256 ?? '') ? error.storageLogSha256 : undefined,
    sqlState: typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : undefined,
    childExitCode: Number.isInteger(error?.status) ? error.status : undefined,
    category: classes.find(([, pattern]) => pattern.test(stderr))?.[0] ?? 'unclassified',
    missingSchema: missingSchema && knownSchemas.has(missingSchema) ? missingSchema : undefined,
    deniedSchema: deniedSchema && knownSchemas.has(deniedSchema) ? deniedSchema : undefined,
    deniedExtension: deniedExtension && knownExtensions.has(deniedExtension) ? deniedExtension : undefined,
    restoreCommand: command ? `${command[1].toLowerCase()}_${command[2].toLowerCase().replaceAll(' ', '_')}` : undefined,
    stderrSha256: stderr ? digest(Buffer.from(stderr)) : undefined,
  };
}

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
let restoreRoleCapabilities;
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

  stage = 'source_export';
  await exportDatabase(client, join(source, 'export.json'));
  stage = 'source_storage_download';
  for (const file of files) await putObject(source, file.bucket_id, file.name, await storageBytes(file.bucket_id, file.name));
  stage = 'source_manifest';
  const manifest = join(work, 'source-manifest.json');
  const sealed = await seal(join(source, 'export.json'), objects(source), manifest, `hosted-${randomUUID()}`);
  assert(sealed.objectCount > 0, 'source_manifest_empty');

  stage = 'postgres_backup';
  docker('exec', container, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '--format=custom', '--no-owner', '--no-acl', '-f', backupInContainer);
  docker('cp', `${container}:${backupInContainer}`, join(work, 'postgres.dump'));
  assert((await fs.promises.stat(join(work, 'postgres.dump'))).size > 0, 'postgres_backup_empty');

  stage = 'restore_database_create';
  await client.query(`CREATE DATABASE ${targetName} TEMPLATE template0`);
  const targetUrl = new URL(settings.database); targetUrl.pathname = `/${targetName}`;
  targetClient = new pg.Client({ connectionString: targetUrl.href });
  stage = 'restore_target_public_check';
  await targetClient.connect();
  // template0 supplies public; pg_dump omits its CREATE SCHEMA entry. Keep it
  // while restoring into this otherwise empty database.
  const publicSchema = await targetClient.query("select to_regnamespace('public') is not null as present");
  assert.equal(publicSchema.rows[0]?.present, true, 'restore_public_schema_missing');
  stage = 'restore_archive_copy';
  docker('cp', join(work, 'postgres.dump'), `${container}:${restoredInContainer}`);
  stage = 'restore_role_capabilities';
  restoreRoleCapabilities = (await client.query(`select rolname, rolsuper, rolcreatedb, rolcanlogin,
      pg_has_role('postgres', oid, 'MEMBER') as postgres_member
    from pg_roles where rolname in ('postgres', 'supabase_admin') order by rolname`)).rows;
  assert(restoreRoleCapabilities.some(role => role.rolname === 'supabase_admin' && role.rolsuper && role.rolcanlogin),
    'isolated_restore_admin_unavailable');
  stage = 'restore_admin_connection_probe';
  const restoreIdentity = docker('exec', container, 'psql', '-U', 'supabase_admin', '-d', targetName,
    '-X', '-A', '-t', '-c', 'select current_user').toString('utf8').trim();
  assert.equal(restoreIdentity, 'supabase_admin', 'isolated_restore_admin_connection_required');
  stage = 'restore_archive_apply';
  // The local Supabase postgres role is not a superuser. Its platform dump
  // contains privileged native functions, so use the local-only admin socket
  // in this disposable target; no admin credential leaves the container.
  docker('exec', container, 'pg_restore', '-U', 'supabase_admin', '-d', targetName,
    '--no-owner', '--no-acl', '--exit-on-error', restoredInContainer);
  stage = 'restore_read_grants';
  docker('exec', container, 'psql', '-U', 'supabase_admin', '-d', targetName,
    '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c',
    'GRANT USAGE ON SCHEMA public, academy_private, storage TO postgres; GRANT SELECT ON ALL TABLES IN SCHEMA public, academy_private, storage TO postgres');
  stage = 'restore_database_connect';
  await targetClient.query('SELECT 1');
  stage = 'restore_metadata_check';
  const restoredMetadata = (await targetClient.query(`select bucket_id,name
    from storage.objects where bucket_id='academy-materials'
       or (bucket_id='documents' and name like 'courses/%')
    order by bucket_id,name`)).rows;
  assert.deepEqual(restoredMetadata, files.map(({ bucket_id, name }) => ({ bucket_id, name })),
    'restored_storage_metadata_mismatch');
  stage = 'isolated_storage_start';
  const sourceMetadataBefore = (await client.query(`select bucket_id,name,version,metadata,owner_id,updated_at
    from storage.objects where bucket_id='academy-materials'
       or (bucket_id='documents' and name like 'courses/%') order by bucket_id,name`)).rows;
  const targetStorageUrl = await startTargetStorage();
  stage = 'target_storage_empty_before_restore';
  for (const file of files) {
    const response = await targetStorageResponse(targetStorageUrl, file.bucket_id, file.name);
    assert.equal(response.status, 404, 'target_storage_not_isolated_from_source_bytes');
    await response.arrayBuffer();
  }

  stage = 'storage_restore';
  // The full DB restore includes storage.objects metadata. The Academy guard
  // rejects overwriting ready files, so bypass it only in this disposable DB.
  docker('exec', container, 'psql', '-U', 'supabase_admin', '-d', targetName,
    '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c',
    'ALTER TABLE storage.objects DISABLE TRIGGER academy_stored_material_guard');
  try {
    for (const file of files) {
      const bytes = await readFile(join(objects(source), file.bucket_id, file.name));
      const uploaded = await targetStorageResponse(targetStorageUrl, file.bucket_id, file.name,
        'POST', bytes, file.mime);
      assert(uploaded.ok, `target_storage_upload_failed_${uploaded.status}`);
      await uploaded.arrayBuffer();
    }
  } finally {
    docker('exec', container, 'psql', '-U', 'supabase_admin', '-d', targetName,
      '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-c',
      'ALTER TABLE storage.objects ENABLE TRIGGER academy_stored_material_guard');
  }
  stage = 'target_storage_guard_check';
  const guard = (await targetClient.query(`select tgenabled from pg_trigger
    where tgrelid='storage.objects'::regclass and tgname='academy_stored_material_guard'`)).rows;
  assert.deepEqual(guard, [{ tgenabled: 'O' }], 'restored_storage_guard_not_enabled');
  const uploadedMetadata = (await targetClient.query(`select bucket_id,name from storage.objects
    where bucket_id='academy-materials' or (bucket_id='documents' and name like 'courses/%')
    order by bucket_id,name`)).rows;
  assert.deepEqual(uploadedMetadata, files.map(({ bucket_id, name }) => ({ bucket_id, name })),
    'restored_storage_api_metadata_mismatch');
  stage = 'target_storage_download';
  for (const file of files) {
    const response = await targetStorageResponse(targetStorageUrl, file.bucket_id, file.name);
    assert(response.ok, `target_storage_download_failed_${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const original = await readFile(join(objects(source), file.bucket_id, file.name));
    assert.equal(digest(bytes), digest(original), 'restored_storage_bytes_mismatch');
    await putObject(target, file.bucket_id, file.name, bytes);
    assert.equal(digest(await storageBytes(file.bucket_id, file.name)), digest(original),
      'source_storage_bytes_changed');
  }
  const sourceMetadataAfter = (await client.query(`select bucket_id,name,version,metadata,owner_id,updated_at
    from storage.objects where bucket_id='academy-materials'
       or (bucket_id='documents' and name like 'courses/%') order by bucket_id,name`)).rows;
  assert.deepEqual(sourceMetadataAfter, sourceMetadataBefore, 'source_storage_metadata_changed');
  stage = 'restore_export';
  await exportDatabase(targetClient, join(target, 'export.json'));

  stage = 'verify';
  const result = await verify(manifest, sealed.manifestSha256, join(target, 'export.json'), objects(target));
  assert.equal(result.ok, true, 'restored_database_or_storage_mismatch');
  assert.equal(result.objectCount, files.length, 'storage_object_inventory_mismatch');
  process.stdout.write(`${JSON.stringify({ check: 'academy_hosted_database_and_storage_restore', outcome: 'passed',
    academyTables: result.tableCount, storageObjects: result.objectCount,
    restoredStorageMetadata: restoredMetadata.length, targetStorageReadsFromOriginalPaths: files.length, fixture,
    databaseBackupSha256: digest(await readFile(join(work, 'postgres.dump'))),
    scope: 'synthetic_hosted_supabase_fixture_only' })}\n`);
} catch (error) {
  // The ephemeral fixture can contain auth credentials. Report only bounded stage
  // and error class/fingerprint, never raw SQL, dumps, object paths, keys or response bodies.
  process.stderr.write(`${JSON.stringify({ check: 'academy_hosted_database_and_storage_restore', outcome: 'failed',
    stage, ...safeFailure(error), ...(['restore_admin_connection_probe', 'restore_archive_apply', 'restore_read_grants']
      .includes(stage) ? { restoreRoleCapabilities } : {}) })}\n`);
  process.exitCode = 1;
} finally {
  try { docker('rm', '--force', targetStorageContainer); } catch { /* disposable container may not exist */ }
  try { docker('volume', 'rm', '--force', targetStorageVolume); } catch { /* disposable volume may not exist */ }
  if (targetClient) await targetClient.end().catch(() => {});
  if (sourceConnected) await client.end().catch(() => {});
  for (const name of [backupInContainer, restoredInContainer]) {
    try { docker('exec', container, 'rm', '-f', name); } catch { /* service may already be stopping */ }
  }
  await rm(work, { recursive: true, force: true });
}
