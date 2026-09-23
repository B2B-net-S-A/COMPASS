import { pathToFileURL } from 'node:url';

export const MAX_INPUT_BYTES = 128 * 1024;
export const MAX_AGE_MS = 30 * 60_000;

/** Manual audit of GitHub Actions metadata; this cannot detect its own missed invocation. */
export function auditWatchdogSchedule(payload, now = Date.now()) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      !Array.isArray(payload.workflow_runs) || payload.workflow_runs.length > 100 ||
      !Number.isFinite(now)) throw new Error('invalid_run_metadata');

  const runs = payload.workflow_runs.map((run) => {
    if (!run || typeof run !== 'object' || Array.isArray(run) ||
        !Number.isSafeInteger(run.id) || run.id <= 0 ||
        run.event !== 'schedule' || run.head_branch !== 'main' ||
        typeof run.created_at !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(run.created_at) ||
        !['queued', 'in_progress', 'completed'].includes(run.status)) throw new Error('invalid_run_metadata');
    const createdAt = Date.parse(run.created_at);
    if (!Number.isFinite(createdAt) || createdAt > now + 60_000) throw new Error('invalid_run_metadata');
    if (run.status === 'completed' && typeof run.conclusion !== 'string') throw new Error('invalid_run_metadata');
    return { id: run.id, createdAt, status: run.status, conclusion: run.conclusion };
  });

  if (runs.length === 0) return { status: 'unhealthy', code: 'scheduled_run_missing' };
  const latest = runs.sort((a, b) => b.createdAt - a.createdAt)[0];
  const ageMinutes = Math.ceil((now - latest.createdAt) / 60_000);
  const base = { runId: latest.id, ageMinutes };
  if (now - latest.createdAt > MAX_AGE_MS) return { status: 'unhealthy', code: 'scheduled_run_stale', ...base };
  if (latest.status !== 'completed') return { status: 'unhealthy', code: 'scheduled_run_unfinished', ...base };
  if (latest.conclusion !== 'success') return { status: 'unhealthy', code: 'scheduled_run_failed', ...base };
  return { status: 'healthy', code: 'scheduled_run_fresh', ...base };
}

async function readStdin() {
  let size = 0;
  const chunks = [];
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) throw new Error('oversized_run_metadata');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = auditWatchdogSchedule(JSON.parse(await readStdin()));
    process.stdout.write(JSON.stringify(report) + '\n');
    if (report.status !== 'healthy') process.exitCode = 1;
  } catch {
    process.stdout.write('{"status":"unhealthy","code":"run_metadata_unavailable"}\n');
    process.exitCode = 1;
  }
}
