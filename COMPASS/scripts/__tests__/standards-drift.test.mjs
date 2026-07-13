import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { checkStandardsDrift } from '../check-standards-drift.mjs'

function fixture(mode = 'enforced') {
    const root = mkdtempSync(join(tmpdir(), 'compass-standards-test-'))
    const central = join(root, 'central')
    mkdirSync(join(root, '.github/standards'), { recursive: true })
    mkdirSync(join(central, 'generated/compass'), { recursive: true })
    writeFileSync(join(root, 'AGENTS.md'), 'same standard\n')
    writeFileSync(join(central, 'generated/compass/AGENTS.md'), 'same standard\n')
    writeFileSync(join(root, '.github/standards/manifest.json'), JSON.stringify({
        schemaVersion: 1,
        mode,
        sourceRepository: 'artur-t-96/engineering-standards',
        sourceRef: mode === 'enforced' ? 'a'.repeat(40) : null,
        files: [{ source: 'generated/compass/AGENTS.md', target: 'AGENTS.md' }],
    }))
    return { root, central }
}

describe('standards drift checker', () => {
    it('accepts a byte-identical file at a pinned central SHA', () => {
        const { root, central } = fixture()
        assert.deepEqual(checkStandardsDrift({ repoRoot: root, standardsDir: central }), {
            mode: 'enforced',
            compared: 1,
        })
    })

    it('fails when a tracked local file drifts', () => {
        const { root, central } = fixture()
        writeFileSync(join(root, 'AGENTS.md'), 'local exception hidden in baseline\n')
        assert.throws(
            () => checkStandardsDrift({ repoRoot: root, standardsDir: central }),
            /Standards drift detected/,
        )
    })

    it('allows scaffold mode without pretending central comparison ran', () => {
        const { root } = fixture('scaffold')
        assert.deepEqual(checkStandardsDrift({ repoRoot: root }), {
            mode: 'scaffold',
            compared: 0,
        })
    })
})
