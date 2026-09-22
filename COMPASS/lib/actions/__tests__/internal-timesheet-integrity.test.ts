import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { hasFilter, recorder, type RecordedQuery } from './fake-query-recorder'

// Audyt 2026-09-22 — HF-01 / HF-02 / HF-03 / HF-10 / HF-11 / HF-12 w timesheetach.

const ctx = vi.hoisted(() => ({
    userId: 'emp-1',
    email: 'emp@b2bnetwork.pl',
    role: 'internal' as string,
    isAdmin: false,
    isManager: false,
    canLogOvertime: false,
}))

vi.mock('@/lib/auth/internal-guard', () => ({
    requireInternalOrAdminAction: async () => ctx,
    requireAdminAction: async () => ctx,
    requireTimesheetApproverAction: async () => ctx,
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
    sendTimesheetDecision: vi.fn(async () => ({ success: true })),
    sendTimesheetSubmitted: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/teams/webhook', () => ({ postToTeamsAlert: vi.fn(async () => {}) }))
vi.mock('@/lib/push/dispatch', () => ({ sendPushToUserId: vi.fn(async () => ({ success: true })) }))

import { sendTimesheetDecision, sendTimesheetSubmitted } from '@/lib/email'
import { sendPushToUserId } from '@/lib/push/dispatch'
import {
    addEntry,
    approveTimesheet,
    approverAddEntry,
    quickFillMonth,
    rejectTimesheet,
    submitTimesheet,
    updateEntry,
} from '@/lib/actions/internal-timesheet'

const draftJune = { id: 'ts-1', user_id: 'emp-1', year: 2026, month: 6, status: 'draft' }

/** Resolver: nagłówek czerwca + wpisy danego dnia (`dayEntries`) do sumy godzin. */
function entryResolver(dayEntries: Array<{ id: string; hours: number }>) {
    return (q: RecordedQuery) => {
        if (q.table === 'timesheets' && q.op === 'select') return { data: draftJune, error: null }
        if (q.table === 'timesheet_entries' && q.op === 'select' && q.selectArg === 'id, hours') {
            return { data: dayEntries, error: null }
        }
        if (q.table === 'timesheet_entries' && q.op === 'insert') {
            return { data: { id: 'entry-new', ...(q.payload as object) }, error: null }
        }
        return undefined
    }
}

const base = { timesheetId: 'ts-1', workDate: '2026-06-02', project: null, description: 'Praca' }

beforeEach(() => {
    recorder.reset()
    ctx.userId = 'emp-1'
    ctx.role = 'internal'
    ctx.isAdmin = false
    ctx.isManager = false
    ctx.canLogOvertime = false
})
afterEach(() => vi.clearAllMocks())

describe('addEntry — HF-01 (limit 8h na SUMĘ dnia)', () => {
    it('4h + 4h przechodzi', async () => {
        recorder.resolver = entryResolver([{ id: 'e-1', hours: 4 }])

        const res = await addEntry({ ...base, hours: 4 })

        expect(res.success).toBe(true)
        expect(recorder.find('timesheet_entries', 'insert')).toHaveLength(1)
    })

    it('8h + 1h bez uprawnienia do nadgodzin jest odrzucone bez zapisu', async () => {
        recorder.resolver = entryResolver([{ id: 'e-1', hours: 8 }])

        const res = await addEntry({ ...base, hours: 1 })

        expect(res).toEqual({ success: false, error: expect.stringMatching(/przekroczyłaby 8h/) })
        expect(recorder.find('timesheet_entries', 'insert')).toHaveLength(0)
    })

    it('z uprawnieniem can_log_overtime suma do 16h przechodzi', async () => {
        ctx.canLogOvertime = true
        recorder.resolver = entryResolver([{ id: 'e-1', hours: 8 }])

        const res = await addEntry({ ...base, hours: 2 })

        expect(res.success).toBe(true)
    })

    it('approverAddEntry (manager) też liczy sumę dnia', async () => {
        ctx.userId = 'mgr-1'
        ctx.role = 'manager'
        ctx.isManager = true
        recorder.resolver = (q) => {
            if (q.table === 'profiles') return { data: { manager_id: 'mgr-1' }, error: null }
            return entryResolver([{ id: 'e-1', hours: 8 }])(q)
        }

        const res = await approverAddEntry({ ...base, hours: 1 })

        expect(res).toEqual({ success: false, error: expect.stringMatching(/przekroczyłaby 8h/) })
        expect(recorder.find('timesheet_entries', 'insert')).toHaveLength(0)
    })
})

describe('addEntry/updateEntry — HF-02/HF-03 (miesiąc nagłówka, urlop, leave_paid)', () => {
    it('data spoza miesiąca timesheetu jest odrzucona', async () => {
        recorder.resolver = entryResolver([])

        const res = await addEntry({ ...base, workDate: '2026-07-01', hours: 8 })

        expect(res).toEqual({ success: false, error: expect.stringMatching(/nie należy do miesiąca/) })
        expect(recorder.find('timesheet_entries', 'insert')).toHaveLength(0)
    })

    function entryRow(source: 'manual' | 'leave_paid') {
        return {
            id: 'e-1',
            timesheet_id: 'ts-1',
            work_date: '2026-06-02',
            hours: 8,
            source,
            timesheets: { user_id: 'emp-1', status: 'draft', year: 2026, month: 6 },
        }
    }

    it('przeniesienie wpisu na dzień urlopu jest odrzucone (jak w addEntry)', async () => {
        recorder.resolver = (q) => {
            if (q.table === 'timesheet_entries' && q.op === 'select' && q.terminal === 'single') {
                return { data: entryRow('manual'), error: null }
            }
            if (q.table === 'attendance_records') return { data: { status: 'vacation' }, error: null }
            return undefined
        }

        const res = await updateEntry({ entryId: 'e-1', workDate: '2026-06-03' })

        expect(res).toEqual({ success: false, error: expect.stringMatching(/urlopowy/) })
        expect(recorder.find('timesheet_entries', 'update')).toHaveLength(0)
    })

    it('wpis leave_paid nie jest edytowalny ręcznie', async () => {
        recorder.resolver = (q) => {
            if (q.table === 'timesheet_entries' && q.op === 'select' && q.terminal === 'single') {
                return { data: entryRow('leave_paid'), error: null }
            }
            return undefined
        }

        const res = await updateEntry({ entryId: 'e-1', hours: 8, description: 'x' })

        expect(res).toEqual({ success: false, error: expect.stringMatching(/płatnego urlopu/) })
        expect(recorder.find('timesheet_entries', 'update')).toHaveLength(0)
    })
})

describe('quickFillMonth — HF-10 (overwrite nie rusza leave_paid)', () => {
    it('kasuje tylko wpisy spoza leave_paid i pomija ich dni', async () => {
        recorder.resolver = (q) => {
            if (q.table === 'timesheets') return { data: draftJune, error: null }
            if (q.table === 'timesheet_entries' && q.op === 'select') {
                // Po overwrite w bazie zostaje wyłącznie auto-wpis płatnego urlopu.
                return { data: [{ work_date: '2026-06-02' }], error: null }
            }
            return undefined
        }

        const res = await quickFillMonth({ timesheetId: 'ts-1', overwrite: true })

        expect(res.success).toBe(true)
        const del = recorder.find('timesheet_entries', 'delete')[0]
        expect(hasFilter(del, 'neq', 'source', 'leave_paid')).toBe(true)
        const inserted = recorder.find('timesheet_entries', 'insert')[0].payload as Array<{ work_date: string }>
        expect(inserted.map((r) => r.work_date)).not.toContain('2026-06-02')
        expect(inserted.map((r) => r.work_date)).toContain('2026-06-01')
    })
})

describe('approve/reject timesheet — HF-11 (równoległa decyzja)', () => {
    beforeEach(() => {
        ctx.userId = 'admin-1'
        ctx.role = 'admin'
        ctx.isAdmin = true
        recorder.resolver = (q) => {
            if (q.table === 'timesheets' && q.op === 'select') {
                return { data: { ...draftJune, status: 'submitted' }, error: null }
            }
            if (q.table === 'timesheets' && q.op === 'update') return { data: [], error: null }
            return undefined
        }
    })

    it('approve: 0 zmienionych wierszy → konflikt bez powiadomień', async () => {
        const res = await approveTimesheet('ts-1')

        expect(res).toEqual({ success: false, error: expect.stringMatching(/już rozpatrzony/) })
        const upd = recorder.find('timesheets', 'update')[0]
        expect(hasFilter(upd, 'eq', 'status', 'submitted')).toBe(true)
        expect(sendTimesheetDecision).not.toHaveBeenCalled()
    })

    it('reject: nie cofa już zaakceptowanego timesheetu', async () => {
        const res = await rejectTimesheet('ts-1', 'Popraw opisy')

        expect(res).toEqual({ success: false, error: expect.stringMatching(/już rozpatrzony/) })
        const upd = recorder.find('timesheets', 'update')[0]
        expect(hasFilter(upd, 'eq', 'status', 'submitted')).toBe(true)
        expect(sendTimesheetDecision).not.toHaveBeenCalled()
    })
})

describe('submitTimesheet — HF-12 (powiadomienie do przełożonego)', () => {
    function resolver(manager: Record<string, unknown> | null) {
        return (q: RecordedQuery) => {
            if (q.table === 'timesheets' && q.op === 'select') return { data: draftJune, error: null }
            if (q.table === 'timesheet_entries' && q.op === 'select') {
                return { data: [{ id: 'e-1', work_date: '2026-06-01', hours: 8 }], error: null }
            }
            if (q.table === 'profiles' && q.selectArg === 'manager_id') {
                return { data: { manager_id: manager ? 'mgr-1' : null }, error: null }
            }
            if (q.table === 'profiles' && q.selectArg === 'id, email, role, employment_status') {
                return { data: manager, error: null }
            }
            if (q.table === 'profiles' && q.selectArg === 'id, email') {
                return { data: [{ id: 'admin-1', email: 'admin@b2bnetwork.pl' }], error: null }
            }
            return undefined
        }
    }

    it('adresatem jest manager z profiles.manager_id', async () => {
        recorder.resolver = resolver({ id: 'mgr-1', email: 'mgr@b2bnetwork.pl', role: 'manager', employment_status: 'active' })

        const res = await submitTimesheet('ts-1')

        expect(res.success).toBe(true)
        expect(sendTimesheetSubmitted).toHaveBeenCalledWith(['mgr@b2bnetwork.pl'], expect.anything(), 2026, 6)
        expect(sendPushToUserId).toHaveBeenCalledWith('mgr-1', expect.anything())
    })

    it('bez przełożonego — fallback do adminów', async () => {
        recorder.resolver = resolver(null)

        await submitTimesheet('ts-1')

        expect(sendTimesheetSubmitted).toHaveBeenCalledWith(['admin@b2bnetwork.pl'], expect.anything(), 2026, 6)
    })
})
