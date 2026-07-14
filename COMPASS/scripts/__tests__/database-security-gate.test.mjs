import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const workflowPath = fileURLToPath(
    new URL('../../../.github/workflows/build-check.yml', import.meta.url),
)

test('quality-gate requires the complete database security suite', async () => {
    const workflow = await readFile(workflowPath, 'utf8')

    assert.match(
        workflow,
        /supabase test db --workdir COMPASS --local\s+COMPASS\/supabase\/tests\s/,
        'database-replay must execute every pgTAP suite, not a single test file',
    )

    const qualityGate = workflow.slice(workflow.indexOf('\n  quality-gate:'))
    assert.notEqual(qualityGate, workflow, 'quality-gate job must exist')
    assert.match(
        qualityGate,
        /needs:\s+(?:\s*- [^\n]+\n)*\s*- database-replay\s/m,
        'quality-gate must depend on database-replay',
    )
    assert.match(
        qualityGate,
        /DATABASE_REPLAY: \$\{\{ needs\.database-replay\.result \}\}/,
        'database-replay conclusion must be captured explicitly',
    )
    assert.match(
        qualityGate,
        /for result in [^\n]*"\$DATABASE_REPLAY"/,
        'a failed or skipped database-replay must fail the required check',
    )
})
