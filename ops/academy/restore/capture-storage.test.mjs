import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, lstat, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureStorage } from './capture-storage.mjs';
import { FORMAT, TABLES, seal } from './verify.mjs';

const projectRef = 'abcdefghijklmnopqrst';
const sourceUrl = `https://${projectRef}.supabase.co/`;
const key = 'synthetic-test-key';
const bytes = Buffer.from('%PDF-1.4\nrestore capture test\n');
const digest = value => createHash('sha256').update(value).digest('hex');

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'academy-capture-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const exportPath = join(directory, 'export.json');
  const objectsRoot = join(directory, 'objects');
  const path = 'course 1/asset/file.pdf';
  const tables = Object.fromEntries(TABLES.map(table => [table, []]));
  tables['public.course_materials'].push({ storage_path: path, status: 'ready', purged_at: null,
    size_bytes: bytes.length, sha256: digest(bytes) });
  const data = { format: FORMAT, schemaTables: [...TABLES],
    storageObjects: [{ bucket: 'academy-materials', path }], tables };
  await writeFile(exportPath, JSON.stringify(data));
  return { directory, exportPath, objectsRoot, data, path };
}

test('captures only inventoried bytes, keeps files private and seals offline', async t => {
  const f = await fixture(t);
  let requests = 0;
  const result = await captureStorage({ exportPath: f.exportPath, objectsRoot: f.objectsRoot,
    sourceUrl, projectRef, serviceKey: key, maxTotalBytes: bytes.length, fetchImpl: async (url, options) => {
      requests++;
      assert.equal(url.href, `${sourceUrl}storage/v1/object/authenticated/academy-materials/course%201/asset/file.pdf`);
      assert.equal(options.headers.Authorization, `Bearer ${key}`);
      assert.equal(options.redirect, 'error');
      return new Response(bytes);
    } });
  assert.equal(requests, 1);
  assert.deepEqual(result, { ok: true, tableCount: TABLES.length, objectCount: 1 });
  assert.equal((await lstat(f.objectsRoot)).mode & 0o777, 0o700);
  assert.equal((await lstat(join(f.objectsRoot, 'academy-materials', f.path))).mode & 0o777, 0o600);
  assert.deepEqual(await readFile(join(f.objectsRoot, 'academy-materials', f.path)), bytes);
  const sealed = await seal(f.exportPath, f.objectsRoot, join(f.directory, 'manifest.json'), 'pilot-20260924');
  assert.equal(sealed.objectCount, 1);
});

test('refuses wrong project and existing destination before network access', async t => {
  const f = await fixture(t);
  const fetchImpl = () => assert.fail('no network access expected');
  await assert.rejects(captureStorage({ exportPath: f.exportPath, objectsRoot: f.objectsRoot,
    sourceUrl: 'https://wrong-project.supabase.co/', projectRef, serviceKey: key, maxTotalBytes: bytes.length, fetchImpl }), /storage_project_mismatch/);
  await assert.rejects(captureStorage({ exportPath: f.exportPath, objectsRoot: f.objectsRoot,
    sourceUrl: `http://${projectRef}.supabase.co/`, projectRef, serviceKey: key, maxTotalBytes: bytes.length, fetchImpl }), /storage_project_mismatch/);
  await rm(f.objectsRoot, { recursive: true, force: true });
  await mkdir(f.objectsRoot);
  await assert.rejects(captureStorage({ exportPath: f.exportPath, objectsRoot: f.objectsRoot,
    sourceUrl, projectRef, serviceKey: key, maxTotalBytes: bytes.length, fetchImpl }), /EEXIST/);
});

test('rejects unsafe inventory before fetch and removes failed partial captures', async t => {
  const f = await fixture(t);
  f.data.storageObjects[0].path = '../other.pdf';
  await writeFile(f.exportPath, JSON.stringify(f.data));
  await assert.rejects(captureStorage({ exportPath: f.exportPath, objectsRoot: f.objectsRoot,
    sourceUrl, projectRef, serviceKey: key, maxTotalBytes: bytes.length, fetchImpl: () => assert.fail('no network access expected') }), /unsafe_object_path/);
  await assert.rejects(lstat(f.objectsRoot), /ENOENT/);
  f.data.storageObjects[0].path = f.path;
  await writeFile(f.exportPath, JSON.stringify(f.data));
  await assert.rejects(captureStorage({ exportPath: f.exportPath, objectsRoot: f.objectsRoot,
    sourceUrl, projectRef, serviceKey: key, maxTotalBytes: bytes.length, fetchImpl: async () => new Response('missing', { status: 404 }) }), /storage_download_failed/);
  await assert.rejects(lstat(f.objectsRoot), /ENOENT/);
});

test('detects changed ready-material bytes and erases partial output', async t => {
  const f = await fixture(t);
  await assert.rejects(captureStorage({ exportPath: f.exportPath, objectsRoot: f.objectsRoot,
    sourceUrl, projectRef, serviceKey: key, maxTotalBytes: bytes.length, fetchImpl: async () => new Response('tampered') }), /material_size_mismatch|material_digest_mismatch/);
  await assert.rejects(lstat(f.objectsRoot), /ENOENT/);
});

test('enforces operator egress budget and removes partial bytes', async t => {
  const f = await fixture(t);
  await assert.rejects(captureStorage({ exportPath: f.exportPath, objectsRoot: f.objectsRoot,
    sourceUrl, projectRef, serviceKey: key, maxTotalBytes: bytes.length - 1,
    fetchImpl: async () => new Response(bytes) }), /egress_limit_reached/);
  await assert.rejects(lstat(f.objectsRoot), /ENOENT/);
  await assert.rejects(captureStorage({ exportPath: f.exportPath, objectsRoot: f.objectsRoot,
    sourceUrl, projectRef, serviceKey: key, fetchImpl: () => assert.fail('no network access expected') }), /egress_limit_required/);
});
