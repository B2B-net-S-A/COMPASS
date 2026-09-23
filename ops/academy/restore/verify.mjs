#!/usr/bin/env node
// Offline, read-only comparison of an Academy database export and Storage bytes.
// This deliberately has no database client, credentials, or network operations.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const FORMAT = 'compass-academy-restore-v2';
export const TABLES = Object.freeze([
  'academy_private.run_contributors', 'academy_private.run_obligations', 'academy_private.version_contributors',
  'public.academy_attendance_reports', 'public.academy_audit_events', 'public.academy_completion_revocations',
  'public.academy_completion_rewards', 'public.academy_integration_jobs', 'public.academy_learning_streaks',
  'public.academy_legacy_reviews', 'public.academy_m365_identities', 'public.academy_notification_receipts',
  'public.academy_organizers', 'public.academy_reward_claims', 'public.academy_rollout_settings',
  'public.academy_session_integrations', 'public.academy_user_capabilities', 'public.course_answers',
  'public.course_completions', 'public.course_enrollments', 'public.course_lessons', 'public.course_materials',
  'public.course_questions', 'public.course_quiz_attempts', 'public.course_quiz_options',
  'public.course_quiz_questions', 'public.course_ratings', 'public.course_run_registrations',
  'public.course_run_staff', 'public.course_runs', 'public.course_sessions', 'public.course_staff',
  'public.course_survey_responses', 'public.course_versions', 'public.courses',
  'public.learning_path_courses', 'public.learning_path_enrollments', 'public.learning_paths',
  'public.session_attendance',
]);
const BUCKETS = new Set(['academy-materials', 'documents']);
const MAX_EXPORT_BYTES = 128 * 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const isHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

