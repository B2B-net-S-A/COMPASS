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
    requireAdminAction: async () => authContextMock,
    requireTimesheetApproverAction: async () => {
        if (!authContextMock.isAdmin && !authContextMock.isManager && authContextMock.role !== 'finanse') {
            throw new Error('Wymagane uprawnienia: administrator, manager lub finanse.')
        }
        return authContextMock
    },
}))

vi.mock('@/lib/actions/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/email', () => ({
    sendTimesheetDecision: vi.fn(async () => ({ success: true })),
    sendTimesheetSubmitted: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/teams/webhook', () => ({ postToTeamsAlert: vi.fn(async () => {}) }))
vi.mock('@/lib/actions/push-subscriptions', () => ({
    sendPushToUserId: vi.fn(async () => ({ success: true })),
}))

const state = vi.hoisted(() => ({
    targetManagerId: 'manager-1' as string | null,
    existingTimesheet: null as Record<string, unknown> | null,
    contact: { email: 'emp@b2bnetwork.pl', full_name: 'Emp Loyee' } as
        | { email: string; full_name: string | null }
        | null,
    insertedTimesheet: null as Record<string, unknown> | null,
    // Phase 33b — captures the timesheet_entries insert for overtime assertions.
    insertedEntry: null as Record<string, unknown> | null,
}))

function makeChain(table: string) {
    let selectArg = ''
    let insertedRow: Record<string, unknown> | null = null

    const resolve = () => {
        if (table === 'profiles') {
            // assertApproverTeamScope reads manager_id; fetchUserContact reads email+full_name.
            if (selectArg.includes('manager_id') && !selectArg.includes('email')) {
                return { data: { manager_id: state.targetManagerId }, error: null }
            }
            return { data: state.contact, error: null }
        }
        if (table === 'timesheets') {
            if (insertedRow) {
                const row = {
                    id: 'ts-new',
                    status: 'draft',
                    submitted_at: null,
                    approved_by: null,
                    approved_at: null,
                    rejection_note: null,
                    pdf_hash: null,
                    created_at: '2026-05-01T00:00:00Z',
                    updated_at: '2026-05-01T00:00:00Z',
                    ...insertedRow,
                }
                state.insertedTimesheet = row
                return { data: row, error: null }
            }
            return { data: state.existingTimesheet, error: null }
        }
        if (table === 'timesheet_entries') {
            // Phase 33b — when an insert happened on this chain, echo it back as the
            // created row (with override defaults) so callers get a usable entry.
            if (insertedRow) {
                const row = {
                    id: 'entry-new',
                    is_overtime_override: false,
                    override_reason: null,
                    override_by: null,
                    override_at: null,
                    ...insertedRow,
                }
                state.insertedEntry = row
                return { data: row, error: null }
            }
            return { data: [], error: null }
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
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        insert: vi.fn((row: Record<string, unknown>) => {
            insertedRow = row
            return chain
        }),
        single: vi.fn(async () => resolve()),
        maybeSingle: vi.fn(async () => resolve()),
        // Awaited directly for list queries that end in .order() (e.g. entries).
        then: (onFulfilled: (v: unknown) => unknown) => onFulfilled(resolve()),
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

import { approverAddEntry, ensureTeamTimesheet } from '@/lib/actions/internal-timesheet'

beforeEach(() => {
    authContextMock.userId = 'manager-1'
    authContextMock.role = 'manager'
    authContextMock.isAdmin = false
    authContextMock.isManager = true
    state.targetManagerId = 'manager-1'
    state.existingTimesheet = null
    state.contact = { email: 'emp@b2bnetwork.pl', full_name: 'Emp Loyee' }
    state.insertedTimesheet = null
    state.insertedEntry = null
})

afterEach(() => vi.clearAllMocks())

describe('ensureTeamTimesheet (Phase 27g)', () => {
    it('creates an empty draft for a team member without a timesheet', async () => {
        state.existingTimesheet = null

        const result = await ensureTeamTimesheet('emp-1', 2026, 5)

        expect(state.insertedTimesheet).toMatchObject({ user_id: 'emp-1', year: 2026, month: 5 })
        expect(result.id).toBe('ts-new')
        expect(result.status).toBe('draft')
        expect(result.entries).toEqual([])
        expect(result.user_email).toBe('emp@b2bnetwork.pl')
        expect(result.user_full_name).toBe('Emp Loyee')
    })

    it('returns the existing timesheet without inserting when one already exists', async () => {
        state.existingTimesheet = {
            id: 'ts-existing',
            user_id: 'emp-1',
            year: 2026,
            month: 5,
            status: 'submitted',
            submitted_at: '2026-05-10T00:00:00Z',
            approved_by: null,
            approved_at: null,
            rejection_note: null,
            pdf_hash: null,
            created_at: '2026-05-01T00:00:00Z',
            updated_at: '2026-05-01T00:00:00Z',
        }

        const result = await ensureTeamTimesheet('emp-1', 2026, 5)

        expect(result.id).toBe('ts-existing')
        expect(result.status).toBe('submitted')
        expect(state.insertedTimesheet).toBeNull()
    })

    it('rejects a manager targeting someone outside their team', async () => {
        state.targetManagerId = 'other-manager'

        await expect(ensureTeamTimesheet('emp-1', 2026, 5)).rejects.toThrow(/swojego zespołu/i)
        expect(state.insertedTimesheet).toBeNull()
    })

    it('lets an admin create a timesheet for anyone (scope bypassed)', async () => {
        authContextMock.isAdmin = true
        authContextMock.isManager = false
        authContextMock.role = 'admin'
        state.targetManagerId = null // not on admin's team — admin still allowed

        const result = await ensureTeamTimesheet('emp-9', 2026, 5)

        expect(result.id).toBe('ts-new')
        expect(state.insertedTimesheet).toMatchObject({ user_id: 'emp-9' })
    })

    it('rejects an invalid month', async () => {
        await expect(ensureTeamTimesheet('emp-1', 2026, 13)).rejects.toThrow(/Miesiąc/i)
    })
})

describe('approverAddEntry — admin overtime > 8h (Phase 33b)', () => {
    const baseInput = {
        timesheetId: 'ts-1',
        workDate: '2026-05-18',
        project: null,
        description: 'Wdrożenie produkcyjne',
    }

    beforeEach(() => {
        // Editable timesheet for the target employee.
        state.existingTimesheet = {
            id: 'ts-1',
            user_id: 'emp-1',
            year: 2026,
            month: 5,
            status: 'submitted',
        }
    })

    it('admin can log > 8h and the entry is flagged as an overtime override', async () => {
        authContextMock.isAdmin = true
        authContextMock.isManager = false
        authContextMock.role = 'admin'
        authContextMock.userId = 'admin-1'

        await approverAddEntry({ ...baseInput, hours: 10, overtimeReason: 'Awaria u klienta w weekend' })

        expect(state.insertedEntry).toMatchObject({
            hours: 10,
            is_overtime_override: true,
            override_reason: 'Awaria u klienta w weekend',
            override_by: 'admin-1',
        })
        expect(state.insertedEntry?.override_at).toBeTruthy()
    })

    it('admin > 8h without a reason is rejected', async () => {
        authContextMock.isAdmin = true
        authContextMock.isManager = false
        authContextMock.role = 'admin'

        await expect(
            approverAddEntry({ ...baseInput, hours: 10, overtimeReason: 'x' }),
        ).rejects.toThrow(/Uzasadnienie/i)
        expect(state.insertedEntry).toBeNull()
    })

    it('admin cannot exceed the 16h ceiling', async () => {
        authContextMock.isAdmin = true
        authContextMock.isManager = false
        authContextMock.role = 'admin'

        await expect(
            approverAddEntry({ ...baseInput, hours: 17, overtimeReason: 'Long incident bridge' }),
        ).rejects.toThrow(/16/)
        expect(state.insertedEntry).toBeNull()
    })

    it('a non-admin approver (manager) is blocked from > 8h', async () => {
        // default ctx = manager, manager-of-team
        await expect(
            approverAddEntry({ ...baseInput, hours: 10, overtimeReason: 'Weekend deploy' }),
        ).rejects.toThrow(/tylko administrator/i)
        expect(state.insertedEntry).toBeNull()
    })

    it('admin ≤ 8h stays a normal entry (no override flags)', async () => {
        authContextMock.isAdmin = true
        authContextMock.isManager = false
        authContextMock.role = 'admin'

        await approverAddEntry({ ...baseInput, hours: 8, overtimeReason: null })

        expect(state.insertedEntry).toMatchObject({
            hours: 8,
            is_overtime_override: false,
            override_reason: null,
            override_by: null,
            override_at: null,
        })
    })
})
