import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../../..', import.meta.url))
const standardsRef = 'b9bd87651d97b8e617541d6a3e3274bfa877edd3'

test('quality-gate enforces the exact coverage standard', async () => {
    const [workflow, ratchetText, lockText] = await Promise.all([
        readFile(`${repositoryRoot}/.github/workflows/build-check.yml`, 'utf8'),
        readFile(`${repositoryRoot}/.standards/coverage-ratchet.json`, 'utf8'),
        readFile(`${repositoryRoot}/.standards/standards.lock.json`, 'utf8'),
    ])
    const ratchet = JSON.parse(ratchetText)
    const lock = JSON.parse(lockText)

    assert.match(workflow, /run: \.\/scripts\/ci\/changed-coverage/)
    assert.match(workflow, /\.standards\/tools\/check_coverage\.py/)
    assert.match(workflow, /--base-sha "\$COVERAGE_BASE_SHA"/)
    assert.match(workflow, /fetch-depth: 0/)
    assert.equal(ratchet.minimum_changed_lines_percent, 80)
    assert.ok(ratchet.total_lines.covered > 0)
    assert.ok(ratchet.total_lines.found >= ratchet.total_lines.covered)
    assert.equal(lock.ref, standardsRef)

    const pinnedReferences = workflow.match(
        /artur-t-96\/engineering-standards\/[^\s@]+@([0-9a-f]{40})/g,
    ) ?? []
    assert.ok(pinnedReferences.length >= 2)
    assert.ok(pinnedReferences.every((reference) => reference.endsWith(`@${standardsRef}`)))

    const qualityGate = workflow.slice(workflow.indexOf('\n  quality-gate:'))
    assert.match(qualityGate, /\s+- typecheck-and-build\s/)
})
