import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { hasFilter, recorder, type RecordedQuery } from './fake-query-recorder'

// Audyt 2026-09-22 — HF-05 / HF-06 / HF-11: odmowa albo przegrany wyścig nie może
// zostawić trwałych skutków (attendance, Outlook, maile).

// ─── Mocks (wzorzec: internal-leave.test.ts) ────────────────────────────────

const ctx = vi.hoisted(() => ({
    userId: 'admin-1',
    email: 'admin@b2bnetwork.pl',
    role: 'admin' as string,
    isAdmin: true,
    isManager: false,
    canLogOvertime: false,
}))

vi.mock('@/lib/auth/internal-guard', () => ({
    requireInternalOrAdminAction: async () => ctx,
    requireAdminAction: async () => ctx,
    requireLeaveApproverAction: async () => ctx,
}))
vi.mock('@/lib/supabase/server', async () => {
    const { recorder: r } = await import('./fake-query-recorder')
    return { createClient: () => r.client }
})
vi.mock('@/lib/supabase/admin', async () => {
    const { recorder: r } = await import('./fake-query-recorder')
    return { createServiceClient: () => r.client }
})
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
    updateLeaveEvent: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/mailbox/graph-oof', () => ({
    disableOutOfOffice: vi.fn(async () => ({ success: true })),
    setOutOfOffice: vi.fn(async () => ({ success: true, skipped: true })),
}))
vi.mock('@/lib/teams/webhook', () => ({ postToTeamsAlert: vi.fn(async () => {}) }))
vi.mock('@/lib/push/dispatch', () => ({ sendPushToUserId: vi.fn(async () => ({ success: true })) }))

import { sendLeaveDecision } from '@/lib/email'
import { createLeaveEvent, updateLeaveEvent } from '@/lib/calendar/graph-events'
import { setOutOfOffice } from '@/lib/mailbox/graph-oof'
import {
    approveLeaveRequest,
    rejectLeaveRequest,
    updateTeamLeave,
} from '@/lib/actions/internal-leave'

const approvedLeave = {
    id: 'leave-1',
    user_id: 'emp-1',
    status: 'approved',
    start_date: '2026-06-01',
    end_date: '2026-06-01',
    leave_type: 'vacation',
    half_day: null,
    note: null,
    substitute_id: null,
    outlook_forward_rule_id: null,
    forward_mail_enabled: false,
    outlook_event_id: 'evt-1',
    graph_oof_set: true,
    oof_internal_message: null,
    oof_external_message: null,
    paid_days: 1,
}

/** Bazowy resolver dla updateTeamLeave: jeden wniosek, UoP z pulą `entitlement` dni. */
function leaveEditResolver(opts: { entitlement: number; overlapping?: unknown[] }) {
    return (q: RecordedQuery) => {
        if (q.table === 'leave_requests' && q.op === 'select') {
            if (q.terminal !== 'list') return { data: approvedLeave, error: null }
            // findOverlappingLeave vs computeLeaveRequestSplit (pula roczna)
            if (hasFilter(q, 'neq', 'id')) return { data: opts.overlapping ?? [], error: null }
            return { data: [approvedLeave], error: null }
        }
        if (q.table === 'profiles' && q.op === 'select' && q.selectArg?.includes('leave_entitlement_days')) {
            return {
                data: {
                    employment_type: 'uop',
                    leave_entitlement_days: opts.entitlement,
                    leave_carried_over_days: 0,
                    leave_used_initial_days: 0,
                },
                error: null,
            }
        }
        if (q.table === 'profiles' && q.selectArg === 'email, full_name') {
            return { data: { email: 'emp@b2bnetwork.pl', full_name: 'Emp Loyee' }, error: null }
        }
        return undefined
    }
}

beforeEach(() => {
    recorder.reset()
    ctx.userId = 'admin-1'
    ctx.isAdmin = true
    ctx.isManager = false
    ctx.role = 'admin'
})
afterEach(() => vi.clearAllMocks())

describe('updateTeamLeave — HF-05 (odmowa nie kasuje attendance)', () => {
    it('limit UoP przekroczony → błąd, brak DELETE attendance i brak UPDATE wniosku', async () => {
        recorder.resolver = leaveEditResolver({ entitlement: 1 })

        // 2026-06-01 (pon) → 2026-06-03 (śr) = 3 dni robocze przy puli 1 dnia.
        const res = await updateTeamLeave({ id: 'leave-1', endDate: '2026-06-03' })

        expect(res.success).toBe(false)
        expect(res.success === false && res.error).toMatch(/przekracza limit/i)
        expect(recorder.find('attendance_records', 'delete')).toHaveLength(0)
        expect(recorder.find('timesheet_entries', 'delete')).toHaveLength(0)
        expect(recorder.find('leave_requests', 'update')).toHaveLength(0)
    })

    it('poprawna edycja: DELETE starej synchronizacji dopiero po walidacji, potem UPDATE', async () => {
        recorder.resolver = leaveEditResolver({ entitlement: 20 })

        const res = await updateTeamLeave({ id: 'leave-1', endDate: '2026-06-03' })

        expect(res.success).toBe(true)
        const idx = (pred: (c: RecordedQuery) => boolean) => recorder.calls.findIndex(pred)
        const deleteIdx = idx((c) => c.table === 'attendance_records' && c.op === 'delete')
        const updateIdx = idx((c) => c.table === 'leave_requests' && c.op === 'update')
        const poolIdx = idx((c) => c.table === 'profiles' && !!c.selectArg?.includes('leave_entitlement_days'))
        expect(poolIdx).toBeGreaterThanOrEqual(0)
        expect(deleteIdx).toBeGreaterThan(poolIdx)
        expect(updateIdx).toBeGreaterThan(deleteIdx)
    })
})

