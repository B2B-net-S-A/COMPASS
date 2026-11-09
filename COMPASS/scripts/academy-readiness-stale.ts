// Oznacza jako nieaktualne wyniki scenariuszy, których pliki zmieniły się po SHA wyniku (reguła ważności z planu B0).
// Użycie: ACADEMY_E2E_BASE_URL=... ACADEMY_READINESS_SECRET=... npx tsx scripts/academy-readiness-stale.ts [--dry-run]
// Wymaga pełnej historii gita (fetch-depth: 0). Działa tylko na scenariusz_id, SHA i status.
import { execFileSync } from 'node:child_process'
import { READINESS_SCENARIOS } from '../lib/academy/readiness-scenarios'
import { isScenarioStale } from '../lib/academy/readiness'

const base = process.env.ACADEMY_E2E_BASE_URL
const secret = process.env.ACADEMY_READINESS_SECRET
if (!base || !secret) throw new Error('Ustaw ACADEMY_E2E_BASE_URL i ACADEMY_READINESS_SECRET.')
const headers = { authorization: `Bearer ${secret}`, 'content-type': 'application/json', 'user-agent': 'dynaminds-smoke-test/1.0 academy-acceptance' }
const dryRun = process.argv.includes('--dry-run')

function changedSince(sha: string): string[] | null {
    try {
        return execFileSync('git', ['diff', '--name-only', `${sha}...HEAD`, '--', '.'], { encoding: 'utf8' }).split('\n').filter(Boolean).map(file => file.replace(/^COMPASS\//, ''))
    } catch {
        return null
    }
}

async function main() {
    const response = await fetch(`${base}/api/internal/academy-readiness`, { headers })
    if (!response.ok) throw new Error(`Odczyt wyników odrzucony: ${response.status}`)
    const { results } = await response.json() as { results: Array<{ scenario_id: string; sha: string; status: string }> }
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    let marked = 0
    for (const result of results) {
        const scenario = READINESS_SCENARIOS.find(item => item.id === result.scenario_id)
        if (!scenario || result.status === 'stale') continue
        const changed = changedSince(result.sha)
        // Nieznany SHA (np. po przepisaniu historii) nie może udawać ważnego wyniku.
        if (changed !== null && !isScenarioStale(scenario, changed)) continue
        marked += 1
        console.log(`${result.scenario_id}: nieaktualny (wynik z ${result.sha.slice(0, 7)})`)
        if (dryRun) continue
        const write = await fetch(`${base}/api/internal/academy-readiness`, { method: 'POST', headers, body: JSON.stringify({ scenario_id: result.scenario_id, sha: head, status: 'stale' }) })
        if (!write.ok) throw new Error(`Zapis ${result.scenario_id} odrzucony: ${write.status}`)
    }
    console.log(`Nieaktualnych: ${marked} z ${results.length}`)
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1) })
