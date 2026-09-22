import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { candidateStorageOrder, prepareHistory } from './prepare-history.mjs';
import { fileURLToPath } from 'node:url';
test('replays every duplicate-version file in original lexical order without changing SQL', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'academy-history-'));
    try {
        const source = path.join(root, 'source'), target = path.join(root, 'target');
        fs.mkdirSync(source); fs.mkdirSync(target);
        const files = { '20260208_b.sql': 'select 2;\n', '20260208_a.sql': 'select 1;\r\n', '20260922000100_c.sql': 'select 3;\n' };
        for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(source, name), sql);
        const manifest = prepareHistory(source, target);
        assert.deepEqual(manifest.map(row => row.original), Object.keys(files).sort());
        assert.equal(new Set(manifest.map(row => row.replay.split('_')[0])).size, 3);
        for (const row of manifest) assert.equal(fs.readFileSync(path.join(target, row.replay), 'utf8'), files[row.original]);
        assert.throws(() => prepareHistory(source, source));
        assert.throws(() => prepareHistory(source, target));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('executes the reviewed bootstrap before same-day repairs and retains every original byte', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'academy-history-order-'));
    try {
        const source = path.join(root, 'source'), target = path.join(root, 'target');
        fs.mkdirSync(source); fs.mkdirSync(target);
        for (const [name] of candidateStorageOrder.files) fs.copyFileSync(new URL(`../../../COMPASS/supabase/migrations/${name}`, import.meta.url), path.join(source, name));
        fs.writeFileSync(path.join(source, '20260208_fix_projects_rls.sql'), 'select 1;');
        fs.writeFileSync(path.join(source, '20260209_next.sql'), 'select 2;');
        const manifest = prepareHistory(source, target);
        assert.deepEqual(manifest.map(row => row.original), [
            '20260208_storage_candidates.sql', '20260208_fix_permissions_final.sql', '20260208_fix_projects_rls.sql', '20260208_fix_storage_policy.sql', '20260209_next.sql',
        ]);
        assert.equal(manifest.filter(row => row.orderingException === candidateStorageOrder.id).length, 3);
        for (const row of manifest) assert.deepEqual(fs.readFileSync(path.join(target, row.replay)), fs.readFileSync(path.join(source, row.original)));
        assert.equal(manifest[0].lexicalIndex, 3);
        assert.equal(manifest[0].replayIndex, 0);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('fails closed when the reviewed ordering cohort changes or loses a migration', () => {
    for (const changed of [false, true]) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'academy-history-drift-'));
        try {
            const source = path.join(root, 'source'), target = path.join(root, 'target');
            fs.mkdirSync(source); fs.mkdirSync(target);
            for (const [name] of candidateStorageOrder.files) fs.copyFileSync(new URL(`../../../COMPASS/supabase/migrations/${name}`, import.meta.url), path.join(source, name));
            const candidate = path.join(source, candidateStorageOrder.files[0][0]);
            if (changed) fs.appendFileSync(candidate, '\nselect unexpected_change;'); else fs.unlinkSync(candidate);
            assert.throws(() => prepareHistory(source, target), changed ? /changed_replay_order_exception/ : /incomplete_replay_order_exception/);
            assert.deepEqual(fs.readdirSync(target), []);
        } finally { fs.rmSync(root, { recursive: true, force: true }); }
    }
});

test('prepares every repository migration without silently dropping duplicate content or SQL errors', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'academy-history-repository-'));
    try {
        const source = fileURLToPath(new URL('../../../COMPASS/supabase/migrations', import.meta.url));
        const manifest = prepareHistory(source, root);
        const names = fs.readdirSync(source).filter(name => name.endsWith('.sql')).sort();
        assert.deepEqual(manifest.map(row => row.original).sort(), names);
        assert.equal(manifest.length, names.length);
        assert(manifest.some(row => row.original === '20260216_chat_attachments_backup.sql'));
        for (const row of manifest) assert.deepEqual(fs.readFileSync(path.join(root, row.replay)), fs.readFileSync(path.join(source, row.original)));
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
