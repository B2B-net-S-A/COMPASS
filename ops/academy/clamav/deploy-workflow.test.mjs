import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const workflow = await readFile(new URL('../../../.github/workflows/deploy.yml', import.meta.url), 'utf8');
const section = workflow.split('      - name: Deploy (trigger + wait, with retry on server-side build failure)')[1]
    .split('      - name: Resume Academy scanner')[0];
const script = section.split('        run: |\n')[1].replace(/^          /gm, '').replace(/\$\{\{[^}]+\}\}/g, 'synthetic');

async function scenario(name) {
    const dir = await mkdtemp(join(tmpdir(), 'academy-deploy-test-'));
    const events = join(dir, 'events'), counter = join(dir, 'counter');
    const mock = async (name, body) => writeFile(join(dir, name), `#!${process.execPath}\n${body}`, { mode: 0o700 });
    try {
        await mock('node', `require('node:fs').appendFileSync(process.env.EVENTS,process.argv.slice(3).join(' ')+'\\n');`);
        await mock('sleep', '');
        await mock('curl', `const fs=require('node:fs');const url=process.argv.at(-1);let n=Number(fs.existsSync(process.env.COUNTER)?fs.readFileSync(process.env.COUNTER,'utf8'):0);
            const trigger=url.includes('/deploy?');fs.appendFileSync(process.env.EVENTS,(trigger?'trigger':'poll')+'\\n');
            if(trigger){n++;fs.writeFileSync(process.env.COUNTER,String(n));
                if(process.env.SCENARIO==='ambiguous'){console.log('server failure\\nHTTP_CODE:500');process.exit(0);}
                if(process.env.SCENARIO==='queue'&&n===1){console.log('{"message":"Deployment queue is full"}\\nHTTP_CODE:429');process.exit(0);}
                if(process.env.SCENARIO==='missing'){console.log('{}\\nHTTP_CODE:200');process.exit(0);}
                console.log(JSON.stringify({deployments:[{deployment_uuid:'deployment-'+n}]})+'\\nHTTP_CODE:200');
            }else{console.log(JSON.stringify({status:process.env.SCENARIO==='retry'&&n===1?'failed':process.env.SCENARIO==='cancel'?'cancelled-by-user':'finished'}));}`);
        let code = 0;
        try { await execute('bash', ['-e', '-o', 'pipefail', '-c', script], { timeout: 10000,
            env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, EVENTS: events, COUNTER: counter,
                SCENARIO: name, ACADEMY_CLAMAV_COLOCATED: 'true' } }); }
        catch (error) { code = error.code; }
        return { code, events: (await readFile(events, 'utf8')).trim().split('\n') };
    } finally { await rm(dir, { recursive: true, force: true }); }
}

test('actual workflow records trigger before HTTP and binds deployment before polling', async () => {
    assert.deepEqual(await scenario('success'), { code: 0, events: ['begin-trigger 1-1', 'trigger', 'bind 1-1 deployment-1', 'poll', 'terminal deployment-1 finished'] });
});
test('both failed and succeeding builds become terminal before scanner restart is possible', async () => {
    const retry = await scenario('retry');
    assert.equal(retry.code, 0);
    assert(retry.events.indexOf('terminal deployment-1 failed') < retry.events.indexOf('begin-trigger 2-1'));
    assert.equal(retry.events.at(-1), 'terminal deployment-2 finished');
});
test('ambiguous response or missing UUID never retries or reports a terminal deployment', async () => {
    for (const name of ['ambiguous', 'missing', 'queue']) assert.deepEqual(await scenario(name), { code: 1, events: ['begin-trigger 1-1', 'trigger'] });
});
test('human cancellation is recorded and never retried', async () => {
    assert.deepEqual(await scenario('cancel'), { code: 1, events: ['begin-trigger 1-1', 'trigger', 'bind 1-1 deployment-1', 'poll', 'terminal deployment-1 cancelled'] });
});
