import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlacementRow } from '@/lib/types/placement'

const authContext = vi.hoisted(() => ({
    userId: 'manager-1',
    email: 'manager@b2bnetwork.pl',
    role: 'manager',
    isAdmin: false,
    isManager: true,
}))

const dbState = vi.hoisted(() => ({
    placement: null as Record<string, unknown> | null,
    insertedBonuses: [] as Array<Record<string, unknown>>,
    placementPatch: null as Record<string, unknown> | null,
    placementUpdateError: null as { message: string } | null,
    placementUpdateMatched: true,
    placementUpdateStatusFilter: null as string[] | null,
    insertErrorCategory: null as string | null,
    deletedBonusIds: [] as string[],
    deleteError: null as { message: string } | null,
}))

const { mockLogAudit, mockSendBonusAssigned, mockSendPush } = vi.hoisted(() => ({
    mockLogAudit: vi.fn(async () => {}),
    mockSendBonusAssigned: vi.fn(async () => ({ success: true })),
    mockSendPush: vi.fn(async () => ({ success: true })),
}))

vi.mock('@/lib/auth/internal-guard', () => ({
    requireBonusProposerAction: async () => authContext,
}))

vi.mock('@/lib/actions/audit', () => ({
    logAudit: mockLogAudit,
}))

vi.mock('@/lib/email', () => ({
    sendBonusAssigned: mockSendBonusAssigned,
    sendBonusCancelled: vi.fn(async () => ({ success: true })),
}))

vi.mock('@/lib/push/dispatch', () => ({
    sendPushToUserId: mockSendPush,
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => ({
        from: (table: string) => makeQuery(table),
    }),
}))

interface MockQueryResult {
    data: unknown
    error: { message: string } | null
}

interface MockQuery extends PromiseLike<MockQueryResult> {
    select: (columns?: string) => MockQuery
    insert: (row: Record<string, unknown>) => MockQuery
    update: (patch: Record<string, unknown>) => MockQuery
    delete: () => MockQuery
    eq: (column: string, value: unknown) => MockQuery
    in: (column: string, values: unknown[]) => MockQuery
    single: () => Promise<MockQueryResult>
    maybeSingle: () => Promise<MockQueryResult>
}

function makeQuery(table: string) {
    let operation: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Record<string, unknown> | null = null
    const filters = new Map<string, unknown>()

    async function resolveResult(): Promise<MockQueryResult> {
        if (table === 'placements') {
            if (operation === 'update') {
                dbState.placementPatch = payload
                return {
                    data: dbState.placementUpdateMatched ? { id: 'placement-1' } : null,
                    error: dbState.placementUpdateError,
                }
            }
            return { data: dbState.placement, error: null }
        }

        if (table === 'profiles') {
            if (filters.has('id[]')) {
                return {
                    data: [
                        { id: 'dl-1', full_name: 'Delivery Lead', email: 'dl@example.com' },
                        { id: 'recruiter-1', full_name: 'Recruiter', email: 'recruiter@example.com' },
                    ],
                    error: null,
                }
            }
            return { data: { full_name: 'Manager Test' }, error: null }
        }

        if (table === 'bonuses' && operation === 'insert') {
            const category = String(payload?.category)
            if (dbState.insertErrorCategory === category) {
                return { data: null, error: { message: `insert ${category} failed` } }
            }
            dbState.insertedBonuses.push(payload ?? {})
            return { data: { id: `bonus-${category}` }, error: null }
        }

        if (table === 'bonuses' && operation === 'delete') {
            const ids = filters.get('id[]')
            if (Array.isArray(ids)) {
                dbState.deletedBonusIds.push(...ids.map(String))
            } else if (filters.has('id')) {
                dbState.deletedBonusIds.push(String(filters.get('id')))
            }
            return { data: null, error: dbState.deleteError }
        }

        return { data: null, error: null }
    }

    const query: MockQuery = {
        select: () => query,
        insert: (row: Record<string, unknown>) => {
            operation = 'insert'
            payload = row
            return query
        },
        update: (patch: Record<string, unknown>) => {
            operation = 'update'
            payload = patch
            return query
        },
        delete: () => {
            operation = 'delete'
            return query
        },
        eq: (column: string, value: unknown) => {
            filters.set(column, value)
            return query
        },
        in: (column: string, values: unknown[]) => {
            filters.set(`${column}[]`, values)
            if (table === 'placements' && operation === 'update' && column === 'status') {
                dbState.placementUpdateStatusFilter = values.map(String)
            }
            return query
        },
        single: () => resolveResult(),
        maybeSingle: () => resolveResult(),
        then: (onFulfilled, onRejected) => resolveResult().then(onFulfilled, onRejected),
    }
    return query
}

