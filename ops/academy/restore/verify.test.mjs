import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FORMAT, TABLES, seal, verify } from './verify.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const script = fileURLToPath(new URL('./verify.mjs', import.meta.url));

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'academy-restore-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  const restored = join(root, 'restored');
  const bytes = Buffer.from('%PDF-1.4\nacademy fixture\n');
  const oldBytes = Buffer.from('%PDF-1.4\nlegacy fixture\n');
  const data = () => {
    const tables = Object.fromEntries(TABLES.map(name => [name, []]));
    tables['public.courses'].push({ id: 'course-1', slug: 'academy-pilot' });
    tables['public.course_versions'].push({ id: 'version-1', course_id: 'course-1', status: 'published' });
    tables['public.course_materials'].push({ id: 'asset-1', storage_path: 'course-1/asset-1/file.pdf', status: 'ready', purged_at: null, size_bytes: bytes.length, sha256: hash(bytes) });
    tables['public.course_lessons'].push({ id: 'lesson-1', version_id: 'version-1', attachments: [
      { asset_id: 'asset-1', storage_path: 'course-1/asset-1/file.pdf' },
      { storage_path: 'courses/old-course/file.pdf' },
    ] });
    tables['public.course_enrollments'].push({ id: 'enrollment-1', version_id: 'version-1' });
    tables['public.course_completions'].push({ id: 'completion-1', enrollment_id: 'enrollment-1', certificate_snapshot: { certificate_hash: 'abc' } });
    tables['public.session_attendance'].push({ session_id: 'session-1', enrollment_id: 'enrollment-1', status: 'present' });
    return { format: FORMAT, schemaTables: [...TABLES], tables };
  };
  async function writeExport(area, exportData) {
    await writeFile(join(area, 'export.json'), JSON.stringify(exportData));
  }
  async function writeObject(area, bucket, path, content) {
    const file = join(area, 'objects', bucket, path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  for (const area of [source, restored]) {
    await mkdir(join(area, 'objects', 'academy-materials'), { recursive: true });
    await mkdir(join(area, 'objects', 'documents'), { recursive: true });
    await writeObject(area, 'academy-materials', 'course-1/asset-1/file.pdf', bytes);
    await writeObject(area, 'documents', 'courses/old-course/file.pdf', oldBytes);
    await writeExport(area, data());
  }
  return { root, source, restored, bytes, oldBytes, data, writeExport, writeObject,
    manifest: join(root, 'manifest.json'), exportPath: area => join(area, 'export.json'), objectsPath: area => join(area, 'objects') };
}

test('seals source and verifies exact DB rows plus both Storage buckets', async t => {
  const f = await fixture(t);
  const sealed = await seal(f.exportPath(f.source), f.objectsPath(f.source), f.manifest, 'pilot-20260923');
  const result = await verify(f.manifest, sealed.manifestSha256, f.exportPath(f.restored), f.objectsPath(f.restored));
  assert.equal(result.ok, true);
  assert.equal(result.objectCount, 2);
  assert.equal(result.tableCount, TABLES.length);
  assert.deepEqual(result.tableMismatches, []);
  assert.equal((await readFile(f.manifest, 'utf8')).includes('academy fixture'), false);
});

test('table export SQL covers the verifier inventory and is a read-only transaction', async () => {
  const sql = await readFile(new URL('./export.sql', import.meta.url), 'utf8');
  assert.match(sql, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;/);
  assert.match(sql, /'schemaTables'/);
  assert.match(sql, /COMMIT;/);
  const exported = [...sql.matchAll(/^    '((?:public|academy_private)\.[a-z0-9_]+)', coalesce\(/gm)].map(match => match[1]);
  assert.deepEqual(exported, TABLES);
  // `courses` is the only Academy course table without the `course_` prefix.
  assert.match(sql, /c\.relname\s*=\s*'courses'/);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|CREATE|DROP|TRUNCATE)\b/i);
});

test('normalizes database row and JSON key order while preserving row multiplicity', async t => {
  const f = await fixture(t);
  const same = f.data();
  same.tables['public.courses'][0] = { slug: 'academy-pilot', id: 'course-1' };
  same.tables['public.course_questions'] = [{ id: 'question-2' }, { id: 'question-1' }];
  await f.writeExport(f.source, { ...f.data(), tables: { ...f.data().tables, 'public.course_questions': [{ id: 'question-1' }, { id: 'question-2' }] } });
  // Reseal after adding the same two records to source in reverse order.
  const manifest2 = join(f.root, 'manifest2.json');
  const sealed2 = await seal(f.exportPath(f.source), f.objectsPath(f.source), manifest2, 'pilot-20260923');
  await f.writeExport(f.restored, same);
  const result = await verify(manifest2, sealed2.manifestSha256, f.exportPath(f.restored), f.objectsPath(f.restored));
  assert.equal(result.ok, true);
  same.tables['public.course_questions'].push({ id: 'question-1' });
  await f.writeExport(f.restored, same);
  assert.deepEqual((await verify(manifest2, sealed2.manifestSha256, f.exportPath(f.restored), f.objectsPath(f.restored))).tableMismatches, ['public.course_questions']);
});

