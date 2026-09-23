import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { auditWatchdogSchedule } from './watchdog-schedule-audit.mjs';

const now = Date.parse('2026-09-23T13:30:00Z');
const run = (minutes, changes = {}) => ({
  id: 35845458488, event: 'schedule', head_branch: 'main',
  created_at: new Date(now - minutes * 60_000).toISOString(),
  status: 'completed', conclusion: 'success', ...changes,
});

test('fresh successful schedule passes; latest failed, unfinished or stale run fails', () => {
  assert.deepEqual(auditWatchdogSchedule({ workflow_runs: [run(10)] }, now),
    { status: 'healthy', code: 'scheduled_run_fresh', runId: 35845458488, ageMinutes: 10 });
  assert.equal(auditWatchdogSchedule({ workflow_runs: [run(20), run(5, { id: 2, conclusion: 'failure' })] }, now).code, 'scheduled_run_failed');
  assert.equal(auditWatchdogSchedule({ workflow_runs: [run(5, { status: 'in_progress', conclusion: null })] }, now).code, 'scheduled_run_unfinished');
  assert.equal(auditWatchdogSchedule({ workflow_runs: [run(31)] }, now).code, 'scheduled_run_stale');
  assert.equal(auditWatchdogSchedule({ workflow_runs: [] }, now).code, 'scheduled_run_missing');
});

test('rejects other events, branches, malformed dates and fabricated future freshness', () => {
  for (const invalid of [
    { workflow_runs: [run(1, { event: 'workflow_dispatch' })] },
    { workflow_runs: [run(1, { head_branch: 'other' })] },
    { workflow_runs: [run(1, { created_at: 'not-a-date' })] },
    { workflow_runs: [run(-2)] },
    { workflow_runs: [{ ...run(1), id: '1' }] },
    { runs: [] },
  ]) assert.throws(() => auditWatchdogSchedule(invalid, now), /invalid_run_metadata/);
});

test('CLI returns failure for stale or invalid metadata without echoing input', () => {
  const command = new URL('./watchdog-schedule-audit.mjs', import.meta.url);
  const stale = spawnSync(process.execPath, [command.pathname], { input: JSON.stringify({ workflow_runs: [run(240)] }), encoding: 'utf8' });
  assert.equal(stale.status, 1);
  assert.equal(JSON.parse(stale.stdout).code, 'scheduled_run_stale');
  const invalid = spawnSync(process.execPath, [command.pathname], { input: 'private-token', encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.equal(JSON.parse(invalid.stdout).code, 'run_metadata_unavailable');
  assert(!invalid.stdout.includes('private-token'));
});
