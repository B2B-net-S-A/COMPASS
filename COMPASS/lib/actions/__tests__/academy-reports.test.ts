import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }))
vi.mock('@/lib/academy/server', () => ({ requireAcademyContext: vi.fn() }))
vi.mock('@/lib/actions/audit', () => ({ logAudit: vi.fn() }))

import { requireAcademyContext } from '@/lib/academy/server'
import { logAudit } from '@/lib/actions/audit'
import { exportCompetenceReportCsv, getCompetenceReport, getManagerTeamReport } from '../academy-reports'

const rpc = vi.fn()
const maybeSingle = vi.fn()
const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle }
const client = { rpc, from: () => query }
const report = { rows: [{ user_id: 'a', full_name: 'Ala', programme_key: 'p', programme_title: 'DORA', version_number: 1, route: 'live', completed_at: '2027-01-01T10:00:00Z', valid_until: null }], active: 3 }

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAcademyContext).mockResolvedValue({ client, access: { userId: 'admin' } } as never)
    vi.mocked(logAudit).mockResolvedValue(true)
    rpc.mockResolvedValue({ data: report, error: null })
    maybeSingle.mockResolvedValue({ data: null, error: null })
})

describe('getCompetenceReport', () => {
    it('requires an administrator and does not reach the database otherwise', async () => {
        vi.mocked(requireAcademyContext).mockRejectedValue(new Error('Ta operacja wymaga uprawnień administratora.'))
        await expect(getCompetenceReport()).resolves.toEqual({ success: false, error: 'Ta operacja wymaga uprawnień administratora.' })
        expect(requireAcademyContext).toHaveBeenCalledWith({ admin: true })
        expect(rpc).not.toHaveBeenCalled()
    })

    it('says the migration is pending rather than showing an empty report', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })
        const result = await getCompetenceReport()
        expect(result.success && result.data.migrated).toBe(false)
    })

    it('does not turn a failed read into an empty report', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } })
        expect((await getCompetenceReport()).success).toBe(false)
    })
})

describe('exportCompetenceReportCsv', () => {
    it('refuses a non-admin without reading or auditing', async () => {
        vi.mocked(requireAcademyContext).mockRejectedValue(new Error('Ta operacja wymaga uprawnień administratora.'))
        expect((await exportCompetenceReportCsv({})).success).toBe(false)
        expect(rpc).not.toHaveBeenCalled()
        expect(logAudit).not.toHaveBeenCalled()
    })

    it('rejects a malformed filter', async () => {
        expect((await exportCompetenceReportCsv({ programmeKey: 'x' })).success).toBe(false)
        expect(logAudit).not.toHaveBeenCalled()
    })

    it('withholds the file when the audit entry cannot be written', async () => {
        vi.mocked(logAudit).mockResolvedValue(false)
        const result = await exportCompetenceReportCsv({})
        expect(!result.success && result.error).toContain('dzienniku audytu')
    })

    it('audits the row count, not the names, and returns the file', async () => {
        const result = await exportCompetenceReportCsv({ expiringOnly: false })
        expect(logAudit).toHaveBeenCalledWith('admin', 'ACADEMY_COMPETENCE_REPORT_EXPORTED', { rows: 1, expiringOnly: false })
        expect(result.success && result.data.count).toBe(1)
        expect(result.success && result.data.csv).toContain('DORA')
    })
})

describe('getManagerTeamReport', () => {
    it('leaves the scope to the database and sends no team identifiers', async () => {
        rpc.mockResolvedValue({ data: [], error: null })
        await expect(getManagerTeamReport()).resolves.toEqual({ success: true, data: { migrated: true, members: [] } })
        expect(rpc).toHaveBeenCalledWith('academy_manager_team_report')
    })

    it('shows a plain refusal to somebody who is not a manager', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'manager_required' } })
        await expect(getManagerTeamReport()).resolves.toEqual({ success: false, error: 'Ten widok jest dostępny dla menedżera zespołu.' })
    })

    it('reports a pending migration', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'x' } })
        const result = await getManagerTeamReport()
        expect(result.success && result.data.migrated).toBe(false)
    })
})
