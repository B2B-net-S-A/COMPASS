import test from 'node:test';
import assert from 'node:assert/strict';
import { assessOperationalRequirements, collectReadiness, environmentNames, summarizeEnvironments, summarizeTasks } from './coolify-readiness.mjs';

const env = { COOLIFY_URL: 'https://coolify-compass.dynaminds.pl', COOLIFY_TOKEN: 'test-token-do-not-emit', COOLIFY_APP_UUID: 'test-application-uuid' };
const appPath = '/api/v1/applications/test-application-uuid';
const serverPath = '/api/v1/servers/test-server-uuid';
const privateValue = 'NEVER_EMIT_PRIVATE_RESPONSE_VALUE';
const jsonResponse = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function fixtures() {
    return {
        [appPath]: {
            status: 'running:healthy', build_pack: 'dockercompose', health_check_enabled: true,
            settings: { connect_to_docker_network: true }, http_basic_auth_password: privateValue,
            docker_compose_raw: privateValue, pre_deployment_command: privateValue, name: privateValue,
        },
        [`${appPath}/envs`]: [
            { key: 'AZURE_CLIENT_SECRET', value: privateValue, real_value: privateValue, is_runtime: true, is_preview: false, comment: privateValue },
            { key: 'ACADEMY_TEAMS_ENABLED', value: 'false', is_runtime: true },
            { key: 'CRON_SECRET', value: '***REDACTED***', is_runtime: true },
            { key: 'UNRELATED_PRIVATE_KEY', value: privateValue, is_runtime: true },
        ],
        [`${appPath}/scheduled-tasks`]: [
            { name: 'academy-materials', enabled: true, frequency: '*/1 * * * *', container: privateValue, timeout: 330, command: privateValue, logs: privateValue },
            { name: privateValue, enabled: true, command: privateValue, executions: [{ output: privateValue }] },
        ],
        [`${appPath}/destinations`]: [{ server_uuid: 'test-server-uuid', is_primary: true, network: privateValue, name: privateValue }],
        [serverPath]: {
            name: privateValue, ip: privateValue, user: privateValue, validation_logs: privateValue,
            settings: { is_reachable: true, is_usable: true, is_metrics_enabled: true, is_sentinel_enabled: false, sentinel_token: privateValue, logdrain_axiom_api_key: privateValue },
        },
    };
}

test('returns only the explicit safe projection and performs only fixed-origin GET requests', async () => {
    const source = fixtures();
    const requested = [];
    const report = await collectReadiness({ env, fetchImpl: async (url, options) => {
        const parsed = new URL(url);
        assert.equal(parsed.origin, env.COOLIFY_URL);
        assert.equal(options.method, 'GET');
        assert.equal(options.redirect, 'error');
        assert.equal(options.body, undefined);
        assert.equal(options.headers.Authorization, `Bearer ${env.COOLIFY_TOKEN}`);
        assert(options.signal instanceof AbortSignal);
        requested.push(parsed.pathname);
        assert(Object.hasOwn(source, parsed.pathname));
        return jsonResponse(source[parsed.pathname]);
    } });
    assert.equal(requested.length, 5);
    assert.equal(report.inspection, 'complete');
    assert.equal(report.operationalReadiness, 'not_established');
    assert.equal(report.application.status, 'running:healthy');
    assert.equal(report.servers[0].primary, true);
    assert.equal(report.servers[0].reachable, true);
    assert.deepEqual(report.servers[0].capacity, {
        memoryBytes: null, availableMemoryBytes: null, availableDiskBytes: null, reason: 'not_exposed_by_documented_read_api',
    });
    assert.deepEqual(report.environments.map(row => row.name), environmentNames);
    assert.equal(report.environments.find(row => row.name === 'AZURE_CLIENT_SECRET').configured, true);
    assert.equal(report.environments.find(row => row.name === 'CRON_SECRET').configured, null);
    assert.equal(report.tasks[0].enabled, true);
    assert.equal(report.tasks[0].frequency, '*/1 * * * *');
    assert.equal(report.tasks[0].containerConfigured, true);
    assert.equal(report.tasks[1].present, false);
    const serialized = JSON.stringify(report);
    for (const forbidden of [privateValue, env.COOLIFY_TOKEN, env.COOLIFY_APP_UUID, 'test-server-uuid', 'UNRELATED_PRIVATE_KEY', 'docker_compose_raw', 'sentinel_token']) {
        assert(!serialized.includes(forbidden), `Report contains forbidden metadata: ${forbidden}`);
    }
});

