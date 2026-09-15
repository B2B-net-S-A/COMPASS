import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type Row } from '@/test/mocks/supabase'

/**
 * Akcje kolejki tożsamości NEXUS (audyt integracji 14.09, INT-02 i INT-06):
 * weryfikacja ID w migawce eksportu, jawne potwierdzenie różnego nazwiska,
 * odrzucenie z powodem oraz korekta (odpięcie / przywrócenie do kolejki).
 */

const state = vi.hoisted(() => ({ db: null as unknown }))
const { mockLogAudit } = vi.hoisted(() => ({ mockLogAudit: vi.fn(async () => {}) }))

vi.mock('@/lib/supabase/admin', () => ({ createServiceClient: () => state.db }))
vi.mock('@/lib/auth/internal-guard', () => ({
    requireLifecycleManagerAction: async () => ({ userId: 'tcm-1', isAdmin: false }),
}))
vi.mock('@/lib/actions/audit', () => ({ logAudit: mockLogAudit }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

import {
    dismissNexusMatch,
    linkContractorToNexus,
    listNexusMatchQueue,
    reopenNexusMatch,
    unlinkContractorFromNexus,
} from '../nexus-identity'

function snapshotRow(id: number, candidateId: number, name: string, lastname: string, extra: Row = {}): Row {
    return {
        nexus_contract_id: id,
        nexus_candidate_id: candidateId,
        name,
        lastname,
        email: null,
        client_name: 'Bank',
        job_title: 'Tester',
        status: 'active',
        start_date: '2026-01-01',
        end_date: null,
        lacks_current_order: false,
        source_updated_at: null,
        seen_at: '2026-09-15T06:00:00.000Z',
        ...extra,
    }
}

function contractor(id: string, fullName: string, extra: Row = {}): Row {
    return {
        id,
        full_name: fullName,
        email: null,
        current_client: 'Bank',
        nexus_match_status: 'pending',
        nexus_match_reason: null,
        nexus_match_decided_by: null,
        nexus_match_decided_at: null,
        nexus_synced_at: null,
        nexus_contract_id: null,
        nexus_candidate_id: null,
        ...extra,
    }
}

let db: MockSupabase

function seed(contractors: Row[], snapshot: Row[]) {
    db = createMockSupabaseClient({
        tables: {
            contractors,
            nexus_contract_snapshot: snapshot,
            profiles: [{ id: 'tcm-1', full_name: 'Tomasz TCM' }],
        },
    })
    state.db = db
}

function row(id: string): Row {
    return db._tables.contractors.find((r) => r.id === id)!
}

beforeEach(() => {
    mockLogAudit.mockClear()
})

describe('linkContractorToNexus', () => {
    it('odrzuca ID, którego nie ma w ostatnim eksporcie NEXUSA', async () => {
        seed([contractor('c1', 'Jan Kowalski')], [snapshotRow(11, 7, 'Jan', 'Kowalski')])
        const result = await linkContractorToNexus({ contractorId: 'c1', nexusContractId: 12345 })
        expect(result).toEqual({ success: false, error: expect.stringContaining('nie istnieje w ostatnim eksporcie NEXUS') })
        expect(row('c1').nexus_match_status).toBe('pending')
    })

    it('przy innym nazwisku wymaga jawnego potwierdzenia i niczego nie zapisuje', async () => {
        seed([contractor('c1', 'Jan Kowalski')], [snapshotRow(11, 7, 'Anna', 'Nowak')])
        const result = await linkContractorToNexus({ contractorId: 'c1', nexusContractId: 11 })
        expect(result).toEqual({
            success: true,
            data: { status: 'name_mismatch', nexusName: 'Anna Nowak', compassName: 'Jan Kowalski' },
        })
        expect(row('c1').nexus_match_status).toBe('pending')
        expect(mockLogAudit).not.toHaveBeenCalled()

        const confirmed = await linkContractorToNexus({ contractorId: 'c1', nexusContractId: 11, confirmNameMismatch: true })
        expect(confirmed).toEqual({ success: true, data: { status: 'linked' } })
        expect(row('c1')).toMatchObject({ nexus_match_status: 'linked', nexus_candidate_id: 7 })
        expect(mockLogAudit).toHaveBeenCalledWith(
            'tcm-1',
            'CONTRACTOR_LINKED_TO_NEXUS',
            expect.objectContaining({ contractor_id: 'c1', name_mismatch_confirmed: true }),
        )
    })

    it('kotwiczy osobę i zapisuje jej BIEŻĄCY kontrakt, autora i datę', async () => {
        seed(
            [contractor('c1', 'Jan Kowalski')],
            [
                snapshotRow(11, 7, 'Jan', 'Kowalski', { start_date: '2025-01-01' }),
                snapshotRow(12, 7, 'Jan', 'Kowalski', { start_date: '2026-04-01' }),
            ],
        )
        const result = await linkContractorToNexus({ contractorId: 'c1', nexusContractId: 11 })
        expect(result).toEqual({ success: true, data: { status: 'linked' } })
        expect(row('c1')).toMatchObject({
            nexus_match_status: 'linked',
            nexus_candidate_id: 7,
            nexus_contract_id: 12,
            nexus_match_decided_by: 'tcm-1',
        })
        expect(row('c1').nexus_match_decided_at).toEqual(expect.any(String))
    })

    it('nie pozwala powiązać osoby, którą ma już inny kontraktor', async () => {
        seed(
            [
                contractor('c1', 'Jan Kowalski'),
                contractor('c2', 'Jan Kowalski', { nexus_match_status: 'linked', nexus_candidate_id: 7, nexus_contract_id: 11 }),
            ],
            [snapshotRow(11, 7, 'Jan', 'Kowalski')],
        )
        const result = await linkContractorToNexus({ contractorId: 'c1', nexusContractId: 11 })
        expect(result).toEqual({ success: false, error: expect.stringContaining('już powiązana') })
    })
})

describe('dismissNexusMatch / reopenNexusMatch / unlinkContractorFromNexus', () => {
    it('odrzucenie wymaga powodu i zapisuje dismissed z autorem', async () => {
        seed([contractor('c1', 'Jan Kowalski', { nexus_match_status: 'auto_not_found' })], [])
        expect(await dismissNexusMatch({ contractorId: 'c1', reason: '  ' })).toMatchObject({ success: false })

        const result = await dismissNexusMatch({ contractorId: 'c1', reason: 'Kontraktor sprzed wdrożenia NEXUSA' })
        expect(result.success).toBe(true)
        expect(row('c1')).toMatchObject({
            nexus_match_status: 'dismissed',
            nexus_match_reason: 'Kontraktor sprzed wdrożenia NEXUSA',
            nexus_match_decided_by: 'tcm-1',
        })
        expect(mockLogAudit).toHaveBeenCalledWith(
            'tcm-1',
            'CONTRACTOR_NEXUS_DISMISSED',
            expect.objectContaining({ contractor_id: 'c1', previous_status: 'auto_not_found' }),
        )
    })

    it('nie odrzuca powiązanego kontraktora', async () => {
        seed([contractor('c1', 'Jan Kowalski', { nexus_match_status: 'linked', nexus_candidate_id: 7 })], [])
        const result = await dismissNexusMatch({ contractorId: 'c1', reason: 'pomyłka' })
        expect(result).toEqual({ success: false, error: expect.stringContaining('odepnij') })
    })

    it('przywrócenie działa tylko dla odrzuconych i wraca do kolejki', async () => {
        seed([contractor('c1', 'Jan Kowalski', { nexus_match_status: 'dismissed', nexus_match_reason: 'x' })], [])
        expect((await reopenNexusMatch({ contractorId: 'c1' })).success).toBe(true)
        expect(row('c1')).toMatchObject({ nexus_match_status: 'pending', nexus_match_reason: null })
        expect(mockLogAudit).toHaveBeenCalledWith('tcm-1', 'CONTRACTOR_NEXUS_REOPENED', { contractor_id: 'c1' })

        const again = await reopenNexusMatch({ contractorId: 'c1' })
        expect(again).toEqual({ success: false, error: expect.stringContaining('nie jest odrzucony') })
    })

    it('odpięcie czyści kotwicę, wraca do kolejki i zapisuje poprzednie powiązanie w audycie', async () => {
        seed(
            [contractor('c1', 'Jan Kowalski', { nexus_match_status: 'linked', nexus_candidate_id: 7, nexus_contract_id: 11 })],
            [],
        )
        const result = await unlinkContractorFromNexus({ contractorId: 'c1', reason: 'zła osoba' })
        expect(result.success).toBe(true)
        expect(row('c1')).toMatchObject({
            nexus_match_status: 'pending',
            nexus_candidate_id: null,
            nexus_contract_id: null,
            nexus_match_reason: 'zła osoba',
        })
        expect(mockLogAudit).toHaveBeenCalledWith(
            'tcm-1',
            'CONTRACTOR_NEXUS_UNLINKED',
            expect.objectContaining({ previous_nexus_candidate_id: 7, previous_nexus_contract_id: 11 }),
        )
    })
})

describe('listNexusMatchQueue', () => {
    it('widok otwarty niesie podpowiedzi z migawki i liczniki widoków', async () => {
        seed(
            [
                contractor('c1', 'Jan Kowalski'),
                contractor('c2', 'Anna Nowak', { nexus_match_status: 'auto_not_found' }),
                contractor('c3', 'Ewa Wiśniewska', {
                    nexus_match_status: 'dismissed',
                    nexus_match_reason: 'sprzed NEXUSA',
                    nexus_match_decided_by: 'tcm-1',
                    nexus_match_decided_at: '2026-09-10T10:00:00.000Z',
                }),
            ],
            [snapshotRow(11, 7, 'Jan', 'Kowalski')],
        )
        const open = await listNexusMatchQueue()
        expect(open.success).toBe(true)
        if (!open.success) return
        expect(open.data.view).toBe('open')
        expect(open.data.counts).toEqual({ open: 1, auto_not_found: 1, dismissed: 1, linked: 0 })
        expect(open.data.rows).toHaveLength(1)
        expect(open.data.rows[0].suggestions).toMatchObject([
            { nexusContractId: 11, nexusCandidateId: 7, fullName: 'Jan Kowalski', clientName: 'Bank' },
        ])

        const dismissed = await listNexusMatchQueue({ view: 'dismissed' })
        expect(dismissed.success && dismissed.data.rows[0]).toMatchObject({
            fullName: 'Ewa Wiśniewska',
            matchReason: 'sprzed NEXUSA',
            decidedByName: 'Tomasz TCM',
        })
    })
})
