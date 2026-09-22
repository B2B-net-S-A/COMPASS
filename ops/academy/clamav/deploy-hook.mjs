import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const host = '178.104.220.48';
const hostKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFrtYvLwQUrw3GhnJs/y0LKt5maZ6qZVWpnb3bL9CRft';
const actions = new Set(['pause', 'begin-trigger', 'bind', 'terminal', 'resume']);

export function requestFor(action, args, env) {
    if (!actions.has(action) || env.GITHUB_ACTIONS !== 'true' || env.RUNNER_ENVIRONMENT !== 'github-hosted'
        || env.GITHUB_REPOSITORY !== 'B2B-net-S-A/COMPASS' || env.GITHUB_REF !== 'refs/heads/main'
        || !['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME)
        || !/^\d+$/.test(env.GITHUB_RUN_ID ?? '') || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? '')
        || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')) throw new Error('invalid_deploy_context');
    const owner = { runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, sha: env.GITHUB_SHA,
        nonce: createHash('sha256').update(`${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT}:${env.GITHUB_SHA}`).digest('hex') };
    const request = { owner };
    if (['begin-trigger', 'bind'].includes(action)) {
        if (!/^\d+-\d+$/.test(args[0] ?? '')) throw new Error('invalid_trigger_nonce');
        request.triggerNonce = args[0];
    }
    if (action === 'bind' || action === 'terminal') {
        const uuid = args[action === 'bind' ? 1 : 0];
        if (!/^[a-zA-Z0-9-]{8,128}$/.test(uuid ?? '')) throw new Error('invalid_deployment_uuid');
        request.deploymentUuid = uuid;
    }
    if (action === 'terminal') {
        if (!['finished', 'failed', 'cancelled'].includes(args[1])) throw new Error('invalid_terminal_status');
        request.status = args[1];
    }
    return request;
}

async function ssh(args, input) {
    return new Promise((resolve, reject) => {
        const child = spawn('ssh', args, { env: { PATH: process.env.PATH, LANG: 'C' }, stdio: ['pipe', 'pipe', 'pipe'] });
        let output = '', overflow = false;
        const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('host_control_timeout')); }, 720000);
        child.stdout.on('data', chunk => { output += chunk; if (output.length > 8192) { overflow = true; child.kill('SIGKILL'); } });
        child.stderr.resume();
        child.stdin.on('error', () => {});
        child.on('error', () => { clearTimeout(timer); reject(new Error('host_control_unavailable')); });
        child.on('close', code => { clearTimeout(timer); code === 0 && !overflow ? resolve(output) : reject(new Error('host_control_failed')); });
        child.stdin.end(input);
    });
}

export async function invokeHook(action, args = [], { env = process.env, run = ssh } = {}) {
    const request = requestFor(action, args, env);
    if (env.HETZNER_HOST !== host || !/^[_a-z][_a-z0-9-]{0,31}$/.test(env.HETZNER_USER ?? '')
        || !env.HETZNER_SSH_KEY) throw new Error('invalid_ssh_configuration');
    const directory = await mkdtemp(join(tmpdir(), 'academy-deploy-hook-'));
    try {
        const key = join(directory, 'key'), known = join(directory, 'known_hosts');
        await writeFile(key, env.HETZNER_SSH_KEY.trim() + '\n', { mode: 0o600 });
        await writeFile(known, `${host} ${hostKey}\n`, { mode: 0o600 });
        const raw = await run(['-i', key, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
            '-o', `UserKnownHostsFile=${known}`, '-o', 'ConnectTimeout=15', '-o', 'LogLevel=ERROR',
            `${env.HETZNER_USER}@${host}`, `/opt/compass-academy/host-control.sh ${action}`], JSON.stringify(request));
        if (JSON.parse(raw).ok !== true) throw new Error('host_control_not_confirmed');
        return { ok: true, operation: action };
    } finally { await rm(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try { console.log(JSON.stringify(await invokeHook(process.argv[2], process.argv.slice(3)))); }
    catch { console.error('academy_deploy_hook_failed; scanner remains paused until confirmed recovery'); process.exitCode = 1; }
}