test('does not send credentials to an untrusted URL or follow a redirect', async () => {
    for (const url of ['https://attacker.test', 'http://coolify-compass.dynaminds.pl', 'https://coolify-compass.dynaminds.pl@attacker.test', 'https://coolify-compass.dynaminds.pl?token=private', 'https://coolify-compass.dynaminds.pl/not-api']) {
        let requests = 0;
        const report = await collectReadiness({ env: { ...env, COOLIFY_URL: url }, fetchImpl: async () => { requests++; throw new Error(privateValue); } });
        assert.equal(requests, 0);
        assert.equal(report.inspection, 'unavailable');
        assert(!JSON.stringify(report).includes(url));
    }
    const report = await collectReadiness({ env, fetchImpl: async (_url, options) => {
        assert.equal(options.redirect, 'error');
        throw new Error(`Refusing redirected request with ${privateValue}`);
    } });
    assert.equal(report.inspection, 'unavailable');
    assert(!JSON.stringify(report).includes(privateValue));
});

test('distinguishes absent, empty, redacted, preview-only and runtime-disabled configuration', () => {
    const result = summarizeEnvironments([
        { key: 'AZURE_CLIENT_ID', value: '', is_runtime: true },
        { key: 'AZURE_CLIENT_SECRET', value: '***', is_runtime: true },
        { key: 'ACADEMY_CLAMAV_HOST', value: privateValue, is_runtime: true, is_preview: true },
        { key: 'ACADEMY_CLAMAV_PORT', value: '3310', is_runtime: false },
        { key: 'CRON_SECRET', value: '{{project.cron}}', real_value: privateValue, is_runtime: true },
    ]);
    const get = name => result.find(row => row.name === name);
    assert.deepEqual(get('AZURE_TENANT_ID'), { name: 'AZURE_TENANT_ID', present: false, configured: false, runtime: null });
    assert.equal(get('AZURE_CLIENT_ID').configured, false);
    assert.equal(get('AZURE_CLIENT_SECRET').configured, null);
    assert.equal(get('ACADEMY_CLAMAV_HOST').present, false);
    assert.equal(get('ACADEMY_CLAMAV_PORT').configured, true);
    assert.equal(get('ACADEMY_CLAMAV_PORT').runtime, false);
    assert.equal(get('CRON_SECRET').configured, true);
    assert(!JSON.stringify(result).includes(privateValue));
    assert(summarizeEnvironments({ message: privateValue }).every(row => row.present === null && row.configured === null));
});

test('reports unsupported API, denied requests and unknown shapes without printing response bodies', async () => {
    const report = await collectReadiness({ env, fetchImpl: async url => {
        const path = new URL(url).pathname;
        if (path.endsWith('/scheduled-tasks')) return jsonResponse({ message: privateValue }, 404);
        if (path.endsWith('/destinations')) return jsonResponse({ message: privateValue }, 403);
        if (path.endsWith('/envs')) return jsonResponse({ message: privateValue });
        return jsonResponse(fixtures()[appPath]);
    } });
    assert.equal(report.inspection, 'partial');
    assert.equal(report.checks.tasks, 'http_404');
    assert.equal(report.checks.destinations, 'http_403');
    assert.equal(report.checks.environments, 'unknown_schema');
    assert.equal(report.tasks[0].present, null);
    assert.deepEqual(report.servers, []);
    assert(!JSON.stringify(report).includes(privateValue));
});

test('does not request injected or unexpectedly many server references', async () => {
    let requests = 0;
    const report = await collectReadiness({ env, fetchImpl: async url => {
        requests++;
        const path = new URL(url).pathname;
        if (path.endsWith('/destinations')) return jsonResponse([
            { server_uuid: '../../deploy?uuid=private', is_primary: true },
            ...Array.from({ length: 6 }, (_, index) => ({ server_uuid: `server-uuid-${index}`, is_primary: false })),
        ]);
        return jsonResponse(fixtures()[path]);
    } });
    assert.equal(requests, 4);
    assert.equal(report.checks.servers, 'too_many_destinations');
    assert.deepEqual(report.servers, []);
});

test('suppresses unknown fields and unsafe cron metadata rather than dumping tasks', () => {
    const tasks = summarizeTasks([
        { name: 'Academy materials', enabled: true, frequency: `* * * * * ${privateValue}`, container: privateValue, timeout: -1, command: privateValue },
        { name: 'academy-sync', enabled: true, frequency: '*/5 * * * *', command: privateValue },
        { name: 'academy-sync', enabled: false, frequency: '* * * * *', command: privateValue },
    ]);
    assert.equal(tasks[0].present, true);
    assert.equal(tasks[0].frequency, null);
    assert.equal(tasks[0].timeoutSeconds, null);
    assert.equal(tasks[1].duplicates, true);
    assert.equal(tasks[1].enabled, null);
    assert(!JSON.stringify(tasks).includes(privateValue));
});

