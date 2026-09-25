import { beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Module mocks ────────────────────────────────────────────────────────────

const mockList = vi.fn()
const mockDelete = vi.fn()
const mockUpdateFilters = vi.fn()

vi.mock('@/lib/mailbox/graph-inbox-rules', () => ({
    listCompassForwardRules: (email: string) => mockList(email),
    deleteForwardRule: (input: unknown) => mockDelete(input),
    updateForwardRuleFilters: (input: unknown) => mockUpdateFilters(input),
}))

vi.mock('@/lib/mailbox/forward-rule-sync', () => ({
    openForwardRule: vi.fn(async () => true),
    closeForwardRule: vi.fn(async () => true),
}))

vi.mock('@/lib/audit/system-log', () => ({ logSystemAudit: vi.fn(async () => undefined) }))

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}))

vi.mock('../reconcile', () => ({ HR_ROLES: ['internal'] }))

import { reconcileForwardRules } from '../forward-rules'

const LIVE_LEAVE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
const ORPHAN_LEAVE_ID = '9c858901-8a57-4791-81fe-4c455b099bc9'
const MAILBOX = 'anna@b2bnetwork.pl'

const liveLeave = {
    id: LIVE_LEAVE_ID,
    user_id: 'user-anna',
    substitute_id: 'user-piotr',
    start_date: '2000-01-01',
    end_date: '2999-12-31',
    status: 'approved',
    outlook_forward_rule_id: 'rule-live',
    forward_mail_enabled: true,
}

/**
 * Minimal PostgREST stand-in: every builder method chains, awaiting resolves to the
 * table's rows. Only the `is null` / `not is null` filters are honoured — that is all
 * the reconcile passes need to tell "has a rule" from "needs one".
 */
function fakeAdmin(tables: Record<string, Array<Record<string, unknown>>>) {
    return {
        from(table: string) {
            let rows = tables[table] ?? []
            const builder: Record<string, unknown> = {}
            const chain = () => builder
            for (const m of ['select', 'eq', 'lte', 'gte', 'in', 'update']) builder[m] = chain
            builder.is = (col: string, val: unknown) => {
                if (val === null) rows = rows.filter((r) => r[col] == null)
                return builder
            }
            builder.not = (col: string, op: string, val: unknown) => {
                if (op === 'is' && val === null) rows = rows.filter((r) => r[col] != null)
                return builder
            }
            builder.maybeSingle = async () => ({ data: rows[0] ?? null, error: null })
            builder.then = (resolve: (v: unknown) => unknown) =>
                Promise.resolve({ data: rows, error: null }).then(resolve)
            return builder
        },
    }
}

beforeEach(() => {
    mockList.mockReset()
    mockDelete.mockReset().mockResolvedValue({ success: true })
    mockUpdateFilters.mockReset().mockResolvedValue({ success: true })
})

describe('reconcileForwardRules — sweep', () => {
    const admin = () =>
        fakeAdmin({
            leave_requests: [liveLeave],
            profiles: [{ id: 'user-anna', email: MAILBOX, employment_status: 'active' }],
        })

    it('re-applies filters to a rule that belongs to an ongoing leave', async () => {
        mockList.mockResolvedValue([
            { id: 'rule-live', displayName: 'x', leaveId: LIVE_LEAVE_ID },
        ])

        const stats = await reconcileForwardRules(admin())

        expect(mockUpdateFilters).toHaveBeenCalledWith({ userEmail: MAILBOX, ruleId: 'rule-live' })
        expect(mockDelete).not.toHaveBeenCalled()
        expect(stats.filtersUpdated).toBe(1)
        expect(stats.errors).toEqual([])
    })

    it('still deletes an orphan and does not patch it', async () => {
        mockList.mockResolvedValue([
            { id: 'rule-orphan', displayName: 'x', leaveId: ORPHAN_LEAVE_ID },
        ])

        const stats = await reconcileForwardRules(admin())

        expect(mockDelete).toHaveBeenCalledWith({ userEmail: MAILBOX, ruleId: 'rule-orphan' })
        expect(mockUpdateFilters).not.toHaveBeenCalled()
        expect(stats.orphansRemoved).toBe(1)
        expect(stats.filtersUpdated).toBe(0)
    })

    it('records a failed update and keeps going', async () => {
        mockList.mockResolvedValue([
            { id: 'rule-live', displayName: 'x', leaveId: LIVE_LEAVE_ID },
            { id: 'rule-orphan', displayName: 'x', leaveId: ORPHAN_LEAVE_ID },
        ])
        mockUpdateFilters.mockResolvedValue({ success: false, error: 'boom' })

        const stats = await reconcileForwardRules(admin())

        expect(stats.filtersUpdated).toBe(0)
        expect(stats.errors).toEqual([`${MAILBOX}: nie zaktualizowano filtrów reguły rule-live`])
        // The orphan after it is still handled.
        expect(stats.orphansRemoved).toBe(1)
    })

    it('does not count a skipped update (no Graph credentials)', async () => {
        mockList.mockResolvedValue([
            { id: 'rule-live', displayName: 'x', leaveId: LIVE_LEAVE_ID },
        ])
        mockUpdateFilters.mockResolvedValue({ success: true, skipped: true })

        const stats = await reconcileForwardRules(admin())

        expect(stats.filtersUpdated).toBe(0)
    })
})
