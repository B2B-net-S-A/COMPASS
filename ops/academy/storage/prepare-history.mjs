import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Repository history has duplicate date-only version prefixes. Never rename the
// source migrations or repair production history: normalize only disposable copies.
// Audited dependencies: bootstrap/columns must precede dependent repairs.
// Hash pins make future edits require an explicit review of this exception.
export const candidateStorageOrder = {
    id: 'candidate_storage_bootstrap_before_repairs',
    files: [
        ['20260208_storage_candidates.sql', '84fe3d44fcbf2079fcb2aabb4c13ae2579eb2115a6c28ee43610796da56d16aa'],
        ['20260208_fix_permissions_final.sql', '8d023350529fde5c4b2727496c7cbb848209fd27c94c2aae3773e778265dcfc7'],
        ['20260208_fix_storage_policy.sql', 'ed8f8a7b78301149aa6b47b2393eb24134ca9f64e59c9e8ef8bd85bacd4eab69'],
    ],
};
export const availabilitySchemaOrder = {
    id: 'profile_candidate_status_before_availability_constraints',
    files: [
        ['20260218_fix_schema_mismatches.sql', 'f7944ea98e3e9036f3c2397a13344ed02c44593cfddf3f87308546a71c3d26c9'],
        ['20260216_availability_overhaul.sql', '1def653dfeadea494923231857debbe1d94482854ca68243583585d00e7d4624'],
    ],
};
export const invoiceSchemaOrder = {
    id: 'invoice_policy_creation_before_guarded_verification',
    files: [
        ['20260219_invoices.sql', 'b0a4b1eb525dd09afe321485b62344ab12e061bdf76d1a71244b658caaf0d3d7'],
        ['20260218_verify_and_fix_all.sql', '313ec9de92634ca472e80d770139ccaf132465a76c6ca9280267348eadc6b591'],
    ],
};
export const candidateClaimOrder = {
    id: 'candidate_base_policy_then_status_then_claim_fix',
    files: [
        ['20260222_etap1b_fix_candidates_rls.sql', 'f0ca9dd6f21801f2e86b875b6b5f96653a7169de8f6c46bc087db3d07050cd2b'],
        ['20260222_etap2_candidates_extend.sql', 'bd62d231c6d49e3f7c11609064a4a073b2a63c2d76df62f50800267a53738366'],
        ['20260222_bugfix_rls_claim.sql', '25ecd63f6bbe686fed70a862ad5c52002990a56af59e8ed686eba5178ee0ef3b'],
    ],
};
export const communicatorBootstrap = {
    id: 'archived_communicator_before_chat_attachments',
    original: 'm10_communicator_setup.sql',
    sourceRelativePath: '../_archive_scripts/m10_communicator_setup.sql',
    sha256: 'e78eeafdcd5d7c4f36d765bb77170b4487bd04b5a21582ca3d63cb8c3d136e89',
    before: '20260216_chat_attachments.sql',
};
export const orderExceptions = [candidateStorageOrder, availabilitySchemaOrder, invoiceSchemaOrder, candidateClaimOrder];
const sha256 = content => createHash('sha256').update(content).digest('hex');

export function prepareHistory(source, target) {
    assert.notEqual(fs.realpathSync(source), fs.realpathSync(target));
    assert.equal(fs.readdirSync(target).length, 0, 'replay_destination_must_be_empty');
    const names = fs.readdirSync(source).filter(name => name.endsWith('.sql')).sort();
    assert(names.length > 0 && names.length < 100000);
    const lexicalNames = [...names];
    const appliedExceptions = new Map();
    for (const exception of orderExceptions) {
        const exceptionNames = exception.files.map(([name]) => name);
        if (!exceptionNames.some(name => names.includes(name))) continue;
        for (const [name, expectedHash] of exception.files) {
            assert(names.includes(name), `incomplete_replay_order_exception:${name}`);
            assert.equal(sha256(fs.readFileSync(path.join(source, name))), expectedHash, `changed_replay_order_exception:${name}`);
            appliedExceptions.set(name, exception.id);
        }
        for (let index = exceptionNames.length - 2; index >= 0; index--) {
            const before = exceptionNames[index], after = exceptionNames[index + 1];
            if (names.indexOf(before) < names.indexOf(after)) continue;
            names.splice(names.indexOf(before), 1);
            names.splice(names.indexOf(after), 0, before);
        }
    }
    // This committed pre-migration script is the only original definition of the
    // three communicator tables. Replay it verbatim, including its RLS, rather
    // than synthesizing an incomplete baseline. This never touches source files.
    const hasCommunicatorBootstrap = names.includes(communicatorBootstrap.before);
    if (hasCommunicatorBootstrap) {
        const content = fs.readFileSync(path.resolve(source, communicatorBootstrap.sourceRelativePath));
        assert.equal(sha256(content), communicatorBootstrap.sha256, 'changed_archived_communicator_bootstrap');
        names.splice(names.indexOf(communicatorBootstrap.before), 0, communicatorBootstrap.original);
        appliedExceptions.set(communicatorBootstrap.original, communicatorBootstrap.id);
    }
    const manifest = names.map((original, index) => {
        assert(/^[a-zA-Z0-9_.-]+\.sql$/.test(original), 'invalid_migration_name');
        const isBootstrap = hasCommunicatorBootstrap && original === communicatorBootstrap.original;
        const sourceRelativePath = isBootstrap ? communicatorBootstrap.sourceRelativePath : original;
        const content = fs.readFileSync(path.resolve(source, sourceRelativePath));
        const replay = `${String(20000101000000 + index + 1)}_${original}`;
        fs.writeFileSync(path.join(target, replay), content, { flag: 'wx' });
        assert.deepEqual(fs.readFileSync(path.join(target, replay)), content);
        return { original, replay, sha256: sha256(content), sourceKind: isBootstrap ? 'archived_bootstrap' : 'migration', sourceRelativePath,
            lexicalIndex: isBootstrap ? null : lexicalNames.indexOf(original), replayIndex: index,
            orderingException: appliedExceptions.get(original) ?? null };
    });
    fs.writeFileSync(path.join(target, 'replay-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const manifest = prepareHistory(process.argv[2], process.argv[3]);
    console.log(JSON.stringify({ replay: 'source_verified_reconstruction_with_disposable_version_ids', files: manifest.length, sourceSqlBytesPreserved: true,
        originalHistoryUnchanged: !manifest.some(row => row.orderingException),
        migrationFiles: manifest.filter(row => row.sourceKind === 'migration').length,
        archivedBootstraps: manifest.filter(row => row.sourceKind === 'archived_bootstrap').map(row => ({ sourceRelativePath: row.sourceRelativePath, sha256: row.sha256 })),
        orderingExceptions: [...new Set(manifest.map(row => row.orderingException).filter(Boolean))] }));
}
