import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }))
vi.mock('@/lib/academy/server', () => ({ requireAcademyContext: vi.fn() }))
vi.mock('@/lib/academy/edition-report-server', () => ({ loadEditionReportEvidence: vi.fn() }))
vi.mock('@/lib/actions/academy-sessions', () => ({ getAcademyRun: vi.fn(), listAcademyRunParticipants: vi.fn() }))
vi.mock('@/lib/actions/academy-surveys', () => ({ getEditionSurveyReport: vi.fn() }))
vi.mock('@/lib/actions/academy-webinar-import', () => ({ listAcademyWebinarRoster: vi.fn() }))
vi.mock('@/lib/actions/audit', () => ({ logAudit: vi.fn() }))

import { requireAcademyContext } from '@/lib/academy/server'
import { loadEditionReportEvidence } from '@/lib/academy/edition-report-server'
import { getAcademyRun, listAcademyRunParticipants } from '@/lib/actions/academy-sessions'
import { getEditionSurveyReport } from '@/lib/actions/academy-surveys'
import { listAcademyWebinarRoster } from '@/lib/actions/academy-webinar-import'
import { logAudit } from '@/lib/actions/audit'
import { exportEditionReportCsv } from '../academy-edition-report'

const runId = '11111111-1111-4111-8111-111111111111'
const run = { id: runId, courseId: 'course', versionId: 'version', courseTitle: 'PEGA', title: 'Edycja', confirmedCount: 0, waitlistCount: 0, sessions: [] }
const survey = { responseCount: 0, overall: null, trainer: null, materials: null, materialsResponseCount: 0, nps: null, difficulty: { too_easy: 0, appropriate: 0, too_hard: 0 }, futureTopics: [] }
const evidence = { quizRequired: false, passPercent: null, attempts: [], questions: [], options: [], preTestTracked: false, voidingTracked: false, participationDocuments: null, reportsStartAt: null, rehearsalCourse: false }

beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAcademyContext).mockResolvedValue({ client: {}, access: { userId: 'admin', isAdmin: true, canManageAcademy: true, canTeach: true } } as never)
    vi.mocked(getAcademyRun).mockResolvedValue({ success: true, data: run } as never)
    vi.mocked(listAcademyRunParticipants).mockResolvedValue({ success: true, data: [] })
    vi.mocked(listAcademyWebinarRoster).mockResolvedValue({ success: true, data: [] })
    vi.mocked(getEditionSurveyReport).mockResolvedValue({ success: true, data: survey })
    vi.mocked(loadEditionReportEvidence).mockResolvedValue(evidence as never)
    vi.mocked(logAudit).mockResolvedValue(true)
})

describe('exportEditionReportCsv', () => {
    it('refuses an account without editor rights and neither reads data nor audits', async () => {
        vi.mocked(requireAcademyContext).mockRejectedValue(new Error('Ta operacja wymaga uprawnień obsługi Akademii.'))
        await expect(exportEditionReportCsv(runId)).resolves.toEqual({ success: false, error: 'Ta operacja wymaga uprawnień obsługi Akademii.' })
        expect(requireAcademyContext).toHaveBeenCalledWith({ editor: true })
        expect(getAcademyRun).not.toHaveBeenCalled()
        expect(logAudit).not.toHaveBeenCalled()
    })

    it('rejects a malformed edition identifier', async () => {
        await expect(exportEditionReportCsv('nie-uuid')).resolves.toEqual({ success: false, error: 'Nieprawidłowy identyfikator edycji.' })
        expect(getAcademyRun).not.toHaveBeenCalled()
    })

    it('withholds the file when the audit entry cannot be written', async () => {
        vi.mocked(logAudit).mockResolvedValue(false)
        const result = await exportEditionReportCsv(runId)
        expect(result.success).toBe(false)
        if (!result.success) expect(result.error).toContain('dzienniku audytu')
    })

    it('does not export an inconsistent registration snapshot and does not audit it', async () => {
        vi.mocked(getAcademyRun).mockResolvedValue({ success: true, data: { ...run, confirmedCount: 5 } } as never)
        const result = await exportEditionReportCsv(runId)
        expect(result.success).toBe(false)
        expect(logAudit).not.toHaveBeenCalled()
    })

    it('stops when any source of the report fails instead of exporting a partial file', async () => {
        vi.mocked(getEditionSurveyReport).mockResolvedValue({ success: false, error: 'Odmowa' })
        await expect(exportEditionReportCsv(runId)).resolves.toEqual({ success: false, error: 'Odmowa' })
        expect(logAudit).not.toHaveBeenCalled()
    })

    it('audits the export without personal data and returns the CSV', async () => {
        const result = await exportEditionReportCsv(runId)
        expect(logAudit).toHaveBeenCalledWith('admin', 'ACADEMY_EDITION_REPORT_EXPORTED', { run_id: runId, course_id: 'course', rehearsal: true })
        expect(result.success).toBe(true)
        if (result.success) {
            expect(result.data.filename).toBe(`raport-edycji-${runId}.csv`)
            expect(result.data.csv.startsWith('﻿')).toBe(true)
        }
    })
})