describe('updateTeamLeave — HF-06 (kolizja z innym wnioskiem)', () => {
    it('nałożenie na inny aktywny wniosek → błąd bez żadnych zapisów', async () => {
        recorder.resolver = leaveEditResolver({
            entitlement: 20,
            overlapping: [{ id: 'leave-2', start_date: '2026-06-02', end_date: '2026-06-02', status: 'approved' }],
        })

        const res = await updateTeamLeave({ id: 'leave-1', endDate: '2026-06-03' })

        expect(res.success).toBe(false)
        expect(res.success === false && res.error).toMatch(/nakładający się/i)
        const overlapQuery = recorder.calls.find(
            (c) => c.table === 'leave_requests' && hasFilter(c, 'neq', 'id', 'leave-1'),
        )
        expect(overlapQuery).toBeDefined()
        expect(recorder.find('attendance_records', 'delete')).toHaveLength(0)
        expect(recorder.find('leave_requests', 'update')).toHaveLength(0)
    })
})

describe('updateTeamLeave — HF-07 (Outlook idzie za nowymi datami)', () => {
    it('zatwierdzony urlop z eventem i OOF: PATCH eventu + ponowny OOF z nowymi datami', async () => {
        recorder.resolver = leaveEditResolver({ entitlement: 20 })

        const res = await updateTeamLeave({ id: 'leave-1', endDate: '2026-06-03' })

        expect(res.success).toBe(true)
        expect(updateLeaveEvent).toHaveBeenCalledWith(
            expect.objectContaining({ eventId: 'evt-1', startDate: '2026-06-01', endDate: '2026-06-03' }),
        )
        expect(setOutOfOffice).toHaveBeenCalledWith(
            expect.objectContaining({ startDate: '2026-06-01', endDate: '2026-06-03' }),
        )
    })

    it('nieudany PATCH eventu → graph_sync_error', async () => {
        recorder.resolver = leaveEditResolver({ entitlement: 20 })
        vi.mocked(updateLeaveEvent).mockResolvedValueOnce({ success: false, error: 'boom' })

        await updateTeamLeave({ id: 'leave-1', endDate: '2026-06-03' })

        const errWrite = recorder
            .find('leave_requests', 'update')
            .find((u) => (u.payload as Record<string, unknown>).graph_sync_error === 'calendar: boom')
        expect(errWrite).toBeDefined()
    })
})

describe('approve/reject — HF-11 (równoległa decyzja przegrywa bez skutków)', () => {
    const pending = {
        id: 'leave-1',
        user_id: 'emp-1',
        leave_type: 'vacation',
        start_date: '2026-06-01',
        end_date: '2026-06-05',
        half_day: null,
        status: 'pending',
        substitute_id: null,
        oof_internal_message: null,
        oof_external_message: null,
        forward_mail_enabled: false,
        outlook_event_id: null,
    }
    function raceLost(q: RecordedQuery) {
        if (q.table === 'leave_requests' && q.op === 'select') return { data: pending, error: null }
        if (q.table === 'leave_requests' && q.op === 'update') return { data: [], error: null }
        return undefined
    }

    it('approve: 0 zmienionych wierszy → konflikt, bez attendance/Outlooka/maila', async () => {
        recorder.resolver = raceLost

        const res = await approveLeaveRequest('leave-1')

        expect(res).toEqual({ success: false, error: expect.stringMatching(/już rozpatrzony/i) })
        const upd = recorder.find('leave_requests', 'update')[0]
        expect(hasFilter(upd, 'eq', 'status', 'pending')).toBe(true)
        expect(upd.returning).toBe(true)
        expect(recorder.find('attendance_records')).toHaveLength(0)
        expect(createLeaveEvent).not.toHaveBeenCalled()
        expect(sendLeaveDecision).not.toHaveBeenCalled()
    })

    it('reject: 0 zmienionych wierszy → konflikt, bez maila', async () => {
        recorder.resolver = raceLost

        const res = await rejectLeaveRequest('leave-1', 'konflikt terminów')

        expect(res).toEqual({ success: false, error: expect.stringMatching(/już rozpatrzony/i) })
        const upd = recorder.find('leave_requests', 'update')[0]
        expect(hasFilter(upd, 'eq', 'status', 'pending')).toBe(true)
        expect(sendLeaveDecision).not.toHaveBeenCalled()
    })
})
