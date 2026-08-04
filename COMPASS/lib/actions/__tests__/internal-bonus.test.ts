import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────────────

const authContextMock = vi.hoisted(() => ({
    userId: 'manager-1',
    email: 'manager@b2bnetwork.pl',
    role: 'manager' as 'internal' | 'admin' | 'finanse' | 'consultant' | 'manager',
    isAdmin: false,
    isManager: true,
}))

vi.mock('@/lib/auth/internal-guard', () => ({
    requireInternalOrAdminAction: async () => authContextMock,
    requireBonusProposerAction: async () => {
        if (!authContextMock.isAdmin && !authContextMock.isManager) {
            throw new Error('Wymagane uprawnienia: administrator lub manager.')
        }
        return authContextMock
    },
    requireBonusReadAllAction: async () => authContextMock,
    // Phase 32 — edit of an assigned bonus is admin/finanse only.
    requireFinanseOrAdminAction: async () => {
        if (!authContextMock.isAdmin && authContextMock.role !== 'finanse') {
            throw new Error('Wymagane uprawnienia: administrator lub finanse.')
        }
        return authContextMock
    },
}))

vi.mock('@/lib/actions/audit', () => ({
    logAudit: vi.fn(async () => {}),
}))
vi.mock('@/lib/email', () => ({
    sendBonusProposed: vi.fn(async () => ({ success: true })),
    sendBonusCancelled: vi.fn(async () => ({ success: true })),
    sendBonusAssigned: vi.fn(async () => ({ success: true })),
    sendBonusUpdated: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/actions/push-subscriptions', () => ({
    sendPushToUserId: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/feature-flags', () => ({
    requireInvoicesEnabled: vi.fn(() => {
        throw new Error('Faktury są aktualnie wyłączone w tej fazie aplikacji.')
    }),
    isInvoicesEnabled: vi.fn(() => false),
    isInvoicesEnabledServer: vi.fn(() => false),
}))

// Supabase stub — captures last insert payload for verification.
const supabaseState = vi.hoisted(() => ({
    recipientProfile: {
        email: 'recipient@b2bnetwork.pl',
        full_name: 'Anna Kowalska',
        manager_id: 'manager-1' as string | null,
    },
    insertError: null as { code?: string; message: string } | null,
    insertedRow: null as Record<string, unknown> | null,
    bonusRow: null as Record<string, unknown> | null,
}))

function makeClientChain(table: string) {
    const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        neq: vi.fn(() => chain),
        order: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        in: vi.fn(() => chain),
        update: vi.fn((patch: Record<string, unknown>) => {
            if (supabaseState.bonusRow) {
                supabaseState.bonusRow = { ...supabaseState.bonusRow, ...patch }
            }
            return chain
        }),
        insert: vi.fn((row: Record<string, unknown>) => {
            supabaseState.insertedRow = row
            return chain
        }),
        single: vi.fn(async () => {
            if (table === 'profiles') {
                return {
                    data: {
                        email: supabaseState.recipientProfile.email,
                        full_name: supabaseState.recipientProfile.full_name,
                        manager_id: supabaseState.recipientProfile.manager_id,
                    },
                    error: null,
                }
            }
            if (table === 'bonuses') {
                if (supabaseState.insertError) {
                    return { data: null, error: supabaseState.insertError }
                }
                const row =
                    supabaseState.bonusRow ??
                    (supabaseState.insertedRow
                        ? {
                              id: 'bonus-1',
                              created_at: '2026-05-19T10:00:00Z',
                              updated_at: '2026-05-19T10:00:00Z',
                              cancelled_at: null,
                              cancelled_by: null,
                              cancellation_reason: null,
                              linked_invoice_id: null,
                              paid_at: null,
                              notes: null,
                              ...supabaseState.insertedRow,
                          }
                        : null)
                return { data: row, error: null }
            }
            return { data: null, error: null }
        }),
    }
    return chain
}

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => ({
        from: vi.fn((table: string) => makeClientChain(table)),
    }),
}))

vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => ({
        from: vi.fn((table: string) => makeClientChain(table)),
        rpc: vi.fn(async () => ({ data: null, error: null })),
    }),
}))

// ─── Import after mocks ─────────────────────────────────────────────────────

import { assignBonus, updateBonus, cancelBonus, proposeBonus } from '@/lib/actions/internal-bonus'

beforeEach(() => {
    authContextMock.userId = 'manager-1'
    authContextMock.email = 'manager@b2bnetwork.pl'
    authContextMock.role = 'manager'
    authContextMock.isAdmin = false
    authContextMock.isManager = true
    supabaseState.recipientProfile = {
        email: 'recipient@b2bnetwork.pl',
        full_name: 'Anna Kowalska',
        manager_id: 'manager-1',
    }
    supabaseState.insertError = null
    supabaseState.insertedRow = null
    supabaseState.bonusRow = null
})

afterEach(() => {
    vi.clearAllMocks()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('assignBonus (Phase 26)', () => {
    it('inserts a bonus with status=assigned and current period', async () => {
        const now = new Date()
        const result = await assignBonus({
            category: 'custom',
            recipient_user_id: 'recipient-1',
            period_year: now.getFullYear(),
            period_month: now.getMonth() + 1,
            amount: 500,
            reason: 'Test bonus za bieżący miesiąc',
            custom_email_memo: 'Memo dla testu',
        })
        expect(supabaseState.insertedRow).toMatchObject({
            recipient_user_id: 'recipient-1',
            proposed_by: 'manager-1',
            amount: 500,
            status: 'assigned',
            period_year: now.getFullYear(),
            period_month: now.getMonth() + 1,
        })
        expect(result).toBeTruthy()
    })

    it('rejects self-assignment', async () => {
        await expect(
            assignBonus({
                category: 'custom',
                recipient_user_id: 'manager-1',
                period_year: 2026,
                period_month: 5,
                amount: 100,
                reason: 'self assign attempt',
                custom_email_memo: 'memo',
            }),
        ).rejects.toThrow(/sobie/i)
    })

    it('rejects amount below minimum', async () => {
        await expect(
            assignBonus({
                category: 'custom',
                recipient_user_id: 'recipient-1',
                period_year: 2026,
                period_month: 5,
                amount: 0,
                reason: 'invalid amount',
                custom_email_memo: 'memo',
            }),
        ).rejects.toThrow(/Kwota/)
    })

    it('rejects too short reason', async () => {
        await expect(
            assignBonus({
                category: 'custom',
                recipient_user_id: 'recipient-1',
                period_year: 2026,
                period_month: 5,
                amount: 500,
                reason: 'no',
                custom_email_memo: 'memo',
            }),
        ).rejects.toThrow(/Uzasadnienie/)
    })

    it('rejects period far in the past (> 12 months back)', async () => {
        const now = new Date()
        const farPastYear = now.getFullYear() - 2
        await expect(
            assignBonus({
                category: 'custom',
                recipient_user_id: 'recipient-1',
                period_year: farPastYear,
                period_month: 1,
                amount: 500,
                reason: 'too far back',
                custom_email_memo: 'memo',
            }),
        ).rejects.toThrow(/12 miesi/i)
    })

    it('rejects future period', async () => {
        const now = new Date()
        const futureYear = now.getFullYear() + 1
        await expect(
            assignBonus({
                category: 'custom',
                recipient_user_id: 'recipient-1',
                period_year: futureYear,
                period_month: 12,
                amount: 500,
                reason: 'future period',
                custom_email_memo: 'memo',
            }),
        ).rejects.toThrow(/12 miesi/i)
    })

    it('rejects when manager scope mismatch', async () => {
        supabaseState.recipientProfile.manager_id = 'different-manager'
        const now = new Date()
        await expect(
            assignBonus({
                category: 'custom',
                recipient_user_id: 'recipient-1',
                period_year: now.getFullYear(),
                period_month: now.getMonth() + 1,
                amount: 500,
                reason: 'cross-team assignment',
                custom_email_memo: 'memo',
            }),
        ).rejects.toThrow(/podw/i)
    })

    it('allows admin to assign for anyone', async () => {
        authContextMock.role = 'admin'
        authContextMock.isAdmin = true
        authContextMock.isManager = false
        supabaseState.recipientProfile.manager_id = 'different-manager'
        const now = new Date()
        const result = await assignBonus({
            category: 'custom',
            recipient_user_id: 'recipient-1',
            period_year: now.getFullYear(),
            period_month: now.getMonth() + 1,
            amount: 500,
            reason: 'admin assign cross-team',
            custom_email_memo: 'memo',
        })
        expect(result).toBeTruthy()
        expect(supabaseState.insertedRow).toMatchObject({ status: 'assigned' })
    })

    // Phase 27e — the one-bonus-per-recipient-per-month UNIQUE index was dropped
    // (recruiter/sales/delivery bonuses are per-placement, so multiples per month are valid).
    // assignBonus no longer special-cases a duplicate-key error into a "już przypisana" message.
    it('does not map a duplicate-key DB error to a per-month "already assigned" message', async () => {
        supabaseState.insertError = { code: '23505', message: 'duplicate key' }
        const now = new Date()
        await expect(
            assignBonus({
                category: 'custom',
                recipient_user_id: 'recipient-1',
                period_year: now.getFullYear(),
                period_month: now.getMonth() + 1,
                amount: 500,
                reason: 'duplicate test',
                custom_email_memo: 'memo',
            }),
        ).rejects.toThrow(/Błąd przypisania premii/i)
    })
})

// Phase 32 — after assignment a bonus can only be edited/cancelled by admin or finanse.
// The manager assigns ("approves") but is then locked out so finanse has a stable picture.
function makeAssignedBonusRow(proposedBy = 'manager-1') {
    return {
        id: 'bonus-1',
        recipient_user_id: 'recipient-1',
        proposed_by: proposedBy,
        amount: 500,
        currency: 'PLN',
        reason: 'Original reason',
        status: 'assigned',
        category: 'custom',
        period_year: 2026,
        period_month: 5,
        period_quarter: null,
        place_rank: null,
        notes: null,
        cancelled_at: null,
        cancelled_by: null,
        cancellation_reason: null,
        linked_invoice_id: null,
        paid_at: null,
        created_at: '2026-05-19T00:00:00Z',
        updated_at: '2026-05-19T00:00:00Z',
    }
}

function setAdminContext() {
    authContextMock.userId = 'admin-1'
    authContextMock.role = 'admin'
    authContextMock.isAdmin = true
    authContextMock.isManager = false
}

function setFinanceContext() {
    authContextMock.userId = 'finance-1'
    authContextMock.role = 'finanse'
    authContextMock.isAdmin = false
    authContextMock.isManager = false
}

describe('updateBonus (Phase 26 + 32 — admin/finanse only)', () => {
    it('allows admin to update amount and reason of an assigned bonus', async () => {
        setAdminContext()
        supabaseState.bonusRow = makeAssignedBonusRow()
        await updateBonus({ id: 'bonus-1', amount: 700, reason: 'Updated reason text' })
        expect(supabaseState.bonusRow).toMatchObject({
            amount: 700,
            reason: 'Updated reason text',
        })
    })

    it('allows finanse to update an assigned bonus', async () => {
        setFinanceContext()
        supabaseState.bonusRow = makeAssignedBonusRow('different-manager')
        await updateBonus({ id: 'bonus-1', amount: 800 })
        expect(supabaseState.bonusRow).toMatchObject({ amount: 800 })
    })

    it('allows a manager to edit a bonus they proposed', async () => {
        // Default beforeEach context is manager-1; this bonus is proposed_by manager-1.
        supabaseState.bonusRow = makeAssignedBonusRow('manager-1')
        await updateBonus({ id: 'bonus-1', amount: 700 })
        expect(supabaseState.bonusRow).toMatchObject({ amount: 700 })
    })

    it('blocks a manager from editing a bonus they did not propose', async () => {
        supabaseState.bonusRow = makeAssignedBonusRow('different-manager')
        await expect(updateBonus({ id: 'bonus-1', amount: 700 })).rejects.toThrow(
            /sam przypisał/i,
        )
    })

    it('rejects empty patch (admin)', async () => {
        setAdminContext()
        supabaseState.bonusRow = makeAssignedBonusRow()
        await expect(updateBonus({ id: 'bonus-1' })).rejects.toThrow(/Brak zmian/i)
    })

    it('allows finanse to correct the month of a standard assigned bonus (Phase 32)', async () => {
        setFinanceContext()
        // Use the current + previous month so validatePeriod stays in-window regardless of wall clock.
        const now = new Date()
        const curYear = now.getFullYear()
        const curMonth = now.getMonth() + 1
        const prev = new Date(curYear, now.getMonth() - 1, 1)
        const prevYear = prev.getFullYear()
        const prevMonth = prev.getMonth() + 1
        const row = makeAssignedBonusRow('different-manager')
        row.period_year = curYear
        row.period_month = curMonth
        supabaseState.bonusRow = row
        await updateBonus({ id: 'bonus-1', period_year: prevYear, period_month: prevMonth })
        expect(supabaseState.bonusRow).toMatchObject({
            period_year: prevYear,
            period_month: prevMonth,
        })
    })

    it('rejects a period change missing the month (Phase 32)', async () => {
        setAdminContext()
        supabaseState.bonusRow = makeAssignedBonusRow()
        await expect(updateBonus({ id: 'bonus-1', period_year: 2026 })).rejects.toThrow(
            /rok i miesiąc/i,
        )
    })

    it('rejects changing the month of a champions_league bonus (Phase 32)', async () => {
        setAdminContext()
        const now = new Date()
        supabaseState.bonusRow = {
            ...makeAssignedBonusRow(),
            category: 'champions_league',
            period_month: null,
            period_quarter: 2,
            place_rank: 1,
        }
        // Current month keeps validatePeriod happy so we reach the category guard.
        await expect(
            updateBonus({
                id: 'bonus-1',
                period_year: now.getFullYear(),
                period_month: now.getMonth() + 1,
            }),
        ).rejects.toThrow(/Champions League/i)
    })
})

describe('cancelBonus (Phase 26 + 32 — admin/finanse any; manager own)', () => {
    it('allows admin to cancel an assigned bonus', async () => {
        setAdminContext()
        supabaseState.bonusRow = makeAssignedBonusRow('manager-1')
        await cancelBonus({ id: 'bonus-1', cancellation_reason: 'test cancel reason' })
        expect(supabaseState.bonusRow).toMatchObject({ status: 'cancelled' })
    })

    it('allows finanse to cancel an assigned bonus', async () => {
        setFinanceContext()
        supabaseState.bonusRow = makeAssignedBonusRow('different-manager')
        await cancelBonus({ id: 'bonus-1', cancellation_reason: 'finance correction' })
        expect(supabaseState.bonusRow).toMatchObject({ status: 'cancelled' })
    })

    it('allows a manager to cancel their own bonus', async () => {
        supabaseState.bonusRow = makeAssignedBonusRow('manager-1')
        await cancelBonus({ id: 'bonus-1', cancellation_reason: 'manager cancels own' })
        expect(supabaseState.bonusRow).toMatchObject({ status: 'cancelled' })
    })

    it('blocks a manager from cancelling someone else\'s bonus', async () => {
        supabaseState.bonusRow = makeAssignedBonusRow('different-manager')
        await expect(
            cancelBonus({ id: 'bonus-1', cancellation_reason: 'manager tries other' }),
        ).rejects.toThrow(/tylko premie, które sam przypisał/i)
    })
})

describe('legacy proposeBonus (Phase 26 — gated by INVOICES_ENABLED)', () => {
    it('throws when invoices feature off', async () => {
        await expect(
            proposeBonus({
                recipient_user_id: 'recipient-1',
                amount: 500,
                reason: 'legacy propose',
            }),
        ).rejects.toThrow(/Faktury są aktualnie wy/i)
    })
})
