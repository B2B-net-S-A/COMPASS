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
    placementLoadError: null as { message: string } | null,
    insertedBonuses: [] as Array<Record<string, unknown>>,
    placementPatch: null as Record<string, unknown> | null,
    placementUpdateError: null as { message: string } | null,
    placementUpdateMatched: true,
    placementUpdateStatusFilter: null as string[] | null,
    placementAfterBonusDelete: null as Record<string, unknown> | null,
    placementAfterBonusDeleteError: null as { message: string } | null,
    insertErrorCategory: null as string | null,
    insertErrorRecipientId: null as string | null,
    ruleProfiles: [] as Array<{ id: string; full_name: string; email: string }>,
    selectedBonus: null as Record<string, unknown> | null,
    bonusLoadError: null as { message: string } | null,
    deletedBonusIds: [] as string[],
    deleteError: null as { message: string } | null,
}))

const { mockCaptureException, mockLogAudit, mockSendBonusAssigned, mockSendBonusCancelled, mockSendPush } = vi.hoisted(() => ({
    mockCaptureException: vi.fn(),
    mockLogAudit: vi.fn(async () => {}),
    mockSendBonusAssigned: vi.fn(async () => ({ success: true })),
    mockSendBonusCancelled: vi.fn(async () => ({ success: true })),
    mockSendPush: vi.fn(async () => ({ success: true })),
}))

vi.mock('@sentry/nextjs', () => ({
    captureException: mockCaptureException,
}))

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/auth/internal-guard', () => ({
    requireBonusProposerAction: async () => authContext,
}))

vi.mock('@/lib/actions/audit', () => ({
    logAudit: mockLogAudit,
}))

