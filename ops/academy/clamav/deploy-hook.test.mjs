import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat, access } from 'node:fs/promises';
import { invokeHook, requestFor } from './deploy-hook.mjs';
const env = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', GITHUB_REPOSITORY: 'B2B-net-S-A/COMPASS',
    GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SHA: 'a'.repeat(40), HETZNER_HOST: '178.104.220.48', HETZNER_USER: 'root', HETZNER_SSH_KEY: 'synthetic-private-key' };

test('owner is stable for a run, different for retry and commit; only main hosted deployment is allowed', () => {
    const owner = requestFor('pause', [], env).owner;
    assert.deepEqual(requestFor('resume', [], env).owner, owner);
    assert.notEqual(requestFor('pause', [], { ...env, GITHUB_RUN_ATTEMPT: '2' }).owner.nonce, owner.nonce);
    assert.notEqual(requestFor('pause', [], { ...env, GITHUB_SHA: 'b'.repeat(40) }).owner.nonce, owner.nonce);
    for (const override of [{ GITHUB_REF: 'refs/pull/384/merge' }, { GITHUB_EVENT_NAME: 'pull_request' },
        { RUNNER_ENVIRONMENT: 'self-hosted' }, { GITHUB_REPOSITORY: 'attacker/COMPASS' }, { GITHUB_SHA: 'x' }]) {
        assert.throws(() => requestFor('pause', [], { ...env, ...override }));
    }
});

test('requests preserve exact trigger and deployment identity and reject injection or nonterminal statuses', () => {
    assert.equal(requestFor('bind', ['1-2', 'deployment-abc'], env).triggerNonce, '1-2');
    assert.equal(requestFor('terminal', ['deployment-abc', 'failed'], env).status, 'failed');
    assert.throws(() => requestFor('reject-trigger', ['1-2'], env));
    for (const [op, args] of [['bind', ['1;evil', 'deployment-abc']], ['bind', ['1-1', '$(evil)']],
        ['terminal', ['deployment-abc', 'timeout']], ['update', []]]) assert.throws(() => requestFor(op, args, env));
});

test('SSH pins host, sends JSON on stdin, protects temporary key and removes it after success', async () => {
    let key;
    const result = await invokeHook('bind', ['1-1', 'deployment-abc'], { env, run: async (args, input) => {
        key = args[1];
        assert.equal((await stat(key)).mode & 0o777, 0o600);
        assert.equal((await readFile(key, 'utf8')).trim(), env.HETZNER_SSH_KEY);
        assert(args.includes('StrictHostKeyChecking=yes'));
        assert(!args.join(' ').includes(env.HETZNER_SSH_KEY));
        assert.equal(args.at(-1), '/opt/compass-academy/host-control.sh bind');
        assert.equal(JSON.parse(input).deploymentUuid, 'deployment-abc');
        return JSON.stringify({ ok: true, runtimeOutput: 'never expose this' });
    } });
    assert.deepEqual(result, { ok: true, operation: 'bind' });
    await assert.rejects(access(key));
});

test('transport failures and malformed acknowledgements fail closed and remove credentials', async () => {
    for (const response of ['bad json', '{"ok":false}', null]) {
        let key;
        await assert.rejects(invokeHook('resume', [], { env, run: async args => {
            key = args[1];
            if (response === null) throw new Error('connection lost');
            return response;
        } }));
        await assert.rejects(access(key));
    }
});
