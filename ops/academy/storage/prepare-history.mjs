import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Repository history has duplicate date-only version prefixes. Never rename the
// source migrations or repair production history: normalize only disposable copies.
export function prepareHistory(source, target) {
    assert.notEqual(fs.realpathSync(source), fs.realpathSync(target));
    assert.equal(fs.readdirSync(target).length, 0, 'replay_destination_must_be_empty');
    const names = fs.readdirSync(source).filter(name => name.endsWith('.sql')).sort();
    assert(names.length > 0 && names.length < 100000);
    const manifest = names.map((original, index) => {
        assert(/^[a-zA-Z0-9_.-]+\.sql$/.test(original), 'invalid_migration_name');
        const content = fs.readFileSync(path.join(source, original));
        const replay = `${String(20000101000000 + index + 1)}_${original}`;
        fs.writeFileSync(path.join(target, replay), content, { flag: 'wx' });
        assert.deepEqual(fs.readFileSync(path.join(target, replay)), content);
        return { original, replay, sha256: createHash('sha256').update(content).digest('hex') };
    });
    fs.writeFileSync(path.join(target, 'replay-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const manifest = prepareHistory(process.argv[2], process.argv[3]);
    console.log(JSON.stringify({ replay: 'ordered_sql_with_disposable_version_ids', files: manifest.length, originalSqlUnchanged: true }));
}