vi.mock('@/lib/email', () => ({
    sendBonusAssigned: mockSendBonusAssigned,
    sendBonusCancelled: mockSendBonusCancelled,
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
    let selectedColumns = '*'
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
            if (selectedColumns === 'dl_bonus_id, additional_dl_bonus_id, recruiter_bonus_id, status') {
                return {
                    data: dbState.placementAfterBonusDelete,
                    error: dbState.placementAfterBonusDeleteError,
                }
            }
            return { data: dbState.placement, error: dbState.placementLoadError }
        }

        if (table === 'profiles') {
            if (filters.has('email[]')) {
                return { data: dbState.ruleProfiles, error: null }
            }
            if (filters.has('id[]')) {
                return {
                    data: [
                        { id: 'dl-1', full_name: 'Delivery Lead', email: 'dl@example.com' },
                        { id: 'igor-1', full_name: 'Igor Twardowski', email: 'igor.twardowski@b2bnetwork.pl' },
                        { id: 'marcin-1', full_name: 'Marcin Kraszewski', email: 'marcin.kraszewski@b2bnetwork.pl' },
                        { id: 'recruiter-1', full_name: 'Recruiter', email: 'recruiter@example.com' },
                    ],
                    error: null,
                }
            }
            if (filters.get('id') === 'marcin-1') {
                return {
                    data: {
                        id: 'marcin-1',
                        full_name: 'Marcin Kraszewski',
                        email: 'marcin.kraszewski@b2bnetwork.pl',
                        manager_id: 'other-manager',
                    },
                    error: null,
                }
            }
            return { data: { full_name: 'Manager Test' }, error: null }
        }

        if (table === 'bonuses' && operation === 'select') {
            return { data: dbState.selectedBonus, error: dbState.bonusLoadError }
        }

        if (table === 'bonuses' && operation === 'insert') {
            const category = String(payload?.category)
            const recipientId = String(payload?.recipient_user_id)
            if (dbState.insertErrorCategory === category || dbState.insertErrorRecipientId === recipientId) {
                return { data: null, error: { message: `insert ${category} failed` } }
            }
            dbState.insertedBonuses.push(payload ?? {})
            const id = recipientId === 'marcin-1'
                ? 'bonus-additional-delivery-lead'
                : `bonus-${category}`
            return { data: { id }, error: null }
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
        select: (columns = '*') => {
            selectedColumns = columns
            return query
        },
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

import { confirmPlacementHours, deletePlacementBonus } from '@/lib/actions/placements'
import { UNEXPECTED_ERROR_PL } from '@/lib/actions/action-result'

async function expectActionSuccess(resultPromise: ReturnType<typeof confirmPlacementHours>) {
    await expect(resultPromise).resolves.toEqual({ success: true, data: undefined })
}

async function expectExpectedError(
    resultPromise: ReturnType<typeof confirmPlacementHours>,
    error: string,
) {
    await expect(resultPromise).resolves.toEqual({ success: false, error })
}

async function expectUnexpectedError(resultPromise: ReturnType<typeof confirmPlacementHours>) {
    await expect(resultPromise).resolves.toEqual({
        success: false,
        error: UNEXPECTED_ERROR_PL,
    })
}

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
        additional_dl_bonus_id: null,
        recruiter_bonus_id: null,
        tcm_ticket_id: null,
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:00:00Z',
        ...overrides,
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    dbState.placement = buildPlacement() as unknown as Record<string, unknown>
    dbState.placementLoadError = null
    dbState.insertedBonuses = []
    dbState.placementPatch = null
    dbState.placementUpdateError = null
    dbState.placementUpdateMatched = true
    dbState.placementUpdateStatusFilter = null
    dbState.placementAfterBonusDelete = null
    dbState.placementAfterBonusDeleteError = null
    dbState.insertErrorCategory = null
    dbState.insertErrorRecipientId = null
    dbState.ruleProfiles = [
        { id: 'igor-1', full_name: 'Igor Twardowski', email: 'igor.twardowski@b2bnetwork.pl' },
        { id: 'marcin-1', full_name: 'Marcin Kraszewski', email: 'marcin.kraszewski@b2bnetwork.pl' },
    ]
    dbState.selectedBonus = null
    dbState.bonusLoadError = null
    dbState.deletedBonusIds = []
    dbState.deleteError = null
})

describe('confirmPlacementHours', () => {
    it('keeps legacy behaviour and creates both bonuses when overrides are omitted', async () => {
        await expectActionSuccess(confirmPlacementHours('placement-1'))

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

    it('does not trigger the additional bonus from raw Igor text mapped to another profile', async () => {
        dbState.placement = buildPlacement({
            delivery_lead_id: 'dl-1',
            delivery_lead_raw: 'Igor Twardowski',
        }) as unknown as Record<string, unknown>

        await expectActionSuccess(confirmPlacementHours('placement-1'))

        expect(dbState.insertedBonuses.map((row) => row.recipient_user_id)).toEqual([
            'dl-1',
            'recruiter-1',
        ])
        expect(dbState.placementPatch).toMatchObject({ additional_dl_bonus_id: null })
    })

    it('creates an identical additional DL bonus for Marcin when the canonical DL is Igor', async () => {
        dbState.placement = buildPlacement({
            delivery_lead_id: 'igor-1',
            delivery_lead_raw: 'Igor / alias z Excela',
        }) as unknown as Record<string, unknown>

        await expectActionSuccess(confirmPlacementHours('placement-1'))

        expect(dbState.insertedBonuses.map((row) => row.recipient_user_id)).toEqual([
            'igor-1',
            'marcin-1',
            'recruiter-1',
        ])
        expect(dbState.insertedBonuses[1]).toMatchObject({
            category: 'delivery_lead',
            amount: dbState.insertedBonuses[0]?.amount,
            reason: dbState.insertedBonuses[0]?.reason,
            notes: dbState.insertedBonuses[0]?.notes,
            period_year: dbState.insertedBonuses[0]?.period_year,
            period_month: dbState.insertedBonuses[0]?.period_month,
        })
        expect(dbState.placementPatch).toMatchObject({
            dl_bonus_id: 'bonus-delivery_lead',
            additional_dl_bonus_id: 'bonus-additional-delivery-lead',
            recruiter_bonus_id: 'bonus-recruiter',
        })
        expect(mockSendBonusAssigned).toHaveBeenCalledTimes(3)
        expect(mockSendPush).toHaveBeenCalledTimes(3)
        expect(mockLogAudit).toHaveBeenCalledWith(
            'manager-1',
            'PLACEMENT_BONUSES_GENERATED',
            expect.objectContaining({
                additional_dl_bonus_id: 'bonus-additional-delivery-lead',
                additional_dl: expect.objectContaining({ amount: 756, edited: false }),
            }),
        )
    })

    it('lets the manager independently skip Marcin while keeping Igor and recruiter', async () => {
        dbState.placement = buildPlacement({ delivery_lead_id: 'igor-1' }) as unknown as Record<string, unknown>

        await expectActionSuccess(
            confirmPlacementHours('placement-1', {
                dl: {
                    amount: 800,
                    reason: 'Premia Delivery Lead za skuteczny placement',
                    periodYear: 2026,
                    periodMonth: 8,
                },
                additionalDl: null,
                recruiter: {
                    amount: 1500,
                    reason: 'Premia rekrutera za skuteczny placement',
                    periodYear: 2026,
                    periodMonth: 8,
                },
            }),
        )

        expect(dbState.insertedBonuses.map((row) => row.recipient_user_id)).toEqual([
            'igor-1',
            'recruiter-1',
        ])
        expect(dbState.placementPatch).toMatchObject({ additional_dl_bonus_id: null })
        expect(mockLogAudit).toHaveBeenCalledWith(
            'manager-1',
            'PLACEMENT_BONUSES_GENERATED',
            expect.objectContaining({ additional_dl: { skipped: true } }),
        )
    })

    it('rejects a crafted additional DL bonus for a placement whose canonical DL is not Igor', async () => {
        await expectExpectedError(
            confirmPlacementHours('placement-1', {
                additionalDl: {
                    amount: 756,
                    reason: 'Dodatkowa premia Delivery Lead za placement',
                    periodYear: 2026,
                    periodMonth: 8,
                },
            }),
            'Dodatkowa premia DL nie przysługuje temu placementowi.',
        )

        expect(dbState.insertedBonuses).toHaveLength(0)
        expect(dbState.placementPatch).toBeNull()
    })

    it('fails before writes when the Marcin profile is unavailable for an Igor placement', async () => {
        dbState.placement = buildPlacement({ delivery_lead_id: 'igor-1' }) as unknown as Record<string, unknown>
        dbState.ruleProfiles = dbState.ruleProfiles.filter((profile) => profile.id !== 'marcin-1')

        await expectExpectedError(
            confirmPlacementHours('placement-1'),
            'Nie znaleziono profilu Marcina Kraszewskiego dla dodatkowej premii DL. Skontaktuj się z administratorem.',
        )

        expect(dbState.insertedBonuses).toHaveLength(0)
        expect(dbState.placementPatch).toBeNull()
        expect(mockSendBonusAssigned).not.toHaveBeenCalled()
    })

    it('cleans up Igor bonus when creating the additional Marcin bonus fails', async () => {
        dbState.placement = buildPlacement({ delivery_lead_id: 'igor-1' }) as unknown as Record<string, unknown>
        dbState.insertErrorRecipientId = 'marcin-1'

        await expectUnexpectedError(confirmPlacementHours('placement-1'))

        expect(dbState.insertedBonuses.map((row) => row.recipient_user_id)).toEqual(['igor-1'])
        expect(dbState.deletedBonusIds).toEqual(['bonus-delivery_lead'])
        expect(dbState.placementPatch).toBeNull()
        expect(mockSendBonusAssigned).not.toHaveBeenCalled()
    })

    it('cleans up all three fresh bonuses when an Igor placement loses the confirmation race', async () => {
        dbState.placement = buildPlacement({ delivery_lead_id: 'igor-1' }) as unknown as Record<string, unknown>
        dbState.placementUpdateMatched = false

        await expectExpectedError(
            confirmPlacementHours('placement-1'),
            '168h zostało już potwierdzone przez inną osobę. Odśwież listę placementów.',
        )

        expect(dbState.deletedBonusIds).toEqual([
            'bonus-delivery_lead',
            'bonus-additional-delivery-lead',
            'bonus-recruiter',
        ])
        expect(mockSendBonusAssigned).not.toHaveBeenCalled()
        expect(mockSendPush).not.toHaveBeenCalled()
    })

    it('skips the DL record and notification when only the recruiter bonus is selected', async () => {
        await expectActionSuccess(
            confirmPlacementHours('placement-1', {
                dl: null,
                recruiter: {
                    amount: 1600,
                    reason: 'Premia rekrutera za skuteczny placement',
                    periodYear: 2026,
                    periodMonth: 8,
                    notes: null,
                },
            }),
        )

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
        await expectActionSuccess(
            confirmPlacementHours('placement-1', {
                dl: {
                    amount: 800,
                    reason: 'Premia Delivery Lead za skuteczny placement',
                    periodYear: 2026,
                    periodMonth: 8,
                    notes: 'Korekta',
                },
                recruiter: null,
            }),
        )

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
        await expectExpectedError(
            confirmPlacementHours('placement-1', { dl: null, recruiter: null }),
            'Wybierz co najmniej jedną premię do naliczenia.',
        )

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

        await expectExpectedError(
            confirmPlacementHours('placement-1'),
            '168h zostało już potwierdzone. Odśwież listę placementów.',
        )

        expect(dbState.insertedBonuses).toHaveLength(0)
        expect(dbState.placementPatch).toBeNull()
        expect(mockSendBonusAssigned).not.toHaveBeenCalled()
    })

    it('cleans up and rejects when another confirmation wins the conditional update', async () => {
        dbState.placementUpdateMatched = false

        await expectExpectedError(
            confirmPlacementHours('placement-1', { recruiter: null }),
            '168h zostało już potwierdzone przez inną osobę. Odśwież listę placementów.',
        )

        expect(dbState.deletedBonusIds).toEqual(['bonus-delivery_lead'])
        expect(dbState.placementUpdateStatusFilter).toEqual(['upcoming', 'started'])
        expect(mockSendBonusAssigned).not.toHaveBeenCalled()
        expect(mockSendPush).not.toHaveBeenCalled()
        expect(mockLogAudit).not.toHaveBeenCalled()
    })

    it('cleans up a freshly created bonus and sends no notification when placement linking fails', async () => {
        dbState.placementUpdateError = { message: 'database unavailable' }

        await expectUnexpectedError(confirmPlacementHours('placement-1', { recruiter: null }))

        expect(dbState.deletedBonusIds).toEqual(['bonus-delivery_lead'])
        expect(mockSendBonusAssigned).not.toHaveBeenCalled()
        expect(mockSendPush).not.toHaveBeenCalled()
        expect(mockLogAudit).not.toHaveBeenCalled()
    })

    it('removes the DL bonus and sends no notification when recruiter creation fails', async () => {
        dbState.insertErrorCategory = 'recruiter'

        await expectUnexpectedError(confirmPlacementHours('placement-1'))

        expect(dbState.insertedBonuses.map((row) => row.category)).toEqual(['delivery_lead'])
        expect(dbState.deletedBonusIds).toEqual(['bonus-delivery_lead'])
        expect(dbState.placementPatch).toBeNull()
        expect(mockSendBonusAssigned).not.toHaveBeenCalled()
        expect(mockSendPush).not.toHaveBeenCalled()
    })

    it('surfaces a failed compensation cleanup without notifying the recipient', async () => {
        dbState.placementUpdateError = { message: 'database unavailable' }
        dbState.deleteError = { message: 'cleanup unavailable' }

        await expectUnexpectedError(confirmPlacementHours('placement-1', { recruiter: null }))

        expect(mockSendBonusAssigned).not.toHaveBeenCalled()
        expect(mockSendPush).not.toHaveBeenCalled()
        expect(mockLogAudit).not.toHaveBeenCalled()
    })

    it('reports a placement query failure without leaking database details', async () => {
        dbState.placementLoadError = { message: 'connection refused' }

        await expectUnexpectedError(confirmPlacementHours('placement-1'))

        expect(mockCaptureException.mock.calls[0]?.[0]).toEqual(
            expect.objectContaining({ message: 'Nie udało się pobrać placementu: connection refused' }),
        )
        expect(dbState.insertedBonuses).toHaveLength(0)
        expect(mockSendBonusAssigned).not.toHaveBeenCalled()
    })

    it('returns a readable not-found result without reporting an operational failure', async () => {
        dbState.placement = null

        await expectExpectedError(
            confirmPlacementHours('missing-placement'),
            'Placement nie znaleziony.',
        )

        expect(mockCaptureException).not.toHaveBeenCalled()
        expect(dbState.insertedBonuses).toHaveLength(0)
    })
})

function prepareAdditionalBonusDeletion() {
    dbState.placement = buildPlacement({
        status: 'bonus_confirmed',
        delivery_lead_id: 'igor-1',
        dl_bonus_id: null,
        additional_dl_bonus_id: 'bonus-additional-delivery-lead',
        recruiter_bonus_id: null,
    }) as unknown as Record<string, unknown>
    dbState.selectedBonus = {
        id: 'bonus-additional-delivery-lead',
        recipient_user_id: 'marcin-1',
        proposed_by: 'manager-1',
        amount: 756,
        currency: 'PLN',
        reason: 'Premia DL za placement',
        status: 'assigned',
        period_year: 2026,
        period_month: 8,
        linked_invoice_id: null,
    }
    dbState.placementAfterBonusDelete = {
        dl_bonus_id: null,
        additional_dl_bonus_id: null,
        recruiter_bonus_id: null,
        status: 'bonus_confirmed',
    }
}

describe('deletePlacementBonus', () => {
    it('deletes the additional DL bonus and reopens the placement after the last link disappears', async () => {
        prepareAdditionalBonusDeletion()

        await expect(
            deletePlacementBonus({
                placementId: 'placement-1',
                bonusKind: 'additional_dl',
                deletionReason: 'Błędnie naliczona premia',
            }),
        ).resolves.toBeUndefined()

        expect(dbState.deletedBonusIds).toEqual(['bonus-additional-delivery-lead'])
        expect(dbState.placementPatch).toMatchObject({
            status: 'started',
            hours_confirmed_at: null,
            hours_confirmed_by: null,
        })
        expect(mockLogAudit).toHaveBeenCalledWith(
            'manager-1',
            'PLACEMENT_BONUS_DELETED',
            expect.objectContaining({
                bonus_kind: 'additional_dl',
                placement_reverted_to_started: true,
                post_delete_error: null,
            }),
        )
        expect(mockSendBonusCancelled).toHaveBeenCalledOnce()
        expect(mockSendPush).toHaveBeenCalledOnce()
    })

    it('does not orphan a live bonus when loading it fails', async () => {
        prepareAdditionalBonusDeletion()
        dbState.bonusLoadError = { message: 'temporary database failure' }

        await expect(
            deletePlacementBonus({
                placementId: 'placement-1',
                bonusKind: 'additional_dl',
                deletionReason: 'Błędnie naliczona premia',
            }),
        ).rejects.toThrow('Nie udało się pobrać premii do usunięcia: temporary database failure')

        expect(dbState.deletedBonusIds).toHaveLength(0)
        expect(dbState.placementPatch).toBeNull()
        expect(mockLogAudit).not.toHaveBeenCalled()
    })

    it('audits the deletion and reports a partial failure when the placement cannot be reopened', async () => {
        prepareAdditionalBonusDeletion()
        dbState.placementUpdateError = { message: 'placement update failed' }

        await expect(
            deletePlacementBonus({
                placementId: 'placement-1',
                bonusKind: 'additional_dl',
                deletionReason: 'Błędnie naliczona premia',
            }),
        ).rejects.toThrow(
            'Premia została usunięta, ale status placementu wymaga sprawdzenia: Nie udało się przywrócić placementu do statusu „Wystartował”: placement update failed',
        )

        expect(dbState.deletedBonusIds).toEqual(['bonus-additional-delivery-lead'])
        expect(mockLogAudit).toHaveBeenCalledWith(
            'manager-1',
            'PLACEMENT_BONUS_DELETED',
            expect.objectContaining({
                placement_reverted_to_started: false,
                post_delete_error: expect.stringContaining('placement update failed'),
            }),
        )
        expect(mockSendBonusCancelled).toHaveBeenCalledOnce()
    })
})
