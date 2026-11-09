import { describe, expect, it } from 'vitest'
import { READINESS_SCENARIOS } from '../readiness-scenarios'
import { buildScenarioStates, effectiveReadinessStatus, isScenarioStale, summarizeReadiness, type ReadinessResultRow } from '../readiness'

const now = new Date('2026-11-09T12:00:00Z')
const row = (patch: Partial<ReadinessResultRow> = {}): ReadinessResultRow => ({ scenario_id: 'G04', kind: 'ręczny', sha: 'abc1234', status: 'passed', evidence_path: 'G04/x.png', note: null, run_at: '2026-11-08T12:00:00Z', valid_until: '2026-12-08T12:00:00Z', ...patch })

describe('definicje scenariuszy', () => {
    it('obejmują G01-G57 bez luk, po 26 automatów i 31 ręcznych', () => {
        expect(READINESS_SCENARIOS.map(s => s.id)).toEqual(Array.from({ length: 57 }, (_, i) => `G${String(i + 1).padStart(2, '0')}`))
        expect(READINESS_SCENARIOS.filter(s => s.kind === 'automat')).toHaveLength(26)
        expect(READINESS_SCENARIOS.filter(s => s.kind === 'ręczny')).toHaveLength(31)
    })
    it('każdy scenariusz ma ścieżki plików, po których traci ważność', () => {
        expect(READINESS_SCENARIOS.every(s => s.paths.length > 0)).toBe(true)
    })
})

describe('stan scenariusza', () => {
    it('brak wyniku to nie uruchomiono', () => expect(effectiveReadinessStatus(null, now)).toBe('not_run'))
    it('wynik po terminie ważności wygasa, nawet pozytywny', () => expect(effectiveReadinessStatus(row({ valid_until: '2026-11-09T11:59:59Z' }), now)).toBe('expired'))
    it('wynik automatu bez terminu nie wygasa z czasem', () => expect(effectiveReadinessStatus(row({ kind: 'automat', valid_until: null }), now)).toBe('passed'))
    it('nieaktualny wygrywa z terminem ważności', () => expect(effectiveReadinessStatus(row({ status: 'stale' }), now)).toBe('stale'))
    it('liczy się najnowszy wynik, a nie najlepszy', () => {
        const states = buildScenarioStates([row({ status: 'failed', run_at: '2026-11-09T10:00:00Z' }), row()], now)
        expect(states.find(s => s.id === 'G04')?.effective).toBe('failed')
    })
    it('podsumowanie dzieli 57 scenariuszy na rozłączne grupy', () => {
        const summary = summarizeReadiness(buildScenarioStates([row(), row({ scenario_id: 'G05', status: 'failed' }), row({ scenario_id: 'G06', status: 'stale' })], now))
        expect(summary).toEqual({ total: 57, passed: 1, failed: 1, notRun: 54, outdated: 1 })
    })
})

describe('ważność po zmianie plików', () => {
    const scenario = { paths: ['lib/academy/outbound.ts', 'components/academy/sessions/'] }
    it('reaguje na plik z listy i plik w katalogu', () => {
        expect(isScenarioStale(scenario, ['lib/academy/outbound.ts'])).toBe(true)
        expect(isScenarioStale(scenario, ['components/academy/sessions/AcademyCalendar.tsx'])).toBe(true)
    })
    it('ignoruje pliki o podobnej nazwie', () => expect(isScenarioStale(scenario, ['lib/academy/outbound.ts.bak', 'components/academy/sessions.ts'])).toBe(false))
})
