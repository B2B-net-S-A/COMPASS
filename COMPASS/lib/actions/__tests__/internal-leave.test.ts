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
    requireAdminAction: async () => {
        if (!authContextMock.isAdmin) throw new Error('Wymagane uprawnienia administratora.')
        return authContextMock
    },
    requireLeaveApproverAction: async () => {
        if (!authContextMock.isAdmin && !authContextMock.isManager) {
            throw new Error('Wymagane uprawnienia: administrator lub manager.')
        }
        return authContextMock
    },
}))

vi.mock('@/lib/actions/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/email', () => ({
    HR_LEAVE_TYPE_LABEL: {} as Record<string, string>,
    sendLeaveCancelledByUser: vi.fn(async () => ({ success: true })),
    sendLeaveCreatedOnBehalf: vi.fn(async () => ({ success: true })),
    sendLeaveDecision: vi.fn(async () => ({ success: true })),
    sendLeaveRequestSubmitted: vi.fn(async () => ({ success: true })),
    sendSubstituteAssigned: vi.fn(async () => ({ success: true })),
    sendSubstituteCancelled: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/calendar/graph-events', () => ({
    createLeaveEvent: vi.fn(async () => ({ success: true, skipped: true })),
    deleteLeaveEvent: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/mailbox/graph-oof', () => ({
    disableOutOfOffice: vi.fn(async () => ({ success: true })),
    setOutOfOffice: vi.fn(async () => ({ success: true, skipped: true })),
}))
// Phase 53: buildDefaultOofMessages/shouldSetOofForLeave przeniesione do
// oof-template.ts — czysty moduł, w testach działa naprawdę (bez mocka).
vi.mock('@/lib/teams/webhook', () => ({ postToTeamsAlert: vi.fn(async () => {}) }))
vi.mock('@/lib/push/dispatch', () => ({
    sendPushToUserId: vi.fn(async () => ({ success: true })),
}))

const state = vi.hoisted(() => ({
    team: [] as Array<{ id: string }>,
    pendingLeaves: [] as Array<Record<string, unknown>>,
    leaveRow: null as Record<string, unknown> | null,
    targetManagerId: 'manager-1' as string | null,
    updateCalls: [] as Array<{ table: string; payload: Record<string, unknown> }>,
    inCalls: [] as Array<{ col: string; vals: unknown }>,
}))

function makeChain(table: string) {
    let selectArg = ''
    let didUpdate = false

    const resolve = (mode: 'single' | 'list') => {
        if (didUpdate) return { data: null, error: null }
        if (table === 'profiles') {
            if (selectArg.includes('manager_id') && !selectArg.includes('email')) {
                // assertManagerOwnsLeaveTarget → single manager_id lookup
                return { data: { manager_id: state.targetManagerId }, error: null }
            }
            if (selectArg.trim() === 'id') {
                // team roster: profiles where manager_id = ctx.userId
                return { data: state.team, error: null }
            }
            return { data: { email: 'emp@b2bnetwork.pl', full_name: 'Emp Loyee' }, error: null }
        }
        if (table === 'leave_requests') {
            return { data: mode === 'single' ? state.leaveRow : state.pendingLeaves, error: null }
        }
        return { data: null, error: null }
    }

    const chain: any = {
        select: vi.fn((arg?: string) => {
            selectArg = arg ?? ''
            return chain
        }),
        eq: vi.fn(() => chain),
        neq: vi.fn(() => chain),
        in: vi.fn((col: string, vals: unknown) => {
            state.inCalls.push({ col, vals })
            return chain
        }),
        gte: vi.fn(() => chain),
        lte: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        update: vi.fn((payload: Record<string, unknown>) => {
            didUpdate = true
            state.updateCalls.push({ table, payload })
            return chain
        }),
        single: vi.fn(async () => resolve('single')),
        maybeSingle: vi.fn(async () => resolve('single')),
        then: (onFulfilled: (v: unknown) => unknown) => onFulfilled(resolve('list')),
    }
    return chain
}

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => ({ from: vi.fn((table: string) => makeChain(table)) }),
}))
vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => ({
        from: vi.fn((table: string) => makeChain(table)),
        rpc: vi.fn(async () => ({ data: null, error: null })),
    }),
}))

// ─── Import after mocks ─────────────────────────────────────────────────────

import {
    approveLeaveRequest,
    listAllLeaveRequests,
    listPendingLeaveRequests,
    rejectLeaveRequest,
} from '@/lib/actions/internal-leave'

function pendingRow(userId: string): Record<string, unknown> {
    return {
        id: `leave-${userId}`,
        user_id: userId,
        start_date: '2026-06-01',
        end_date: '2026-06-05',
        leave_type: 'vacation',
        half_day: null,
        note: null,
        documentation_url: null,
        status: 'pending',
        decided_by: null,
        decided_at: null,
        decision_note: null,
        created_at: '2026-05-20T00:00:00Z',
        substitute_id: null,
        oof_internal_message: null,
        oof_external_message: null,
        graph_oof_set: null,
        graph_oof_set_at: null,
        graph_sync_error: null,
        profiles: { full_name: 'Emp Loyee', email: 'emp@b2bnetwork.pl', avatar_url: null },
        substitute: null,
    }
}