import { confirmPlacementHours } from '@/lib/actions/placements'

function buildPlacement(overrides: Partial<PlacementRow> = {}): PlacementRow {
    return {
        id: 'placement-1',
        consultant_name: 'Marcin Szyłko',
        client_name: 'Nordea',
        position: 'Developer',
        start_date: '2026-07-13',
        signing_date: '2026-07-01',
        delivery_lead_id: 'dl-1',
        recruiter_id: 'recruiter-1',
        delivery_lead_raw: 'Marcin Kraszewski',
        recruiter_raw: 'Marlena Rosół',
        cost_rate: 100,
        revenue_rate: 145,
        margin_per_hour: 45,
        monthly_margin: 7560,
        bonus_eligible_date: '2026-08-18',
        dl_bonus_amount: 756,
        recruiter_tier: 2,
        recruiter_bonus_amount: 1500,
        status: 'started',
        hours_confirmed_at: null,
        hours_confirmed_by: null,
        cancelled_at: null,
        cancel_reason: null,
        dl_bonus_id: null,
        recruiter_bonus_id: null,
        tcm_ticket_id: null,
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:00:00Z',
        ...overrides,
    }
}

beforeEach(() => {
    dbState.placement = buildPlacement() as unknown as Record<string, unknown>
    dbState.insertedBonuses = []
    dbState.placementPatch = null
    dbState.placementUpdateError = null
    dbState.placementUpdateMatched = true
    dbState.placementUpdateStatusFilter = null
    dbState.insertErrorCategory = null
    dbState.deletedBonusIds = []
    dbState.deleteError = null
})

