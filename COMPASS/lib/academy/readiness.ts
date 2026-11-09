// Czysta logika panelu Gotowość (B0.5): bez dostępu do bazy, żeby dało się ją przetestować przypadkami brzegowymi.
import { READINESS_SCENARIOS, type ReadinessScenario } from './readiness-scenarios'

export type ReadinessStatus = 'passed' | 'failed' | 'stale'
export type ReadinessEffective = ReadinessStatus | 'expired' | 'not_run'
export type LaunchConditionStatus = 'not_started' | 'in_progress' | 'ready'

export interface ReadinessResultRow {
    scenario_id: string
    kind: 'automat' | 'ręczny'
    sha: string
    status: ReadinessStatus
    evidence_path: string | null
    note: string | null
    run_at: string
    valid_until: string | null
}
export interface ReadinessScenarioState extends ReadinessScenario {
    latest: ReadinessResultRow | null
    effective: ReadinessEffective
}
export interface LaunchCondition {
    item: string
    owner: string
    status: LaunchConditionStatus
    evidence: string | null
    decided_at: string | null
}
export interface ReadinessSwitch { name: string; label: string; enabled: boolean }
export interface ReadinessOverview {
    migrationPending: boolean
    rolloutMode: 'closed' | 'pilot' | 'open' | null
    scenarios: ReadinessScenarioState[]
    conditions: LaunchCondition[]
    switches: ReadinessSwitch[]
    outbox: { held: number; expired: number; sentTest: number } | null
    currentSha: string
}

export const READINESS_EFFECTIVE_LABELS: Record<ReadinessEffective, string> = {
    passed: 'Przechodzi', failed: 'Nie przechodzi', stale: 'Nieaktualny', expired: 'Wygasł', not_run: 'Nie uruchomiono',
}
export const LAUNCH_STATUS_LABELS: Record<LaunchConditionStatus, string> = { not_started: 'Nie rozpoczęto', in_progress: 'W toku', ready: 'Gotowe' }

export function effectiveReadinessStatus(latest: ReadinessResultRow | null, now: Date): ReadinessEffective {
    if (!latest) return 'not_run'
    if (latest.status === 'stale') return 'stale'
    if (latest.valid_until && new Date(latest.valid_until).getTime() < now.getTime()) return 'expired'
    return latest.status
}

/** Wiersze muszą przyjść od najnowszego; pierwszy wiersz scenariusza jest jego stanem. */
export function buildScenarioStates(rows: ReadinessResultRow[], now: Date): ReadinessScenarioState[] {
    const latest = new Map<string, ReadinessResultRow>()
    for (const row of rows) if (!latest.has(row.scenario_id)) latest.set(row.scenario_id, row)
    return READINESS_SCENARIOS.map(scenario => {
        const result = latest.get(scenario.id) ?? null
        return { ...scenario, latest: result, effective: effectiveReadinessStatus(result, now) }
    })
}

export function summarizeReadiness(scenarios: ReadinessScenarioState[]) {
    const count = (status: ReadinessEffective) => scenarios.filter(scenario => scenario.effective === status).length
    return { total: scenarios.length, passed: count('passed'), failed: count('failed'), notRun: count('not_run'), outdated: count('stale') + count('expired') }
}

export function isScenarioStale(scenario: Pick<ReadinessScenario, 'paths'>, changedFiles: readonly string[]): boolean {
    return changedFiles.some(file => scenario.paths.some(path => path.endsWith('/') ? file.startsWith(path) : file === path))
}
