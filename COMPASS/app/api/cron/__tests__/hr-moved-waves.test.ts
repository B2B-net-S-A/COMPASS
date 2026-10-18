import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// „Ludzie w NEXUSIE”: crony urlopów i timesheetów na prawdziwych trasach, w trzech
// stanach przełącznika z runbooka:
//   - bez HR_MOVED_TO_NEXUS — wszystko po staremu (stan po scaleniu PR-a),
//   - `people,leave` (fala 1, 24.10) — oof-reconcile pomija pracę, timesheety działają,
//   - `time` (fala 2, 1.11) — dopiero wtedy przypomnienie o timesheecie milknie.

const calls = vi.hoisted(() => ({ forward: 0, oof: 0, cleanup: 0, audit: [] as unknown[] }))

vi.mock('@/lib/api/with-auth', () => ({
    withCronAuth: (handler: (req: NextRequest, ctx: { admin: unknown }) => Promise<Response>) =>
        (req: NextRequest) => handler(req, { admin: {} }),
}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    logCompat: vi.fn(),
}))
vi.mock('@/lib/audit/system-log', () => ({
    logSystemAudit: vi.fn(async (...args: unknown[]) => { calls.audit.push(args) }),
}))
vi.mock('@/lib/oof/forward-rules', () => ({
    reconcileForwardRules: vi.fn(async () => { calls.forward++; return { scanned: 0, errors: [] } }),
}))
vi.mock('@/lib/oof/reconcile', () => ({
    reconcileOutlookOof: vi.fn(async () => { calls.oof++; return { scanned: 0, readErrors: 0, errors: [] } }),
}))
vi.mock('@/lib/oof/leave-cleanup', () => ({
    retryCancelledLeaveCleanup: vi.fn(async () => { calls.cleanup++; return { errors: [] } }),
}))
vi.mock('@/lib/email', () => ({ sendTimesheetReminder: vi.fn() }))
vi.mock('@/lib/teams/webhook', () => ({ postToTeamsAlert: vi.fn() }))

const request = (path: string) => new NextRequest(`https://compass.test${path}`)

async function oofReconcile() {
    const { GET } = await import('../oof-reconcile/route')
    return (await GET(request('/api/cron/oof-reconcile'))).json()
}

async function timesheetReminder() {
    const { GET } = await import('../timesheet-reminder/route')
    return (await GET(request('/api/cron/timesheet-reminder'))).json()
}

beforeEach(() => {
    calls.forward = 0
    calls.oof = 0
    calls.cleanup = 0
    calls.audit = []
    // 20. dzień miesiąca: przypomnienie o timesheecie samo wychodzi poza okno 1–5,
    // więc „przebieg doszedł do handlera” widać bez dotykania bazy.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T08:00:00Z'))
})
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
})

describe('bez HR_MOVED_TO_NEXUS — Compass jak dziś', () => {
    it('oof-reconcile uzgadnia przekierowania, OOF i sprzątanie', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', '')
        const body = await oofReconcile()
        expect(body.ok).toBe(true)
        expect(body).not.toHaveProperty('skipped')
        expect(calls).toMatchObject({ forward: 1, oof: 1, cleanup: 1 })
    })

    it('przypomnienie o timesheecie liczy okno jak dotąd', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', '')
        expect(await timesheetReminder()).toMatchObject({ ok: true, skipped: 'outside_reminder_window' })
    })
})

describe('fala 1: HR_MOVED_TO_NEXUS=people,leave', () => {
    it('oof-reconcile pomija pracę i zostawia heartbeat z powodem', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'people,leave')
        const body = await oofReconcile()
        expect(body).toEqual({ ok: true, skipped: true, module: 'leave', reason: 'przeniesione do NEXUSA' })
        expect(calls).toMatchObject({ forward: 0, oof: 0, cleanup: 0 })
        expect(calls.audit).toEqual([[null, 'FORWARD_RECONCILE_RUN', expect.objectContaining({ phase: 'done', skipped: true })]])
    })

    it('przypomnienie o timesheecie działa dalej — `time` przechodzi osobno 1.11', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'people,leave')
        expect(await timesheetReminder()).toMatchObject({ ok: true, skipped: 'outside_reminder_window' })
        expect(calls.audit).toEqual([])
    })
})

describe('fala 2: HR_MOVED_TO_NEXUS=people,leave,time', () => {
    it('przypomnienie o timesheecie milknie dopiero po przeniesieniu `time`', async () => {
        vi.stubEnv('HR_MOVED_TO_NEXUS', 'people,leave,time')
        expect(await timesheetReminder()).toEqual({ ok: true, skipped: true, module: 'time', reason: 'przeniesione do NEXUSA' })
        expect(calls.audit).toEqual([[null, 'TIMESHEET_REMINDER_RUN', expect.objectContaining({ phase: 'done', skipped: true })]])
    })
})