test('bounds response size and does not leak parsing errors or their source data', async () => {
    for (const response of [
        () => new Response(privateValue, { headers: { 'Content-Type': 'application/json' } }),
        () => new Response(privateValue, { headers: { 'Content-Length': String(3 * 1024 * 1024) } }),
        () => new Response('x'.repeat(2 * 1024 * 1024 + 1)),
    ]) {
        const report = await collectReadiness({ env, fetchImpl: async () => response() });
        assert.equal(report.inspection, 'unavailable');
        assert(!JSON.stringify(report).includes(privateValue));
    }
});

test('requires existing credentials without attempting to discover or create alternatives', async () => {
    for (const field of Object.keys(env)) {
        const report = await collectReadiness({ env: { ...env, [field]: '' }, fetchImpl: async () => { assert.fail('No request is authorized without complete configuration'); } });
        assert.equal(report.inspection, 'unavailable');
    }
});


test('identifies actionable scanner and scheduler gaps while leaving external-link reminders required', () => {
    const assessment=assessOperationalRequirements(summarizeEnvironments([]),summarizeTasks([
        {name:'academy-materials',enabled:true,container:'private',timeout:60,frequency:'* * * * *'},
        {name:'academy-sync',enabled:false,container:'private',timeout:210,frequency:'* * * * *'},
    ]));
    assert.equal(assessment.scannerAddress,'missing');
    assert.equal(assessment.schedulers[0].state,'timeout_too_short');
    assert.equal(assessment.schedulers[1].state,'disabled');
    assert.equal(assessment.schedulers[1].requiredForPilot,true);
    assert.equal(assessment.schedulers[2].name,'academy-material-cleanup');
    assert.equal(assessment.schedulers[2].requiredForPilot,false);
    assert.equal(assessment.rawAttendanceRetention,'not_configured_no_automatic_deletion');
    assert.equal(assessment.graphPermissionsAndOrganizerPolicies,'not_inspected');
});

test('configured metadata never proves scheduler delivery, lock, scanner capacity or a managed Teams grant', () => {
    const assessment=assessOperationalRequirements(summarizeEnvironments([
        {key:'ACADEMY_CLAMAV_HOST',value:privateValue,is_runtime:true},
        {key:'CRON_SECRET',value:privateValue,is_runtime:false},
    ]),summarizeTasks([
        {name:'academy-materials',enabled:true,container:privateValue,timeout:330,frequency:'*/1 * * * *'},
        {name:'academy-sync',enabled:true,container:privateValue,timeout:210,frequency:'@hourly'},
    ]));
    assert.equal(assessment.scannerAddress,'configured_unverified');
    assert.equal(assessment.cronCredential,'not_runtime');
    assert.equal(assessment.schedulers[0].state,'metadata_configured_execution_unverified');
    assert.equal(assessment.schedulers[0].overlapProtection,'not_inspected');
    assert.equal(assessment.schedulers[1].state,'frequency_requires_review');
    assert(!JSON.stringify(assessment).includes(privateValue));
});


test('discovers only the primary server UUID from the documented application relation when destinations is unavailable', async () => {
    const source=fixtures();let serverReads=0;
    const report=await collectReadiness({env,fetchImpl:async url=>{
        const path=new URL(url).pathname;
        if(path.endsWith('/destinations'))return jsonResponse({message:privateValue},404);
        if(path===appPath)return jsonResponse({...source[path],destination:{server:{uuid:'test-server-uuid',ip:privateValue,settings:{sentinel_token:privateValue}}}});
        if(path===serverPath)serverReads++;
        return jsonResponse(source[path]);
    }});
    assert.equal(serverReads,1);assert.equal(report.servers[0].primary,true);
    assert.equal(report.checks.destinations,'http_404');assert.equal(report.inspection,'partial');
    assert(!JSON.stringify(report).includes(privateValue));assert(!JSON.stringify(report).includes('test-server-uuid'));
});

test('does not follow injected URLs or numeric server IDs from application metadata', async () => {
    let requests=0;
    const report=await collectReadiness({env,fetchImpl:async url=>{
        requests++;const path=new URL(url).pathname;
        if(path===appPath)return jsonResponse({...fixtures()[path],destination:{server:{uuid:'../../servers?secret=leak',id:42,url:'https://attacker.test'}}});
        if(path.endsWith('/destinations'))return jsonResponse([],200);
        return jsonResponse(fixtures()[path]);
    }});
    assert.equal(requests,4);assert.deepEqual(report.servers,[]);
});
