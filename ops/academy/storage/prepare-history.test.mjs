import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prepareHistory } from './prepare-history.mjs';
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