function fail(code) { throw new Error(code); }
function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (plainObject(value)) return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  if (value === null || ['string', 'boolean'].includes(typeof value)) return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) return JSON.stringify(value);
  fail('unsupported_or_unsafe_json_value');
}
function safeName(name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || name.split('/').some(s => !s || s === '.' || s === '..')) fail('unsafe_object_path');
  return name;
}
async function regularDirectory(path) {
  const info = await lstat(path).catch(() => fail('directory_missing'));
  if (!info.isDirectory() || info.isSymbolicLink()) fail('directory_not_regular');
}
async function parseJson(path, maxBytes = MAX_EXPORT_BYTES) {
  const info = await lstat(path).catch(() => fail('input_missing'));
  if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) fail('input_not_regular_or_too_large');
  let bytes = await readFile(path);
  try { return { value: JSON.parse(bytes.toString('utf8')), sha256: digest(bytes) }; }
  catch { fail('invalid_json'); }
}
function validateExport(data) {
  if (!plainObject(data) || data.format !== FORMAT || !plainObject(data.tables) || Object.keys(data.tables).length !== TABLES.length) fail('invalid_export_tables');
  if (!Array.isArray(data.schemaTables) || canonical(data.schemaTables) !== canonical(TABLES)) fail('academy_schema_inventory_changed');
  if (!Array.isArray(data.storageObjects)) fail('storage_inventory_missing');
  for (const table of TABLES) if (!Array.isArray(data.tables[table])) fail(`missing_or_invalid_table:${table}`);
  for (const name of Object.keys(data.tables)) if (!TABLES.includes(name)) fail('unexpected_table');
  return data;
}
function validateStorageInventory(data, objects) {
  const expected = new Set();
  for (const entry of data.storageObjects) {
    if (!plainObject(entry) || canonical(Object.keys(entry).sort()) !== canonical(['bucket', 'path']) ||
      (entry.bucket !== 'academy-materials' && entry.bucket !== 'documents') || typeof entry.path !== 'string') fail('invalid_storage_inventory');
    const path = safeName(entry.path);
    if (entry.bucket === 'documents' && !path.startsWith('courses/')) fail('invalid_storage_inventory');
    const key = `${entry.bucket}/${path}`;
    if (expected.has(key)) fail('duplicate_storage_inventory');
    expected.add(key);
  }
  const actual = new Set(objects.map(object => `${object.bucket}/${object.path}`));
  for (const key of expected) if (!actual.has(key)) fail('storage_inventory_bytes_missing');
  for (const key of actual) if (!expected.has(key)) fail('storage_bytes_without_metadata');
}
function rowSummaries(data) {
  return Object.fromEntries(TABLES.map(table => {
    const hashes = data.tables[table].map(row => {
      if (!plainObject(row)) fail(`invalid_row:${table}`);
      return digest(canonical(row));
    }).sort();
    return [table, { count: hashes.length, sha256: digest(JSON.stringify(hashes)) }];
  }));
}
async function objectInfo(path) {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink()) fail('object_not_regular');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const after = await lstat(path);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail('object_changed_during_read');
  return { sizeBytes: before.size, sha256: hash.digest('hex') };
}
async function listObjects(root) {
  await regularDirectory(root);
  const result = [];
  async function walk(bucket, path, prefix) {
    const names = (await readdir(path)).sort();
    for (const segment of names) {
      const name = safeName(prefix ? `${prefix}/${segment}` : segment);
      const item = join(path, segment);
      const info = await lstat(item);
      if (info.isSymbolicLink()) fail('object_symlink_forbidden');
      if (info.isDirectory()) await walk(bucket, item, name);
      else if (info.isFile()) result.push({ bucket, path: name, ...await objectInfo(item) });
      else fail('non_file_storage_entry');
    }
  }
  await regularDirectory(join(root, 'academy-materials'));
  await regularDirectory(join(root, 'documents'));
  await walk('academy-materials', join(root, 'academy-materials'), '');
  const legacy = join(root, 'documents', 'courses');
  const legacyInfo = await lstat(legacy).catch(error => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (legacyInfo) {
    if (!legacyInfo.isDirectory() || legacyInfo.isSymbolicLink()) fail('legacy_directory_not_regular');
    await walk('documents', legacy, 'courses');
  }
  return result.sort((a, b) => `${a.bucket}/${a.path}`.localeCompare(`${b.bucket}/${b.path}`));
}
function references(data, objects) {
  const keys = new Map(objects.map(o => [`${o.bucket}/${o.path}`, o]));
  const materials = data.tables['public.course_materials'];
  for (const asset of materials) {
    const path = safeName(asset.storage_path);
    const file = keys.get(`academy-materials/${path}`);
    if (asset.status === 'ready' && asset.purged_at == null && !file) fail('ready_material_bytes_missing');
    if (asset.status === 'ready' && asset.purged_at == null && !isHash(asset.sha256)) fail('ready_material_digest_missing');
    if (asset.status === 'ready' && asset.purged_at == null && asset.size_bytes !== file.sizeBytes) fail('material_size_mismatch');
    if (file && asset.sha256 != null && asset.sha256 !== file.sha256) fail('material_digest_mismatch');
  }
  const materialPaths = new Set(materials.map(asset => asset.storage_path));
  for (const lesson of data.tables['public.course_lessons']) {
    const attachments = lesson.attachments ?? [];
    if (!Array.isArray(attachments)) fail('invalid_lesson_attachments');
    for (const item of attachments) {
      if (!plainObject(item) || typeof item.storage_path !== 'string') fail('invalid_lesson_attachment');
      const path = safeName(item.storage_path);
      const bucket = materialPaths.has(path) ? 'academy-materials' : 'documents';
      if (!BUCKETS.has(bucket) || (bucket === 'documents' && !path.startsWith('courses/')) || !keys.has(`${bucket}/${path}`)) fail('lesson_attachment_bytes_missing');
    }
  }
}
export async function snapshot(exportPath, objectsRoot) {
  const data = validateExport((await parseJson(exportPath)).value);
  const objects = await listObjects(objectsRoot);
  references(data, objects);
  validateStorageInventory(data, objects);
  return { tables: rowSummaries(data), objects };
}
export async function seal(exportPath, objectsRoot, manifestPath, snapshotId) {
  if (typeof snapshotId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{3,99}$/.test(snapshotId)) fail('invalid_snapshot_id');
  const state = await snapshot(exportPath, objectsRoot);
  const manifest = { format: FORMAT, snapshotId, ...state };
  const bytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(manifestPath, bytes, { flag: 'wx', mode: 0o600 });
  return { manifestSha256: digest(bytes), tableCount: TABLES.length, objectCount: state.objects.length };
}
function validManifest(manifest) {
  if (!plainObject(manifest) || manifest.format !== FORMAT || !plainObject(manifest.tables) || !Array.isArray(manifest.objects) || Object.keys(manifest.tables).length !== TABLES.length) fail('invalid_manifest');
  if (typeof manifest.snapshotId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{3,99}$/.test(manifest.snapshotId)) fail('invalid_manifest_snapshot');
  for (const name of Object.keys(manifest.tables)) if (!TABLES.includes(name)) fail('unexpected_manifest_table');
  for (const table of TABLES) {
    const item = manifest.tables[table];
    if (!plainObject(item) || !Number.isSafeInteger(item.count) || item.count < 0 || !isHash(item.sha256)) fail('invalid_manifest_table');
  }
  for (const object of manifest.objects) {
    if (!BUCKETS.has(object.bucket) || safeName(object.path) !== object.path || !Number.isSafeInteger(object.sizeBytes) || object.sizeBytes < 0 || !isHash(object.sha256)) fail('invalid_manifest_object');
  }
  return manifest;
}
export async function verify(manifestPath, expectedSha256, exportPath, objectsRoot) {
  if (!isHash(expectedSha256)) fail('expected_manifest_sha256_required');
  const parsed = await parseJson(manifestPath);
  if (parsed.sha256 !== expectedSha256) fail('manifest_seal_mismatch');
  const expected = validManifest(parsed.value);
  const actual = await snapshot(exportPath, objectsRoot);
  const tableMismatches = TABLES.filter(name => expected.tables[name].count !== actual.tables[name].count || expected.tables[name].sha256 !== actual.tables[name].sha256);
  const objectMismatches = [];
  const expectedObjects = new Map(expected.objects.map(o => [`${o.bucket}/${o.path}`, o]));
  const actualObjects = new Map(actual.objects.map(o => [`${o.bucket}/${o.path}`, o]));
  if (expectedObjects.size !== expected.objects.length) fail('duplicate_manifest_object');
  for (const [key, object] of expectedObjects) {
    const restored = actualObjects.get(key);
    if (!restored || restored.sizeBytes !== object.sizeBytes || restored.sha256 !== object.sha256) objectMismatches.push(digest(key));
  }
  for (const key of actualObjects.keys()) if (!expectedObjects.has(key)) objectMismatches.push(digest(key));
  return { ok: tableMismatches.length === 0 && objectMismatches.length === 0, snapshotId: expected.snapshotId,
    tableCount: TABLES.length, objectCount: expected.objects.length, tableMismatches,
    objectMismatchKeyHashes: [...new Set(objectMismatches)].sort() };
}
function argsToObject(argv) {
  const [command, ...rest] = argv;
  if (!['seal', 'verify'].includes(command) || rest.length % 2) fail('usage: seal|verify --export PATH --objects DIR [--manifest PATH] [--snapshot-id ID] [--expected-sha256 HASH]');
  const args = {};
  for (let i = 0; i < rest.length; i += 2) {
    if (!rest[i].startsWith('--') || args[rest[i]]) fail('invalid_or_duplicate_argument');
    args[rest[i]] = rest[i + 1];
  }
  const allowed = command === 'seal' ? ['--export', '--objects', '--manifest', '--snapshot-id'] : ['--export', '--objects', '--manifest', '--expected-sha256'];
  if (Object.keys(args).some(key => !allowed.includes(key)) || allowed.some(key => !args[key])) fail('missing_or_unknown_argument');
  return { command, args };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { command, args } = argsToObject(process.argv.slice(2));
    const result = command === 'seal'
      ? await seal(args['--export'], args['--objects'], args['--manifest'], args['--snapshot-id'])
      : await verify(args['--manifest'], args['--expected-sha256'], args['--export'], args['--objects']);
    process.stdout.write(JSON.stringify(result) + '\n');
    if (result.ok === false) process.exitCode = 1;
  } catch (error) {
    const code = typeof error?.message === 'string' && /^[a-z0-9_:.]+$/.test(error.message) ? error.message : 'io_or_input_error';
    process.stderr.write(JSON.stringify({ ok: false, error: code }) + '\n');
    process.exitCode = 1;
  }
}
