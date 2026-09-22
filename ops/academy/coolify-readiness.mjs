// Read-only inventory. This file deliberately has no package dependencies or command execution.
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const trustedOrigin = 'https://coolify-compass.dynaminds.pl';
const identifier = /^[a-zA-Z0-9-]{8,64}$/;
const maximumResponseBytes = 2 * 1024 * 1024;
export const environmentNames = Object.freeze([
    'AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'ACADEMY_TEAMS_ENABLED',
    'ACADEMY_CLAMAV_HOST', 'ACADEMY_CLAMAV_PORT', 'ACADEMY_ATTENDANCE_RETENTION_DAYS',
    'CRON_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_APP_URL',
]);
const taskNames = ['academy-materials', 'academy-sync'];
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const boolean = value => typeof value === 'boolean' ? value : null;
const known = (value, allowed) => allowed.includes(value) ? value : 'unknown';
const number = value => Number.isSafeInteger(value) && value >= 0 && value <= 86400 ? value : null;

function visibleValue(row) {
    for (const field of ['real_value', 'value']) {
        if (typeof row[field] !== 'string') continue;
        const value = row[field].trim();
        if (/\{\{|\*{3,}|redacted|hidden|encrypted/i.test(value)) continue;
        return value;
    }
    return null;
}

export function summarizeEnvironments(rows) {
    const valid = Array.isArray(rows) && rows.every(record);
    return environmentNames.map(name => {
        const matches = valid ? rows.filter(row => row.key === name && row.is_preview !== true) : [];
        const values = matches.map(visibleValue);
        const runtime = matches.some(row => row.is_runtime === true) ? true
            : matches.length && matches.every(row => row.is_runtime === false) ? false : null;
        const configured = !valid ? null : !matches.length ? false
            : values.some(value => value !== null && value !== '') ? true
                : values.every(value => value === '') ? false : null;
        return { name, present: valid ? matches.length > 0 : null, configured, runtime };
    });
}

function frequency(value) {
    if (typeof value !== 'string') return null;
    if (['@hourly', '@daily', '@weekly', '@monthly', '@yearly', '@annually'].includes(value)) return value;
    const fields = value.trim().split(/\s+/);
    return fields.length === 5 && fields.every(field => /^[0-9*/,\-]{1,30}$/.test(field)) ? fields.join(' ') : null;
}

export function summarizeTasks(rows) {
    const valid = Array.isArray(rows) && rows.every(record);
    return taskNames.map(name => {
        const matching = valid ? rows.filter(row => typeof row.name === 'string'
            && row.name.toLowerCase().trim().replace(/[ _]+/g, '-') === name) : [];
        const row = matching.length === 1 ? matching[0] : null;
        return {
            name, present: valid ? matching.length > 0 : null, duplicates: matching.length > 1,
            enabled: row ? boolean(row.enabled) : null,
            frequency: row ? frequency(row.frequency) : null,
            containerConfigured: row ? typeof row.container === 'string' && row.container.trim().length > 0 : null,
            timeoutSeconds: row ? number(row.timeout) : null,
        };
    });
}

function summarizeApplication(value) {
    if (!record(value)) return null;
    return {
        status: known(value.status, ['running', 'running:healthy', 'running:unhealthy', 'running:unknown', 'stopped', 'exited', 'starting', 'restarting', 'degraded']),
        buildPack: known(value.build_pack, ['dockercompose', 'docker-compose', 'dockerfile', 'nixpacks', 'static']),
        healthCheckEnabled: boolean(value.health_check_enabled),
        additionalDockerNetworkEnabled: boolean(value.settings?.connect_to_docker_network),
    };
}

function summarizeServer(value, primary) {
    if (!record(value)) return null;
    return {
        primary, reachable: boolean(value.settings?.is_reachable), usable: boolean(value.settings?.is_usable),
        metricsEnabled: boolean(value.settings?.is_metrics_enabled), sentinelEnabled: boolean(value.settings?.is_sentinel_enabled),
        capacity: { memoryBytes: null, availableMemoryBytes: null, availableDiskBytes: null, reason: 'not_exposed_by_documented_read_api' },
    };
}

async function readBoundedJson(response) {
    if (!response.body || Number(response.headers.get('content-length')) > maximumResponseBytes) throw new Error('unusable_response');
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            total += chunk.value.byteLength;
            if (total > maximumResponseBytes) throw new Error('unusable_response');
            chunks.push(chunk.value);
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

/** Only this fixed origin and this enumerated family of GET endpoints can receive the token. */
export async function collectReadiness({ env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
    const checks = {};
    const report = {
        schemaVersion: 1, checkedAt: now.toISOString(), operation: 'read_only_inventory',
        inspection: 'unavailable', operationalReadiness: 'not_established',
        connection: {
            urlConfigured: !!env.COOLIFY_URL, tokenConfigured: !!env.COOLIFY_TOKEN, applicationConfigured: !!env.COOLIFY_APP_UUID,
        },
        checks, application: null, servers: [], environments: summarizeEnvironments(null), tasks: summarizeTasks(null),
        limitations: [
            'Vault presence does not prove environment delivery to the running process.',
            'Graph grants, mailbox scope, licenses and meeting policies are not inspected.',
            'Scanner reachability, loaded signatures and physical capacity are not inspected.',
            'Tasks are matched by known names; command contents, execution history and actual delivery are not inspected.',
        ],
    };
    let origin;
    try {
        const url = new URL(env.COOLIFY_URL);
        if (url.origin !== trustedOrigin || url.username || url.password || url.search || url.hash
            || !['/', '/api/v1', '/api/v1/'].includes(url.pathname)) throw new Error('invalid_origin');
        origin = url.origin;
        if (!identifier.test(env.COOLIFY_APP_UUID ?? '') || !env.COOLIFY_TOKEN?.trim()) throw new Error('missing_configuration');
    } catch { checks.configuration = 'unavailable_or_untrusted'; return report; }

    const applicationPath = `/applications/${env.COOLIFY_APP_UUID}`;
    const allowed = new Set([applicationPath, `${applicationPath}/envs`, `${applicationPath}/scheduled-tasks`, `${applicationPath}/destinations`]);
    async function get(label, path) {
        if (!allowed.has(path)) throw new Error('read_endpoint_not_allowed');
        try {
            const response = await fetchImpl(`${origin}/api/v1${path}`, {
                method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000),
                headers: { Authorization: `Bearer ${env.COOLIFY_TOKEN}`, Accept: 'application/json', 'User-Agent': 'dynaminds-academy-readiness/1.0' },
            });
            if (!response.ok) { checks[label] = `http_${response.status}`; await response.body?.cancel().catch(() => undefined); return null; }
            const value = await readBoundedJson(response);
            checks[label] = 'read';
            return value;
        } catch { checks[label] = 'unavailable'; return null; }
    }
    // No retries that might turn a rate-limited inventory into production load.
    const [application, environments, tasks, destinations] = await Promise.all([
        get('application', applicationPath), get('environments', `${applicationPath}/envs`),
        get('tasks', `${applicationPath}/scheduled-tasks`), get('destinations', `${applicationPath}/destinations`),
    ]);
    report.application = summarizeApplication(application);
    report.environments = summarizeEnvironments(environments);
    report.tasks = summarizeTasks(tasks);
    if (checks.application === 'read' && !report.application) checks.application = 'unknown_schema';
    for (const [label, rows] of [['environments', environments], ['tasks', tasks]]) {
        if (checks[label] === 'read' && (!Array.isArray(rows) || !rows.every(record))) checks[label] = 'unknown_schema';
    }
    if (Array.isArray(destinations) && destinations.every(record)) {
        const servers = new Map();
        for (const destination of destinations) {
            if (typeof destination.server_uuid !== 'string' || !identifier.test(destination.server_uuid)) continue;
            servers.set(destination.server_uuid, servers.get(destination.server_uuid) === true || destination.is_primary === true);
        }
        // A malformed or unexpectedly broad response must not fan out into arbitrary inventory.
        if (servers.size > 5) checks.servers = 'too_many_destinations';
        else if (!servers.size) checks.servers = 'unknown_server_reference';
        else {
            let index = 0;
            for (const [uuid, primary] of servers) {
                const label = `server_${++index}`;
                const path = `/servers/${uuid}`;
                allowed.add(path);
                const server = summarizeServer(await get(label, path), primary);
                if (server) report.servers.push(server);
                else if (checks[label] === 'read') checks[label] = 'unknown_schema';
            }
        }
    } else if (checks.destinations === 'read') checks.destinations = 'unknown_schema';
    report.inspection = Object.values(checks).every(value => value === 'read') ? 'complete'
        : Object.values(checks).some(value => value === 'read') ? 'partial' : 'unavailable';
    return report;
}

async function main() {
    // Production credentials are provided only to the reviewed origin-repository CI step.
    if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REPOSITORY !== 'B2B-net-S-A/COMPASS') {
        throw new Error('execution_context_not_allowed');
    }
    const report = await collectReadiness();
    const json = JSON.stringify(report, null, 2);
    console.log(json);
    if (process.env.GITHUB_STEP_SUMMARY) {
        await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Academy infrastructure inventory\n\nRead-only inspection: **${report.inspection}**. Operational readiness: **not established**.\n\n\`\`\`json\n${json}\n\`\`\`\n`);
    }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(() => { console.error('Academy readiness inspection could not complete; no response details were emitted.'); process.exitCode = 1; });
}
