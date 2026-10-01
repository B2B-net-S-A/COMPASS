import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExpectedError } from '@/lib/actions/expected-error'
import type { ActionResult } from '@/lib/actions/action-result'

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
            // Prawdziwe guardy rzucają ExpectedError — treść ma dojść do użytkownika.
            throw new ExpectedError('Wymagane uprawnienia: administrator, manager lub finanse.')
        }
        return authContextMock
    },
}))

vi.mock('@/lib/actions/audit', () => ({ logAudit: vi.fn(async () => {}) }))
vi.mock('@/lib/email', () => ({
    sendTimesheetDecision: vi.fn(async () => ({ success: true })),
    sendTimesheetSubmitted: vi.fn(async () => ({ success: true })),
    sendTimesheetApprovalRevoked: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/teams/webhook', () => ({ postToTeamsAlert: vi.fn(async () => {}) }))
vi.mock('@/lib/push/dispatch', () => ({
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
    // unlockTimesheet — patch zapisany na `timesheets` i adresaci z finansów.
    timesheetUpdate: null as Record<string, unknown> | null,
    timesheetUpdateFilters: [] as Array<[string, unknown]>,
    financeProfiles: [] as Array<{ id: string; email: string | null }>,
}))

function makeChain(table: string) {
    let selectArg = ''
    let insertedRow: Record<string, unknown> | null = null
    let updatePatch: Record<string, unknown> | null = null

    const resolve = () => {
        if (table === 'profiles') {
            if (selectArg === 'id, email') return { data: state.financeProfiles, error: null }
            // assertApproverTeamScope reads manager_id; fetchUserContact reads email+full_name.
            if (selectArg.includes('manager_id') && !selectArg.includes('email')) {
                return { data: { manager_id: state.targetManagerId }, error: null }
            }
            return { data: state.contact, error: null }
        }
        if (table === 'timesheets') {
            if (updatePatch) {
                state.timesheetUpdate = updatePatch
                return { data: [{ id: 'ts-1' }], error: null }
            }
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
        eq: vi.fn((col: string, val: unknown) => {
            if (updatePatch && table === 'timesheets') state.timesheetUpdateFilters.push([col, val])
            return chain
        }),
        update: vi.fn((patch: Record<string, unknown>) => {
            updatePatch = patch
            return chain
        }),
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

import { approverAddEntry, ensureTeamTimesheet, unlockTimesheet } from '@/lib/actions/internal-timesheet'
import { sendTimesheetApprovalRevoked } from '@/lib/email'

// Audyt 2026-08 (B1) — akcje zwracają ActionResult, odmowa to `{ success: false }`
// z treścią dla użytkownika, nie wyjątek.
async function expectSuccess<T>(call: Promise<ActionResult<T>>): Promise<T> {
    const res = await call
    if (!res.success) throw new Error(`oczekiwano sukcesu, dostałem: ${res.error}`)
    return res.data
}

async function expectRejection(
    call: Promise<ActionResult<unknown>>,
    pattern: RegExp,
): Promise<void> {
    const res = await call
    expect(res).toEqual({ success: false, error: expect.stringMatching(pattern) })
}

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
    state.timesheetUpdate = null
    state.timesheetUpdateFilters = []
    state.financeProfiles = []
})

afterEach(() => vi.clearAllMocks())

describe('ensureTeamTimesheet (Phase 27g)', () => {
    it('creates an empty draft for a team member without a timesheet', async () => {
        state.existingTimesheet = null

        const result = await expectSuccess(ensureTeamTimesheet('emp-1', 2026, 5))

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

        const result = await expectSuccess(ensureTeamTimesheet('emp-1', 2026, 5))

        expect(result.id).toBe('ts-existing')
        expect(result.status).toBe('submitted')
        expect(state.insertedTimesheet).toBeNull()
    })

    it('rejects a manager targeting someone outside their team', async () => {
        state.targetManagerId = 'other-manager'

        await expectRejection(ensureTeamTimesheet('emp-1', 2026, 5), /swojego zespołu/i)
        expect(state.insertedTimesheet).toBeNull()
    })

    it('lets an admin create a timesheet for anyone (scope bypassed)', async () => {
        authContextMock.isAdmin = true
        authContextMock.isManager = false
        authContextMock.role = 'admin'
        state.targetManagerId = null // not on admin's team — admin still allowed

        const result = await expectSuccess(ensureTeamTimesheet('emp-9', 2026, 5))

        expect(result.id).toBe('ts-new')
        expect(state.insertedTimesheet).toMatchObject({ user_id: 'emp-9' })
    })

    it('rejects an invalid month', async () => {
        await expectRejection(ensureTeamTimesheet('emp-1', 2026, 13), /Miesiąc/i)
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

        await expectSuccess(
            approverAddEntry({ ...baseInput, hours: 10, overtimeReason: 'Awaria u klienta w weekend' }),
        )

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

        await expectRejection(
            approverAddEntry({ ...baseInput, hours: 10, overtimeReason: 'x' }),
            /Uzasadnienie/i,
        )
        expect(state.insertedEntry).toBeNull()
    })

    it('admin cannot exceed the 16h ceiling', async () => {
        authContextMock.isAdmin = true
        authContextMock.isManager = false
        authContextMock.role = 'admin'

        await expectRejection(
            approverAddEntry({ ...baseInput, hours: 17, overtimeReason: 'Long incident bridge' }),
            /16/,
        )
        expect(state.insertedEntry).toBeNull()
    })

    it('a non-admin approver (manager) is blocked from > 8h', async () => {
        // default ctx = manager, manager-of-team
        await expectRejection(
            approverAddEntry({ ...baseInput, hours: 10, overtimeReason: 'Weekend deploy' }),
            /tylko administrator/i,
        )
        expect(state.insertedEntry).toBeNull()
    })

    it('admin ≤ 8h stays a normal entry (no override flags)', async () => {
        authContextMock.isAdmin = true
        authContextMock.isManager = false
        authContextMock.role = 'admin'

        await expectSuccess(approverAddEntry({ ...baseInput, hours: 8, overtimeReason: null }))

        expect(state.insertedEntry).toMatchObject({
            hours: 8,
            is_overtime_override: false,
            override_reason: null,
            override_by: null,
            override_at: null,
        })
    })
})

describe('unlockTimesheet — cofnięcie akceptacji przez managera', () => {
    beforeEach(() => {
        state.existingTimesheet = {
            id: 'ts-1',
            user_id: 'emp-1',
            year: 2026,
            month: 9,
            status: 'approved',
        }
        state.financeProfiles = [
            { id: 'fin-1', email: 'finanse@b2bnetwork.pl' },
            { id: 'fin-2', email: null },
        ]
    })

    it('manager cofa zaakceptowany timesheet swojego zespołu do akceptacji i powiadamia finanse', async () => {
        await expectSuccess(unlockTimesheet('ts-1'))

        // Wraca do „oczekuje", nie do szkicu — manager poprawia wpis i akceptuje
        // ponownie, bez czekania aż pracownik złoży timesheet od nowa.
        expect(state.timesheetUpdate).toEqual({
            status: 'submitted',
            approved_at: null,
            approved_by: null,
            pdf_hash: null,
        })
        // Warunkowy zapis — równoległa decyzja nie zostaje nadpisana.
        expect(state.timesheetUpdateFilters).toContainEqual(['status', 'approved'])
        expect(sendTimesheetApprovalRevoked).toHaveBeenCalledWith(
            ['finanse@b2bnetwork.pl'],
            expect.objectContaining({ employeeName: 'Emp Loyee', year: 2026, month: 9 }),
        )
    })

    it('finanse cofające akceptację nie dostają maila o własnym kroku', async () => {
        authContextMock.role = 'finanse'
        authContextMock.isManager = false
        authContextMock.userId = 'fin-1'
        // Poza adminem zakres zespołu obowiązuje każdego approvera.
        state.targetManagerId = 'fin-1'

        await expectSuccess(unlockTimesheet('ts-1'))

        expect(state.timesheetUpdate).toMatchObject({ status: 'submitted' })
        expect(sendTimesheetApprovalRevoked).not.toHaveBeenCalled()
    })

    it('manager spoza zespołu nie może cofnąć akceptacji', async () => {
        state.targetManagerId = 'other-manager'

        await expectRejection(unlockTimesheet('ts-1'), /swojego zespołu/i)
        expect(state.timesheetUpdate).toBeNull()
        expect(sendTimesheetApprovalRevoked).not.toHaveBeenCalled()
    })

    it('odrzucony timesheet nadal wraca do szkicu bez maila do finansów', async () => {
        state.existingTimesheet = { ...state.existingTimesheet, status: 'rejected' }

        await expectSuccess(unlockTimesheet('ts-1'))

        expect(state.timesheetUpdate).toMatchObject({ status: 'draft', submitted_at: null })
        expect(sendTimesheetApprovalRevoked).not.toHaveBeenCalled()
    })
})
