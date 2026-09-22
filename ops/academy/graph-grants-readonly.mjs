// Optional diagnostic only. No Graph API calls, consent requests, resource writes,
// token persistence, credential exports or dependency on the token's JWT format.
import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const coolifyOrigin = 'https://coolify-compass.dynaminds.pl';
const graphApplicationId = '00000003-0000-0000-c000-000000000000';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const appIdentifier = /^[a-zA-Z0-9-]{8,64}$/;
const requiredRoles = Object.freeze(['Calendars.ReadWrite', 'OnlineMeetings.Read.All', 'OnlineMeetingArtifact.Read.All']);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unknown = () => Object.fromEntries(requiredRoles.map(role => [role, null]));

function trustedContext(env) {
    return env.GITHUB_ACTIONS === 'true' && env.RUNNER_ENVIRONMENT === 'github-hosted'
        && env.GITHUB_REPOSITORY === 'B2B-net-S-A/COMPASS'
        && ['refs/heads/main', 'refs/heads/feat/academy-enterprise'].includes(env.GITHUB_REF)
        && ['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME);
}

async function boundedJson(response, maximumBytes) {
    if (!response.ok || !response.body || Number(response.headers.get('content-length')) > maximumBytes) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error('unavailable');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > maximumBytes) throw new Error('unavailable');
            chunks.push(chunk.value);
        }
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}

function runtimeValue(rows, key) {
    const matching = rows.filter(row => row.key === key && row.is_preview !== true);
    if (matching.length !== 1 || matching[0].is_runtime !== true) throw new Error('unavailable');
    const row = matching[0];
    // real_value resolves a shared variable. Never submit an unresolved template,
    // masked secret or conflicting duplicate configuration as a credential.
    const value = typeof row.real_value === 'string' ? row.real_value : row.value;
    if (typeof value !== 'string' || !value || value.length > 8192
        || /\{\{|\*{3,}|redacted|hidden|encrypted/i.test(value) || /[\r\n\u0000]/.test(value)) throw new Error('unavailable');
    return value;
}

function inspectKnownRoles(token, tenantId, clientId, now) {
    if (typeof token !== 'string' || token.length > 128 * 1024) return unknown();
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return unknown();
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!record(payload)) return unknown();
    const second = Math.floor(now.getTime() / 1000);
    const issuers = [`https://sts.windows.net/${tenantId}/`, `https://login.microsoftonline.com/${tenantId}/v2.0`];
    if (!issuers.includes(payload.iss)
        || ![graphApplicationId, 'https://graph.microsoft.com', 'https://graph.microsoft.com/'].includes(payload.aud)
        || !Number.isSafeInteger(payload.exp) || payload.exp <= second
        || (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf > second + 300))
        || (payload.iat !== undefined && (!Number.isSafeInteger(payload.iat) || payload.iat > second + 300))
        || typeof payload.tid !== 'string' || payload.tid.toLowerCase() !== tenantId
        || typeof (payload.azp ?? payload.appid) !== 'string' || (payload.azp ?? payload.appid).toLowerCase() !== clientId
        || payload.scp !== undefined) return unknown();
    // Role-less app-only tokens are possible. A valid, inspected absence is false;
    // unreadable/opaque tokens or invalid claim boundaries remain unknown (null).
    const roles = payload.roles ?? [];
    if (!Array.isArray(roles) || roles.length > 512 || roles.some(role => typeof role !== 'string')) return unknown();
    return Object.fromEntries(requiredRoles.map(role => [role, roles.includes(role)]));
}

/** Return only three allowlisted booleans, or null when the diagnostic cannot establish a result. */
export async function collectGraphGrantEvidence({ env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
    if (!trustedContext(env)) return unknown();
    try {
        const endpoint = new URL(env.COOLIFY_URL);
        if (endpoint.origin !== coolifyOrigin || endpoint.username || endpoint.password || endpoint.search || endpoint.hash
            || !['/', '/api/v1', '/api/v1/'].includes(endpoint.pathname)
            || !appIdentifier.test(env.COOLIFY_APP_UUID ?? '') || !env.COOLIFY_TOKEN?.trim()) return unknown();
        const response = await fetchImpl(`${coolifyOrigin}/api/v1/applications/${env.COOLIFY_APP_UUID}/envs`, {
            method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15_000),
            headers: { Authorization: `Bearer ${env.COOLIFY_TOKEN}`, Accept: 'application/json', 'User-Agent': 'dynaminds-academy-graph-grants/1.0' },
        });
        const rows = await boundedJson(response, 2 * 1024 * 1024);
        if (!Array.isArray(rows) || !rows.every(record)) return unknown();
        const tenantId = runtimeValue(rows, 'AZURE_TENANT_ID');
        const clientId = runtimeValue(rows, 'AZURE_CLIENT_ID');
        const clientSecret = runtimeValue(rows, 'AZURE_CLIENT_SECRET');
        if (!uuid.test(tenantId) || !uuid.test(clientId)) return unknown();
        const normalizedTenant = tenantId.toLowerCase();
        const normalizedClient = clientId.toLowerCase();
        // .default requests already consented Graph permissions; this does not
        // enter an admin-consent flow or create/change any permission assignment.
        const tokenResponse = await fetchImpl(`https://login.microsoftonline.com/${normalizedTenant}/oauth2/v2.0/token`, {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
            body: new URLSearchParams({ client_id: normalizedClient, client_secret: clientSecret,
                grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }),
        });
        const result = await boundedJson(tokenResponse, 256 * 1024);
        if (!record(result) || typeof result.token_type !== 'string' || result.token_type.toLowerCase() !== 'bearer') return unknown();
        // The diagnostic trusts the direct HTTPS issuer response, not a supplied
        // JWT. This is deliberately not a cryptographic token verifier and must
        // never authorize application operations or replace the business pilot.
        return inspectKnownRoles(result.access_token, normalizedTenant, normalizedClient, now);
    } catch {
        // Provider bodies, errors, tokens, IDs and configuration never leave here.
        return unknown();
    }
}

async function main() {
    const json = JSON.stringify(await collectGraphGrantEvidence(), null, 2);
    console.log(json);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
        `## Academy Graph role diagnostic\n\nOptional evidence from the issuer response. Null means unknown. Organizer, mailbox scope, licenses and Teams policy remain unverified.\n\n\`\`\`json\n${json}\n\`\`\`\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(() => { console.error('Graph role diagnostic unavailable; response details were suppressed.'); process.exitCode = 1; });
}
