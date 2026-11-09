'use server'

import { z } from 'zod'
import { academyActionError } from '@/lib/academy/errors'
import { competenceCsv, filterCompetenceRows, type CompetenceFilters, type CompetenceRoute, type CompetenceRow } from '@/lib/academy/competence-report'
import { isMissingDatabaseObject } from '@/lib/academy/migration-contract'
import { requireAcademyContext } from '@/lib/academy/server'
import { ExpectedError, runAction, type ActionResult } from '@/lib/actions/action-result'
import { logAudit } from '@/lib/actions/audit'
import { requireRows } from '@/lib/supabase/select-in-chunks'

type Report = { client: Awaited<ReturnType<typeof requireAcademyContext>>['client']; userId: string }
export interface CompetenceReportData { migrated: boolean; rows: CompetenceRow[]; active: number; lastExport: string | null }
export interface ProgrammeCompletion { programme_id: string; title: string; courses: number; completed_users: number }
export interface ManagerTeamMember {
    user_id: string; full_name: string; in_progress: number
    certificates: Array<{ programme_title: string; route: CompetenceRoute; completed_at: string; valid_until: string | null }>
}

async function requireGuard(options: { admin?: boolean }): Promise<Report> {
    try {
        const { client, access } = await requireAcademyContext(options)
        return { client, userId: access.userId }
    } catch (error) { throw new ExpectedError(academyActionError(error)) }
}

async function readCompetence(client: Report['client']): Promise<{ migrated: boolean; rows: CompetenceRow[]; active: number }> {
    const { data, error } = await client.rpc('academy_competence_report')
    if (isMissingDatabaseObject(error)) return { migrated: false, rows: [], active: 0 }
    if (error) throw new Error(`Nie udało się pobrać raportu kompetencji: ${error.message}`)
    if (data === null) throw new Error('Brak odpowiedzi raportu kompetencji')
    const report = data as { rows: CompetenceRow[]; active: number }
    return { migrated: true, rows: report.rows, active: report.active }
}

export async function getCompetenceReport(): Promise<ActionResult<CompetenceReportData>> {
    return runAction('getCompetenceReport', async () => {
        const { client } = await requireGuard({ admin: true })
        const report = await readCompetence(client)
        // DEKORACJA: bez daty ostatniego eksportu raport działa dalej.
        const { data } = await client.from('audit_logs').select('created_at').eq('action', 'ACADEMY_COMPETENCE_REPORT_EXPORTED').order('created_at', { ascending: false }).limit(1).maybeSingle()
        return { ...report, lastExport: (data?.created_at as string | undefined) ?? null }
    })
}

const filtersSchema = z.object({ programmeKey: z.uuid().optional(), expiringOnly: z.boolean().optional() })

/** Eksport imiennych danych tylko z zapisanym wpisem audytu. */
export async function exportCompetenceReportCsv(filters: CompetenceFilters): Promise<ActionResult<{ filename: string; csv: string; count: number }>> {
    return runAction('exportCompetenceReportCsv', async () => {
        const { client, userId } = await requireGuard({ admin: true })
        const parsed = filtersSchema.safeParse(filters)
        if (!parsed.success) throw new ExpectedError('Nieprawidłowe filtry raportu.')
        const report = await readCompetence(client)
        if (!report.migrated) throw new ExpectedError('Ta funkcja czeka na migrację bazy danych.')
        const rows = filterCompetenceRows(report.rows, parsed.data, Date.now())
        const audited = await logAudit(userId, 'ACADEMY_COMPETENCE_REPORT_EXPORTED', { rows: rows.length, ...parsed.data })
        if (!audited) throw new ExpectedError('Nie udało się zapisać wpisu w dzienniku audytu, więc eksport został wstrzymany. Spróbuj ponownie.')
        return { filename: 'raport-kompetencji.csv', csv: competenceCsv(rows), count: rows.length }
    })
}

/** Program liczy osobę raz, także gdy ukończyła szkolenie na żywo i jego kurs z modułów (B4.8). */
export async function getProgrammeCompletions(): Promise<ActionResult<{ migrated: boolean; programmes: ProgrammeCompletion[] }>> {
    return runAction('getProgrammeCompletions', async () => {
        const { client } = await requireGuard({ admin: true })
        const response = await client.rpc('academy_programme_completions')
        if (isMissingDatabaseObject(response.error)) return { migrated: false, programmes: [] }
        return { migrated: true, programmes: requireRows<ProgrammeCompletion>('raportu programów', response) }
    })
}

/** Zakres zespołu wymusza RPC: po manager_id, wyłącznie role biurowe. */
export async function getManagerTeamReport(): Promise<ActionResult<{ migrated: boolean; members: ManagerTeamMember[] }>> {
    return runAction('getManagerTeamReport', async () => {
        const { client } = await requireGuard({})
        const { data, error } = await client.rpc('academy_manager_team_report')
        if (isMissingDatabaseObject(error)) return { migrated: false, members: [] }
        if (error?.code === '42501') throw new ExpectedError('Ten widok jest dostępny dla menedżera zespołu.')
        if (error) throw new Error(`Nie udało się pobrać raportu zespołu: ${error.message}`)
        if (data === null) throw new Error('Brak odpowiedzi raportu zespołu')
        return { migrated: true, members: data as ManagerTeamMember[] }
    })
}
