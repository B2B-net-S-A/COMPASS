import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockSupabase, MockSupabaseConfig } from '@/test/mocks/supabase'
import { academyFixture, USER } from './academy-fixtures'
import { getAcademyReadiness, getReadinessEvidenceUrl, recordReadinessResult, updateLaunchCondition } from '../academy-readiness'

let client: MockSupabase
vi.mock('@/lib/supabase/server', () => ({ createClient: () => client }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }))
const admin = (config: MockSupabaseConfig = {}) => { client = academyFixture({ ...config, tables: { profiles: [{ id: USER, role: 'admin' }], academy_readiness_results: [], academy_launch_conditions: [], academy_outbox: [], ...config.tables } }); return client }
beforeEach(() => { admin() })
const manual = { scenarioId: 'G04', sha: 'abc1234', status: 'failed' as const, evidencePath: null, note: null }

describe('panel Gotowość: odmowy', () => {
    it.each(['talent_community', 'consultant', 'internal'])('rola %s nie odczyta panelu', async role => {
        client = academyFixture({ tables: { profiles: [{ id: USER, role }] } })
        expect((await getAcademyReadiness()).success).toBe(false)
    })
    it('TCM nie zapisze wyniku ani warunku', async () => {
        client = academyFixture({ tables: { profiles: [{ id: USER, role: 'talent_community' }] } })
        expect((await recordReadinessResult(manual)).success).toBe(false)
        expect((await updateLaunchCondition({ item: 'x', status: 'ready', evidence: 'abc' })).success).toBe(false)
        expect(client.rpc.mock.calls.map(([name]) => name)).toEqual(expect.not.arrayContaining(['academy_record_readiness_result', 'academy_update_launch_condition']))
    })
    it('nie pozwala wpisać ręcznie wyniku scenariusza automatu', async () => {
        expect(await recordReadinessResult({ ...manual, scenarioId: 'G01' })).toEqual({ success: false, error: 'Wynik tego scenariusza zapisuje automat, nie człowiek.' })
    })
    it('wynik pozytywny wymaga zrzutu', async () => {
        expect(await recordReadinessResult({ ...manual, status: 'passed' })).toEqual({ success: false, error: 'Dołącz zrzut ekranu potwierdzający wynik.' })
    })
    it('zrzut musi należeć do tego scenariusza', async () => {
        expect(await recordReadinessResult({ ...manual, status: 'passed', evidencePath: 'G05/11111111-1111-4111-8111-111111111111.png' })).toEqual({ success: false, error: 'Zrzut nie należy do tego scenariusza.' })
    })
    it('nie podpisze ścieżki spoza wzorca', async () => {
        expect((await getReadinessEvidenceUrl('../inne/plik.png')).success).toBe(false)
    })
    it('warunek gotowy wymaga dowodu', async () => {
        expect(await updateLaunchCondition({ item: 'x', status: 'ready', evidence: ' ' })).toEqual({ success: false, error: 'Podaj dowód spełnienia warunku.' })
    })
})

describe('panel Gotowość: odczyt', () => {
    it('zwraca 57 scenariuszy i wyłączone przełączniki', async () => {
        const result = await getAcademyReadiness()
        expect(result.success && result.data.scenarios).toHaveLength(57)
        expect(result.success && result.data.migrationPending).toBe(false)
        expect(result.success && result.data.switches.every(item => !item.enabled)).toBe(true)
    })
    it('zapisuje wynik ręczny przez RPC', async () => {
        admin({ rpcs: { academy_record_readiness_result: () => 'id' } })
        expect((await recordReadinessResult(manual)).success).toBe(true)
        expect(client.rpc).toHaveBeenCalledWith('academy_record_readiness_result', { p_scenario_id: 'G04', p_sha: 'abc1234', p_status: 'failed', p_evidence_path: null, p_note: null })
    })
})
