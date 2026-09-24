#!/usr/bin/env node
// Read-only Storage byte capture for an operator-supplied Academy snapshot.
// The database export is produced separately; this script never writes to Storage.
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { isAbsolute, dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { readStorageInventory, snapshot } from './verify.mjs';

function fail(code) { throw new Error(code); }

function storageEndpoint(value, projectRef) {
  if (typeof projectRef !== 'string' || !/^[a-z0-9]{20}$/.test(projectRef)) fail('project_ref_required');
  let url;
  try { url = new URL(value); } catch { fail('invalid_storage_url'); }
  if (url.protocol !== 'https:' || url.hostname !== `${projectRef}.supabase.co` ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') fail('storage_project_mismatch');
  return url;
}

export async function captureStorage({ exportPath, objectsRoot, sourceUrl, projectRef, serviceKey,
  maxTotalBytes, fetchImpl = fetch }) {
  if (typeof exportPath !== 'string' || !isAbsolute(exportPath) ||
      typeof objectsRoot !== 'string' || !isAbsolute(objectsRoot)) fail('absolute_paths_required');
  const endpoint = storageEndpoint(sourceUrl, projectRef);
  if (typeof serviceKey !== 'string' || !serviceKey) fail('storage_key_required');
  if (!Number.isSafeInteger(maxTotalBytes) || maxTotalBytes <= 0) fail('egress_limit_required');
  const inventory = await readStorageInventory(exportPath);
  // A fresh private directory prevents accidentally mixing two snapshots.
  await mkdir(objectsRoot, { mode: 0o700 });
  try {
    await mkdir(join(objectsRoot, 'academy-materials'), { mode: 0o700 });
    await mkdir(join(objectsRoot, 'documents'), { mode: 0o700 });
    let downloadedBytes = 0;
    for (const { bucket, path } of inventory) {
      const target = join(objectsRoot, bucket, path);
      await mkdir(dirname(target), { recursive: true, mode: 0o700 });
      const url = new URL(`/storage/v1/object/authenticated/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, endpoint);
      let response;
      try {
        response = await fetchImpl(url, {
          method: 'GET', redirect: 'error', cache: 'no-store',
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        });
      } catch { fail('storage_download_failed'); }
      if (!response.ok || !response.body) fail('storage_download_failed');
      const length = Number(response.headers.get('content-length'));
      if (Number.isSafeInteger(length) && length > maxTotalBytes - downloadedBytes) fail('egress_limit_reached');
      const limiter = new Transform({ transform(chunk, _encoding, callback) {
        downloadedBytes += chunk.length;
        callback(downloadedBytes > maxTotalBytes ? new Error('egress_limit_reached') : null, chunk);
      } });
      try {
        await pipeline(Readable.fromWeb(response.body), limiter,
          createWriteStream(target, { flags: 'wx', mode: 0o600 }));
      } catch (error) { fail(error?.message === 'egress_limit_reached' ? 'egress_limit_reached' : 'storage_download_failed'); }
    }
    // Reuse the full offline verifier: catches missing metadata, wrong hashes,
    // ready-material size mismatches, and unexpected files before sealing.
    const state = await snapshot(exportPath, objectsRoot);
    return { ok: true, tableCount: Object.keys(state.tables).length, objectCount: state.objects.length };
  } catch (error) {
    await rm(objectsRoot, { recursive: true, force: true });
    throw error;
  }
}

function parseArgs(argv) {
  if (argv.length !== 10) fail('usage_error');
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || args[argv[i]]) fail('usage_error');
    args[argv[i]] = argv[i + 1];
  }
  const keys = ['--export', '--objects', '--source-url', '--project-ref', '--max-bytes'];
  if (keys.some(key => !args[key]) || Object.keys(args).some(key => !keys.includes(key))) fail('usage_error');
  return args;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await captureStorage({
      exportPath: args['--export'], objectsRoot: args['--objects'],
      sourceUrl: args['--source-url'], projectRef: args['--project-ref'],
      serviceKey: process.env.ACADEMY_RESTORE_STORAGE_KEY,
      maxTotalBytes: Number(args['--max-bytes']),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = typeof error?.message === 'string' && /^[a-z0-9_]+$/.test(error.message)
      ? error.message : 'capture_failed';
    process.stderr.write(`${JSON.stringify({ ok: false, error: code })}\n`);
    process.exitCode = 1;
  }
}
