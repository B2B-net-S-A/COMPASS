import test from 'node:test';
import assert from 'node:assert/strict';
import { collectGraphGrantEvidence } from './graph-grants-readonly.mjs';

const tenant = '11111111-1111-1111-1111-111111111111';
const client = '22222222-2222-2222-2222-222222222222';
const privateValue = 'PRIVATE-do-not-print&+%=';
const now = new Date('2026-09-22T12:00:00Z');
const second = Math.floor(now.getTime() / 1000);
const env = {
    GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_REPOSITORY: 'B2B-net-S-A/COMPASS',
    GITHUB_REF: 'refs/heads/feat/academy-enterprise', GITHUB_EVENT_NAME: 'push',
    COOLIFY_URL: 'https://coolify-compass.dynaminds.pl', COOLIFY_TOKEN: privateValue, COOLIFY_APP_UUID: 'test-application-uuid',
};
const expectedUnknown = { 'Calendars.ReadWrite': null, 'OnlineMeetings.Read.All': null, 'OnlineMeetings.ReadWrite.All': null, 'OnlineMeetingArtifact.Read.All': null };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const claims = overrides => ({ aud: 'https://graph.microsoft.com', iss: `https://sts.windows.net/${tenant}/`,
    exp: second + 3600, iat: second, nbf: second - 5, tid: tenant, appid: client,
    roles: ['Calendars.ReadWrite', 'OnlineMeetings.Read.All', 'Unrelated.Permission'], ...overrides });
const jwt = payload => `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.fixtureSignature`;
const rows = () => ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'].map((key, index) => ({
    key, value: [tenant, client, privateValue][index], is_runtime: true, is_preview: false,
}));
async function inspect({ configuration = rows(), token = jwt(claims()), overrides = {}, fetchOverride, tokenType = 'Bearer' } = {}) {
    const requests = [];
    const result = await collectGraphGrantEvidence({ env: { ...env, ...overrides }, now, fetchImpl: async (url, options) => {
        requests.push({ url, options });
        if (fetchOverride) return fetchOverride(url, options, requests.length);
        return requests.length === 1 ? json(configuration) : json({ access_token: token, token_type: tokenType, privateField: privateValue });
    } });
    assert.deepEqual(Object.keys(result), Object.keys(expectedUnknown));
    assert(Object.values(result).every(value => value === null || typeof value === 'boolean'));
    for (const forbidden of [tenant, client, privateValue, 'Unrelated.Permission', token]) assert(!JSON.stringify(result).includes(forbidden));
    return { result, requests };
}

test('reads runtime credentials in memory then requests only the official fixed Graph audience', async () => {
    const { result, requests } = await inspect();
    assert.deepEqual(result, { 'Calendars.ReadWrite': true, 'OnlineMeetings.Read.All': true, 'OnlineMeetings.ReadWrite.All': false, 'OnlineMeetingArtifact.Read.All': false });
    assert.equal(requests.length, 2);
    assert.equal(requests[0].url, 'https://coolify-compass.dynaminds.pl/api/v1/applications/test-application-uuid/envs');
    assert.equal(requests[0].options.method, 'GET');
    assert.equal(requests[0].options.body, undefined);
    assert.equal(requests[0].options.headers.Authorization, `Bearer ${privateValue}`);
    assert.equal(requests[1].url, `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`);
    assert.equal(requests[1].options.method, 'POST');
    assert.equal(requests[1].options.headers.Authorization, undefined);
    assert.deepEqual(Object.fromEntries(requests[1].options.body), {
        client_id: client, client_secret: privateValue, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default',
    });
    assert.equal(new URLSearchParams(requests[1].options.body.toString()).get('client_secret'), privateValue);
    for (const { options } of requests) { assert.equal(options.redirect, 'error'); assert(options.signal instanceof AbortSignal); }
});

test('accepts supported issuer/audience forms and preserves false for genuinely absent known roles', async () => {
    const token = jwt(claims({ iss: `https://login.microsoftonline.com/${tenant}/v2.0`,
        aud: '00000003-0000-0000-c000-000000000000', azp: client, appid: undefined,
        roles: ['OnlineMeetingArtifact.Read.All'] }));
    assert.deepEqual((await inspect({ token })).result, {
        'Calendars.ReadWrite': false, 'OnlineMeetings.Read.All': false, 'OnlineMeetings.ReadWrite.All': false, 'OnlineMeetingArtifact.Read.All': true,
    });
    assert.deepEqual((await inspect({ token: jwt(claims({ roles: undefined })) })).result, {
        'Calendars.ReadWrite': false, 'OnlineMeetings.Read.All': false, 'OnlineMeetings.ReadWrite.All': false, 'OnlineMeetingArtifact.Read.All': false,
    });
});

test('reports the meeting read/write superset literally without inventing the minimal grant or artifact permission', async () => {
    const { result } = await inspect({ token: jwt(claims({ roles: ['OnlineMeetings.ReadWrite.All'] })) });
    assert.deepEqual(result, {
        'Calendars.ReadWrite': false, 'OnlineMeetings.Read.All': false,
        'OnlineMeetings.ReadWrite.All': true, 'OnlineMeetingArtifact.Read.All': false,
    });
});

