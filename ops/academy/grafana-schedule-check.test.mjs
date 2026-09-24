import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { renderGrafanaScheduleCheck } from './grafana-schedule-check.mjs';

function executeGenerated(response) {
  const script = renderGrafanaScheduleCheck()
    .replace(/^import .*;\n/gm, '')
    .replace('export default function ()', 'function main()') + '\nmain();';
  const checks = [];
  const failures = [];
  const requests = [];
  try {
    vm.runInNewContext(script, {
      http: { get: (url, options) => {
        requests.push({ url, options });
        if (response instanceof Error) throw response;
        return response;
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

const jsonResponse = (status, httpStatus = status === 'unhealthy' ? 503 : 200) =>
  ({ status: httpStatus, body: JSON.stringify({ status }) });

test('generated k6 check probes Academy directly without credentials', () => {
  const result = executeGenerated(jsonResponse('healthy'));
  assert.deepEqual(result.checks, [true]);
  assert.deepEqual(result.failures, []);
  assert.equal(result.requests.length, 1);
  assert.equal(result.requests[0].url, 'https://compass.dynaminds.pl/api/akademia/health');
  assert.equal(result.requests[0].options.headers.Authorization, undefined);
  assert.equal(result.requests[0].options.timeout, '10s');
});

test('degraded and unhealthy statuses fail with controlled codes', () => {
  for (const [status, expected] of [['degraded', 'academy_degraded'], ['unhealthy', 'academy_unhealthy']]) {
    const result = executeGenerated(jsonResponse(status));
    assert.deepEqual(result.checks, [false]);
    assert.deepEqual(result.failures, [expected]);
  }
});

test('invalid HTTP, shape, oversized response, and transport error fail closed', () => {
  for (const response of [
    jsonResponse('healthy', 503),
    jsonResponse('unhealthy', 200),
    { status: 403, body: '{"secret":"never-log-me"}' },
    { status: 200, body: JSON.stringify({ status: 'healthy', details: 'private' }) },
    { status: 200, body: ' '.repeat(129) },
    { status: 200, body: '{}' },
    { status: 200, body: '{' },
    new Error('private-transport-error'),
  ]) {
    const result = executeGenerated(response);
    assert.deepEqual(result.checks, [false]);
    assert.deepEqual(result.failures, ['academy_health_unavailable']);
    assert(!result.failures.join().includes('never-log-me'));
    assert(!result.failures.join().includes('private-transport-error'));
  }
});