beforeEach(() => {
    authContextMock.userId = 'manager-1'
    authContextMock.role = 'manager'
    authContextMock.isAdmin = false
    authContextMock.isManager = true
    state.team = []
    state.pendingLeaves = []
    state.leaveRow = null
    state.targetManagerId = 'manager-1'
    state.updateCalls = []
    state.inCalls = []
})

afterEach(() => vi.clearAllMocks())

describe('listPendingLeaveRequests — manager team scoping', () => {
    it('scopes a manager to their own team (user_id IN team ids)', async () => {
        state.team = [{ id: 'emp-1' }, { id: 'emp-2' }]
        state.pendingLeaves = [pendingRow('emp-1')]

        const result = await listPendingLeaveRequests()

        const userIdFilter = state.inCalls.find((c) => c.col === 'user_id')
        expect(userIdFilter?.vals).toEqual(['emp-1', 'emp-2'])
        expect(result).toHaveLength(1)
        expect(result[0].user_id).toBe('emp-1')
        expect(result[0].user_email).toBe('emp@b2bnetwork.pl')
    })

    it('returns [] for a manager with no direct reports (no leave query issued)', async () => {
        state.team = []
        state.pendingLeaves = [pendingRow('emp-1')] // would leak if not short-circuited

        const result = await listPendingLeaveRequests()

        expect(result).toEqual([])
        expect(state.inCalls.find((c) => c.col === 'user_id')).toBeUndefined()
    })

    it('does not scope an admin to a team (returns all pending users)', async () => {
        authContextMock.isAdmin = true
        authContextMock.isManager = false
        authContextMock.role = 'admin'
        state.pendingLeaves = [pendingRow('emp-1'), pendingRow('emp-9')]

        const result = await listPendingLeaveRequests()

        // Admin sees ALL pending leaves (no team filter applied to main query).
        // Phase 30 — note: a separate pool-aggregator query DOES call
        // .in('user_id', distinctPendingUserIds), so checking inCalls directly
        // is ambiguous. Assert via result instead: both pending users present.
        expect(result).toHaveLength(2)
        expect(result.map((r) => r.user_id).sort()).toEqual(['emp-1', 'emp-9'])
    })

    it('throws for a non-approver role (consultant)', async () => {
        authContextMock.isAdmin = false
        authContextMock.isManager = false
        authContextMock.role = 'consultant'

        await expect(listPendingLeaveRequests()).rejects.toThrow(/administrator lub manager/i)
    })
})

describe('listAllLeaveRequests — historia (wszystkie statusy) + scoping', () => {
    function row(userId: string, status: string): Record<string, unknown> {
        return { ...pendingRow(userId), status, updated_at: '2026-05-21T00:00:00Z', source: null }
    }

    it('zwraca wszystkie statusy (w tym cancelled) dla admina, bez filtra zespołu', async () => {
        authContextMock.isAdmin = true
        authContextMock.isManager = false
        authContextMock.role = 'admin'
        state.pendingLeaves = [
            row('emp-1', 'approved'),
            row('emp-2', 'cancelled'),
            row('emp-3', 'rejected'),
        ]

        const result = await listAllLeaveRequests()

        expect(result.map((r) => r.status).sort()).toEqual(['approved', 'cancelled', 'rejected'])
        // admin nie jest scope'owany do zespołu na głównym zapytaniu
        expect(state.inCalls.find((c) => c.col === 'user_id')).toBeUndefined()
    })

    it('scope’uje managera do jego zespołu (user_id IN team ids)', async () => {
        state.team = [{ id: 'emp-1' }, { id: 'emp-2' }]
        state.pendingLeaves = [row('emp-1', 'cancelled')]

        const result = await listAllLeaveRequests()

        const userIdFilter = state.inCalls.find((c) => c.col === 'user_id')
        expect(userIdFilter?.vals).toEqual(['emp-1', 'emp-2'])
        expect(result).toHaveLength(1)
        expect(result[0].status).toBe('cancelled')
    })

    it('zwraca [] dla managera bez podwładnych (bez zapytania o wnioski)', async () => {
        state.team = []
        state.pendingLeaves = [row('emp-1', 'cancelled')] // wyciekłoby bez short-circuit

        const result = await listAllLeaveRequests()

        expect(result).toEqual([])
        expect(state.inCalls.find((c) => c.col === 'user_id')).toBeUndefined()
    })

    it('rzuca dla roli bez uprawnień (consultant)', async () => {
        authContextMock.isAdmin = false
        authContextMock.isManager = false
        authContextMock.role = 'consultant'

        await expect(listAllLeaveRequests()).rejects.toThrow(/administrator lub manager/i)
    })
})

describe('approve/reject — manager team-scope guard', () => {
    it('rejects a manager approving a request outside their team (no status update)', async () => {
        state.leaveRow = pendingRow('emp-x')
        state.targetManagerId = 'other-manager'

        await expect(approveLeaveRequest('leave-emp-x')).rejects.toThrow(/swojego zespołu/i)
        expect(state.updateCalls.find((u) => u.table === 'leave_requests')).toBeUndefined()
    })

    it('rejects a manager rejecting a request outside their team (no status update)', async () => {
        state.leaveRow = pendingRow('emp-x')
        state.targetManagerId = 'other-manager'

        await expect(rejectLeaveRequest('leave-emp-x', 'konflikt terminów')).rejects.toThrow(
            /swojego zespołu/i,
        )
        expect(state.updateCalls.find((u) => u.table === 'leave_requests')).toBeUndefined()
    })
})
