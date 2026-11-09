'use server'

import { z } from 'zod'
import { academyActionError } from '@/lib/academy/errors'
import { requireAcademyContext } from '@/lib/academy/server'
import { buildEditionSummary } from '@/lib/academy/edition-summary'
import { buildEditionReport, editionReportCsv } from '@/lib/academy/edition-report'
import { loadEditionReportEvidence } from '@/lib/academy/edition-report-server'
import { ExpectedError, runAction, unwrap, type ActionResult } from '@/lib/actions/action-result'
import { getAcademyRun, listAcademyRunParticipants } from '@/lib/actions/academy-sessions'
import { getEditionSurveyReport } from '@/lib/actions/academy-surveys'
import { listAcademyWebinarRoster } from '@/lib/actions/academy-webinar-import'
import { logAudit } from '@/lib/actions/audit'

async function requireReportEditor() {
    try { return await requireAcademyContext({ editor: true }) }
    catch (error) { throw new ExpectedError(academyActionError(error)) }
}

/** Builds the export on the server and refuses to hand it over without an audit
 * entry: an unaudited copy of the report is exactly what this entry exists to rule out. */
export async function exportEditionReportCsv(runId: string): Promise<ActionResult<{ filename: string; csv: string }>> {
    return runAction('exportEditionReportCsv', async () => {
        const { client, access } = await requireReportEditor()
        const id = z.uuid().safeParse(runId)
        if (!id.success) throw new ExpectedError('Nieprawidłowy identyfikator edycji.')

        const run = unwrap(await getAcademyRun(id.data))
        const [participants, roster, survey] = await Promise.all([
            listAcademyRunParticipants(run.id).then(unwrap),
            listAcademyWebinarRoster(run.id).then(unwrap),
            getEditionSurveyReport(run.id).then(unwrap),
        ])
        const generatedAt = new Date().toISOString()
        let summary
        try { summary = buildEditionSummary(run, participants, roster, generatedAt) }
        catch { throw new ExpectedError('Lista zapisów zmieniła się podczas pobierania raportu lub jest niepełna. Odśwież stronę i spróbuj ponownie.') }

        const evidence = await loadEditionReportEvidence(client, run, participants)
        const report = buildEditionReport(run, participants, roster, summary, survey, evidence)
        const audited = await logAudit(access.userId, 'ACADEMY_EDITION_REPORT_EXPORTED', { run_id: run.id, course_id: run.courseId, rehearsal: report.rehearsal })
        if (!audited) throw new ExpectedError('Nie udało się zapisać wpisu w dzienniku audytu, więc eksport został wstrzymany. Spróbuj ponownie.')
        return { filename: `raport-edycji-${run.id}.csv`, csv: editionReportCsv({ courseTitle: run.courseTitle, runTitle: run.title, generatedAt, report, survey }) }
    })
}
