import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { renderGrafanaScheduleCheck } from './grafana-schedule-check.mjs';

const now = Date.parse('2026-09-23T18:45:00Z');
const successfulRun = (minutes, changes = {}) => ({
  id: 35903386130, event: 'schedule', head_branch: 'main',
  created_at: new Date(now - minutes * 60_000).toISOString(),
  status: 'completed', conclusion: 'success', ...changes,
});

function executeGenerated(response) {
  const script = renderGrafanaScheduleCheck()
    .replace(/^import .*;\n/gm, '')
    .replace('export default function ()', 'function main()') + '\nmain();';
  const checks = [];
  const failures = [];
  const requests = [];
  class FixedDate extends Date { static now() { return now; } }
  try {
    vm.runInNewContext(script, {
      Date: FixedDate,
      http: { get: (url, options) => {
        requests.push({ url, options });
        if (response instanceof Error) throw response;
        return typeof response === 'function' ? response(url) : response;
      } },
      check: (value, assertions) => {
        const result = Object.values(assertions).every((assertion) => assertion(value));
        checks.push(result);
        return result;
      },
      fail: (message) => { throw new Error(message); },
    });
  } catch (error) {
    failures.push(error.message);
  }
  return { checks, failures, requests };
}

const jsonResponse = (runs) => ({ status: 200, body: JSON.stringify({ workflow_runs: runs }) });

test('generated k6 check passes only with a recent successful scheduled run', () => {
  const fresh = executeGenerated(jsonResponse([successfulRun(10)]));
  assert.deepEqual(fresh.checks, [true]);
  assert.deepEqual(fresh.failures, []);
  assert.match(fresh.requests[0].url, /event=schedule&per_page=1$/);
  assert.equal(fresh.requests[0].options.headers.Authorization, undefined);

  for (const [response, expectedCode] of [
    [jsonResponse([successfulRun(31)]), 'scheduled_run_stale'],
    [jsonResponse([]), 'scheduled_run_missing'],
    [jsonResponse([successfulRun(1, { conclusion: 'failure' })]), 'scheduled_run_failed'],
    [jsonResponse([successfulRun(1, { event: 'workflow_dispatch' })]), 'run_metadata_unavailable'],
    [jsonResponse([successfulRun(-2)]), 'run_metadata_unavailable'],
    [{ status: 403, body: '{"secret":"never-log-me"}' }, 'run_metadata_unavailable'],
    [{ status: 200, body: 'private-response-body' }, 'run_metadata_unavailable'],
    [new Error('private-transport-error'), 'run_metadata_unavailable'],
  ]) {
    const result = executeGenerated(response);
    assert.deepEqual(result.checks, [false]);
    assert.deepEqual(result.failures, [`academy_schedule_check=${expectedCode}`]);
  }
});

test('GitHub query exposes a failed or unfinished run after an earlier success', () => {
  const olderSuccess = successfulRun(15);
  for (const latestRun of [
    successfulRun(1, { id: 35903386131, conclusion: 'failure' }),
    successfulRun(1, { id: 35903386132, status: 'in_progress', conclusion: null }),
  ]) {
    const result = executeGenerated((url) => jsonResponse(
      url.includes('status=success') ? [olderSuccess] : [latestRun],
    ));
    assert.deepEqual(result.checks, [false]);
    assert.deepEqual(result.failures, [
      `academy_schedule_check=${latestRun.status === 'completed' ? 'scheduled_run_failed' : 'scheduled_run_unfinished'}`,
    ]);
  }
});

test('generated check rejects oversized and incomplete GitHub responses', () => {
  for (const response of [
    { status: 200, body: ' '.repeat(128 * 1024 + 1) },
    { status: 200, body: '{"workflow_runs":[{"id":1}]}' },
    { status: 200, body: '{}' },
  ]) {
    const result = executeGenerated(response);
    assert.deepEqual(result.checks, [false]);
    assert.deepEqual(result.failures, ['academy_schedule_check=run_metadata_unavailable']);
  }
});