test('detects changed completion and attendance evidence without disclosing row values', async t => {
  const f = await fixture(t);
  const sealed = await seal(f.exportPath(f.source), f.objectsPath(f.source), f.manifest, 'pilot-20260923');
  const changed = f.data();
  changed.tables['public.course_completions'][0].certificate_snapshot.certificate_hash = 'changed';
  changed.tables['public.session_attendance'][0].status = 'insufficient';
  await f.writeExport(f.restored, changed);
  const result = await verify(f.manifest, sealed.manifestSha256, f.exportPath(f.restored), f.objectsPath(f.restored));
  assert.equal(result.ok, false);
  assert.deepEqual(result.tableMismatches, ['public.course_completions', 'public.session_attendance']);
  assert.equal(JSON.stringify(result).includes('changed'), false);
});

test('detects missing, altered, and extra Storage bytes', async t => {
  const f = await fixture(t);
  const sealed = await seal(f.exportPath(f.source), f.objectsPath(f.source), f.manifest, 'pilot-20260923');
  await f.writeObject(f.restored, 'academy-materials', 'course-1/asset-1/file.pdf', Buffer.alloc(f.bytes.length, 0x58));
  await assert.rejects(verify(f.manifest, sealed.manifestSha256, f.exportPath(f.restored), f.objectsPath(f.restored)), /material_digest_mismatch/);
  await f.writeObject(f.restored, 'academy-materials', 'course-1/asset-1/file.pdf', f.bytes);
  await rm(join(f.restored, 'objects', 'documents', 'courses', 'old-course', 'file.pdf'));
  await assert.rejects(verify(f.manifest, sealed.manifestSha256, f.exportPath(f.restored), f.objectsPath(f.restored)), /lesson_attachment_bytes_missing/);
  await f.writeObject(f.restored, 'documents', 'courses/old-course/file.pdf', f.oldBytes);
  await f.writeObject(f.restored, 'academy-materials', 'extra/file.pdf', Buffer.from('extra'));
  const result = await verify(f.manifest, sealed.manifestSha256, f.exportPath(f.restored), f.objectsPath(f.restored));
  assert.equal(result.ok, false);
  assert.equal(result.objectMismatchKeyHashes.length, 1);
  assert.equal(JSON.stringify(result).includes('extra/file.pdf'), false);
});

test('rejects a ready material whose database size differs from its restored bytes', async t => {
  const f = await fixture(t);
  const sealed = await seal(f.exportPath(f.source), f.objectsPath(f.source), f.manifest, 'pilot-20260923');
  const changed = f.data();
  changed.tables['public.course_materials'][0].size_bytes += 1;
  await f.writeExport(f.restored, changed);
  await assert.rejects(verify(f.manifest, sealed.manifestSha256, f.exportPath(f.restored), f.objectsPath(f.restored)), /material_size_mismatch/);
});

test('rejects an export beyond the bounded pilot-scale JSON limit before reading it', async t => {
  const f = await fixture(t);
  await truncate(f.exportPath(f.source), 128 * 1024 * 1024 + 1);
  await assert.rejects(seal(f.exportPath(f.source), f.objectsPath(f.source), f.manifest, 'pilot-20260923'), /input_not_regular_or_too_large/);
});

test('rejects forged manifest and incomplete database inventory', async t => {
  const f = await fixture(t);
  const sealed = await seal(f.exportPath(f.source), f.objectsPath(f.source), f.manifest, 'pilot-20260923');
  await writeFile(f.manifest, (await readFile(f.manifest, 'utf8')).replace('pilot-20260923', 'pilot-forged'));
  await assert.rejects(verify(f.manifest, sealed.manifestSha256, f.exportPath(f.restored), f.objectsPath(f.restored)), /manifest_seal_mismatch/);
  const incomplete = f.data();
  delete incomplete.tables['public.academy_attendance_reports'];
  await f.writeExport(f.restored, incomplete);
  await assert.rejects(seal(f.exportPath(f.restored), f.objectsPath(f.restored), join(f.root, 'invalid.json'), 'pilot-20260923'), /invalid_export_tables/);
  const expanded = f.data();
  expanded.schemaTables.push('public.academy_future_table');
  await f.writeExport(f.restored, expanded);
  await assert.rejects(seal(f.exportPath(f.restored), f.objectsPath(f.restored), join(f.root, 'future.json'), 'pilot-20260923'), /academy_schema_inventory_changed/);
});

test('rejects symlinks and path traversal rather than reading outside a supplied root', async t => {
  const f = await fixture(t);
  const changed = f.data();
  changed.tables['public.course_materials'][0].storage_path = '../elsewhere';
  await f.writeExport(f.source, changed);
  await assert.rejects(seal(f.exportPath(f.source), f.objectsPath(f.source), f.manifest, 'pilot-20260923'), /unsafe_object_path/);
  await f.writeExport(f.source, f.data());
  await symlink(f.exportPath(f.source), join(f.source, 'objects', 'academy-materials', 'linked-export.json'));
  await assert.rejects(seal(f.exportPath(f.source), f.objectsPath(f.source), f.manifest, 'pilot-20260923'), /object_symlink_forbidden/);
});

test('CLI returns a nonzero exit status for a failed verification', async t => {
  const f = await fixture(t);
  const sealed = await seal(f.exportPath(f.source), f.objectsPath(f.source), f.manifest, 'pilot-20260923');
  const changed = f.data();
  changed.tables['public.course_completions'].length = 0;
  await f.writeExport(f.restored, changed);
  assert.throws(() => execFileSync(process.execPath, [script, 'verify', '--manifest', f.manifest,
    '--expected-sha256', sealed.manifestSha256, '--export', f.exportPath(f.restored), '--objects', f.objectsPath(f.restored)], { encoding: 'utf8' }), error => {
    assert.equal(error.status, 1);
    assert.match(error.stdout, /"ok":false/);
    return true;
  });
});