describe('confirmPlacementHours', () => {
    it('keeps legacy behaviour and creates both bonuses when overrides are omitted', async () => {
        await confirmPlacementHours('placement-1')

        expect(dbState.insertedBonuses.map((row) => row.category)).toEqual([
            'delivery_lead',
            'recruiter',
        ])
        expect(dbState.placementPatch).toMatchObject({
            status: 'bonus_confirmed',
            dl_bonus_id: 'bonus-delivery_lead',
            recruiter_bonus_id: 'bonus-recruiter',
        })
        expect(mockSendBonusAssigned).toHaveBeenCalledTimes(2)
        expect(mockSendPush).toHaveBeenCalledTimes(2)
    })

    it('skips the DL record and notification when only the recruiter bonus is selected', async () => {
        await confirmPlacementHours('placement-1', {
            dl: null,
            recruiter: {
                amount: 1600,
                reason: 'Premia rekrutera za skuteczny placement',
                periodYear: 2026,
                periodMonth: 8,
                notes: null,
            },
        })

        expect(dbState.insertedBonuses).toHaveLength(1)
        expect(dbState.insertedBonuses[0]).toMatchObject({
            category: 'recruiter',
            recipient_user_id: 'recruiter-1',
            amount: 1600,
        })
        expect(dbState.placementPatch).toMatchObject({
            status: 'bonus_confirmed',
            dl_bonus_id: null,
            recruiter_bonus_id: 'bonus-recruiter',
        })
        expect(mockSendBonusAssigned).toHaveBeenCalledOnce()
        expect(mockSendBonusAssigned).toHaveBeenCalledWith(
            'recruiter@example.com',
            'Recruiter',
            expect.any(String),
            1600,
            'PLN',
            2026,
            8,
            expect.any(String),
        )
        expect(mockLogAudit).toHaveBeenCalledWith(
            'manager-1',
            'PLACEMENT_BONUSES_GENERATED',
            expect.objectContaining({ dl: { skipped: true } }),
        )
    })

    it('skips the recruiter record and notification when only the DL bonus is selected', async () => {
        await confirmPlacementHours('placement-1', {
            dl: {
                amount: 800,
                reason: 'Premia Delivery Lead za skuteczny placement',
                periodYear: 2026,
                periodMonth: 8,
                notes: 'Korekta',
            },
            recruiter: null,
        })

        expect(dbState.insertedBonuses).toHaveLength(1)
        expect(dbState.insertedBonuses[0]).toMatchObject({
            category: 'delivery_lead',
            recipient_user_id: 'dl-1',
            amount: 800,
        })
        expect(dbState.placementPatch).toMatchObject({
            dl_bonus_id: 'bonus-delivery_lead',
            recruiter_bonus_id: null,
        })
        expect(mockSendBonusAssigned).toHaveBeenCalledOnce()
        expect(mockSendBonusAssigned).toHaveBeenCalledWith(
            'dl@example.com',
            'Delivery Lead',
            expect.any(String),
            800,
            'PLN',
            2026,
            8,
            expect.any(String),
        )
        expect(mockLogAudit).toHaveBeenCalledWith(
            'manager-1',
            'PLACEMENT_BONUSES_GENERATED',
            expect.objectContaining({ recruiter: { skipped: true } }),
        )
    })

    it('rejects deselecting both bonuses without writing or notifying', async () => {
        await expect(
            confirmPlacementHours('placement-1', { dl: null, recruiter: null }),
        ).rejects.toThrow('Wybierz co najmniej jedną premię')

        expect(dbState.insertedBonuses).toHaveLength(0)
        expect(dbState.placementPatch).toBeNull()
        expect(mockSendBonusAssigned).not.toHaveBeenCalled()
        expect(mockLogAudit).not.toHaveBeenCalled()
    })

    it('does not generate an intentionally missing bonus when a confirmed placement is replayed', async () => {
        dbState.placement = buildPlacement({
            status: 'bonus_confirmed',
            dl_bonus_id: null,
            recruiter_bonus_id: 'existing-recruiter-bonus',
        }) as unknown as Record<string, unknown>

        await expect(confirmPlacementHours('placement-1')).rejects.toThrow(
            '168h zostało już potwierdzone',
        )

        expect(dbState.insertedBonuses).toHaveLength(0)
        expect(dbState.placementPatch).toBeNull()
        expect(mockSendBonusAssigned).not.toHaveBeenCalled()
    })

    it('cleans up and rejects when another confirmation wins the conditional update', async () => {
        dbState.placementUpdateMatched = false

        await expect(
            confirmPlacementHours('placement-1', { recruiter: null }),
        ).rejects.toThrow('potwierdzone przez inną osobę')

        expect(dbState.deletedBonusIds).toEqual(['bonus-delivery_lead'])
        expect(dbState.placementUpdateStatusFilter).toEqual(['upcoming', 'started'])
        expect(mockSendBonusAssigned).not.toHaveBeenCalled()
        expect(mockSendPush).not.toHaveBeenCalled()
        expect(mockLogAudit).not.toHaveBeenCalled()
    })

    it('cleans up a freshly created bonus and sends no notification when placement linking fails', async () => {
        dbState.placementUpdateError = { message: 'database unavailable' }

        await expect(
            confirmPlacementHours('placement-1', { recruiter: null }),
        ).rejects.toThrow('Nie udało się powiązać premii z placementem')

        expect(dbState.deletedBonusIds).toEqual(['bonus-delivery_lead'])
        expect(mockSendBonusAssigned).not.toHaveBeenCalled()
        expect(mockSendPush).not.toHaveBeenCalled()
        expect(mockLogAudit).not.toHaveBeenCalled()
    })

    it('removes the DL bonus and sends no notification when recruiter creation fails', async () => {
        dbState.insertErrorCategory = 'recruiter'

        await expect(confirmPlacementHours('placement-1')).rejects.toThrow(
            'Nie udało się utworzyć premii rekrutera',
        )

        expect(dbState.insertedBonuses.map((row) => row.category)).toEqual(['delivery_lead'])
        expect(dbState.deletedBonusIds).toEqual(['bonus-delivery_lead'])
        expect(dbState.placementPatch).toBeNull()
        expect(mockSendBonusAssigned).not.toHaveBeenCalled()
        expect(mockSendPush).not.toHaveBeenCalled()
    })

    it('surfaces a failed compensation cleanup without notifying the recipient', async () => {
        dbState.placementUpdateError = { message: 'database unavailable' }
        dbState.deleteError = { message: 'cleanup unavailable' }

        await expect(
            confirmPlacementHours('placement-1', { recruiter: null }),
        ).rejects.toThrow('Nie udało się wycofać nowych premii: cleanup unavailable')

        expect(mockSendBonusAssigned).not.toHaveBeenCalled()
        expect(mockSendPush).not.toHaveBeenCalled()
        expect(mockLogAudit).not.toHaveBeenCalled()
    })
})