test('will not read the vault outside the reviewed origin hosted branch context', async () => {
    for (const overrides of [
        { GITHUB_ACTIONS: 'false' }, { RUNNER_ENVIRONMENT: 'self-hosted' }, { GITHUB_REPOSITORY: 'fork/COMPASS' },
        { GITHUB_REF: 'refs/pull/384/merge' }, { GITHUB_REF: 'refs/heads/other' }, { GITHUB_EVENT_NAME: 'pull_request_target' },
    ]) {
        const { result, requests } = await inspect({ overrides });
        assert.deepEqual(result, expectedUnknown); assert.equal(requests.length, 0);
    }
});

test('does not send Coolify credentials to an untrusted origin, path or injected application ID', async () => {
    for (const overrides of [
        { COOLIFY_URL: 'https://attacker.invalid' }, { COOLIFY_URL: 'http://coolify-compass.dynaminds.pl' },
        { COOLIFY_URL: 'https://coolify-compass.dynaminds.pl@attacker.invalid' },
        { COOLIFY_URL: 'https://coolify-compass.dynaminds.pl?query=private' },
        { COOLIFY_URL: 'https://coolify-compass.dynaminds.pl/other' }, { COOLIFY_APP_UUID: '../other?secret' }, { COOLIFY_TOKEN: '' },
    ]) {
        const { result, requests } = await inspect({ overrides });
        assert.deepEqual(result, expectedUnknown); assert.equal(requests.length, 0);
    }
});

test('rejects missing, duplicate, preview-only, masked, empty, unresolved and non-runtime credentials', async () => {
    const variants = [[], {}, rows().concat(rows()[2])];
    for (const change of [{ is_preview: true }, { is_runtime: false }, { is_runtime: undefined },
        { value: '***' }, { value: '{{project.secret}}' }, { value: '' }, { value: 'secret\nextra' },
        { value: privateValue, real_value: '***REDACTED***' }]) {
        variants.push(rows().map(row => row.key === 'AZURE_CLIENT_SECRET' ? { ...row, ...change } : row));
    }
    for (const configuration of variants) {
        const { result, requests } = await inspect({ configuration });
        assert.deepEqual(result, expectedUnknown); assert.equal(requests.length, 1);
    }
});

test('uses a resolved real_value without exporting unrelated vault values', async () => {
    const configuration = rows().map(row => ({ ...row, real_value: row.value, value: '{{project.reference}}' }));
    configuration.push({ key: 'UNRELATED_PRIVATE_KEY', value: privateValue, is_runtime: true });
    const { result, requests } = await inspect({ configuration });
    assert.equal(result['Calendars.ReadWrite'], true);
    assert.equal(requests[1].options.body.get('client_secret'), privateValue);
});

test('rejects unvalidated tenant/client IDs before the token endpoint is called', async () => {
    for (const key of ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID']) {
        for (const value of ['common', 'organizations', '../tenant', 'tenant.example', `${tenant}?query=private`]) {
            const { result, requests } = await inspect({ configuration: rows().map(row => row.key === key ? { ...row, value } : row) });
            assert.deepEqual(result, expectedUnknown); assert.equal(requests.length, 1);
        }
    }
});

test('unknown never becomes false for expired, mismatched, delegated or malformed claim boundaries', async () => {
    for (const boundary of [
        { aud: 'https://attacker.invalid' }, { iss: 'https://attacker.invalid' }, { exp: second }, { exp: String(second + 3600) },
        { nbf: second + 3600 }, { iat: second + 3600 }, { tid: client }, { appid: tenant }, { appid: undefined },
        { scp: 'delegated.scope' }, { roles: 'Calendars.ReadWrite' }, { roles: [true] }, { roles: Array(513).fill('Calendars.ReadWrite') },
    ]) assert.deepEqual((await inspect({ token: jwt(claims(boundary)) })).result, expectedUnknown);
});

test('opaque, encrypted, invalid JSON and unexpectedly large tokens are unknown without decoding output', async () => {
    for (const token of ['opaque-token', 'a.b.c.d.e', 'a.private-invalid-json.c', 'x'.repeat(128 * 1024 + 1), jwt(null), jwt([])]) {
        assert.deepEqual((await inspect({ token })).result, expectedUnknown);
    }
    assert.deepEqual((await inspect({ tokenType: 'other' })).result, expectedUnknown);
});

test('suppresses provider errors, redirects, malformed JSON, and oversized response bodies without retrying', async () => {
    for (const failAt of [1, 2]) {
        for (const failure of [
            () => json({ error_description: privateValue, trace_id: tenant }, 401),
            () => { throw new Error(`Redirect or network failure ${privateValue}`); },
            () => new Response(privateValue),
            () => new Response(privateValue, { headers: { 'Content-Length': String(3 * 1024 * 1024) } }),
            () => new Response('x'.repeat(3 * 1024 * 1024)),
        ]) {
            const { result, requests } = await inspect({ fetchOverride: (_url, _options, count) => count === failAt ? failure() : json(rows()) });
            assert.deepEqual(result, expectedUnknown); assert.equal(requests.length, failAt);
        }
    }
});
