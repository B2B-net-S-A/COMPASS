'use server'

// ════════════════════════════════════════════════════════════════════════════
// Audyt 2026-08 (C5) — realizacja praw z art. 15 (dostęp) i art. 17 (usunięcie).
//
// Dokument „Polityka Retencji Danych" obiecywał użytkownikom usunięcie danych
// w 30 dni, a w aplikacji nie istniał ŻADEN mechanizm, którym dałoby się to
// zrobić — ani eksportu, ani zacierania. Jedyną drogą był ręczny SQL na
// produkcji, czyli operacja bez guardu, bez śladu w audycie i bez raportu
// dla osoby żądającej.
//
// Podział pracy: CO robimy i dlaczego — deklaratywnie w `lib/gdpr/subject-data.ts`
// (czyste, testowalne). Tutaj wyłącznie wykonanie: uprawnienia, I/O, audyt.
// ════════════════════════════════════════════════════════════════════════════

import { logAudit } from '@/lib/actions/audit'
import { ExpectedError, runAction, type ActionResult } from '@/lib/actions/action-result'
import { requireAdminAction } from '@/lib/auth/internal-guard'
import { createServiceClient } from '@/lib/supabase/admin'
import {
    manualFollowUpsFor,
    retainedFor,
    scrubStepsFor,
    sourcesFor,
    type GdprSubjectType,
    type RetainedRecord,
} from '@/lib/gdpr/subject-data'
import { ACADEMY_EXPORT_FOLLOW_UPS, SUBJECT_ACADEMY_AUDIT_ACTIONS, parseAttendanceRosterRows, subjectAcademyAuditRow, subjectCompletionRow, subjectTeamsReportRows } from '@/lib/gdpr/academy-export'

/**
 * Górny limit wierszy na jedno źródło. `audit_logs` osoby aktywnej od roku to
 * już setki wpisów; bez limitu jedno żądanie potrafiłoby wciągnąć do pamięci
 * cały dziennik. Ucięcie jest RAPORTOWANE — eksport, który po cichu gubi dane,
 * nie realizuje art. 15.
 */
const MAX_ROWS_PER_SOURCE = 5000
const PAGE_SIZE = 500

// Supabase-js typuje `.from()` literałem tabeli, więc zapytanie budowane w pętli
// po liście źródeł nie przechodzi kontroli typów (unia ~45 tabel × unia kolumn).
// Zamiast `any` zawężamy klienta do minimalnego kształtu, którego te pętle realnie
// używają. Nazwy tabel i kolumn są i tak sprawdzane w `subject-data.ts` — tam
// `TableName` pochodzi z wygenerowanych typów bazy.
type RowBag = Record<string, unknown>
interface PgError {
    message: string
}
interface FilterLike extends PromiseLike<{ data: RowBag[] | null; error: PgError | null }> {
    eq(column: string, value: string): FilterLike
    in(column: string, values: readonly string[]): FilterLike
    contains(column: string, value: RowBag): FilterLike
    limit(count: number): FilterLike
    order(column: string): FilterLike
    range(from: number, to: number): FilterLike
}
interface WriteLike extends PromiseLike<{ error: PgError | null }> {
    eq(column: string, value: string): WriteLike
}
interface GenericTable {
    select(columns: string): FilterLike
    update(patch: RowBag): WriteLike
    delete(): WriteLike
}
interface GenericDb {
    from(table: string): GenericTable
    rpc(name: string, args: RowBag): Promise<{ data: unknown; error: PgError | null }>
}

function genericDb(): GenericDb {
    return createServiceClient() as unknown as GenericDb
}

function primaryKeyColumns(table: string): string[] {
    // Confirmed against the deployed public schema; every other source has id PK.
    switch (table) {
        case 'academy_notification_receipts': return ['dedupe_key']
        case 'academy_user_capabilities':
        case 'work_clock_consents': return ['user_id']
        case 'contractor_success_settings': return ['contractor_id']
        case 'support_inbox_meta': return ['ticket_id']
        case 'course_staff': return ['course_id', 'user_id', 'role']
        case 'course_run_staff': return ['run_id', 'user_id']
        case 'news_post_reads': return ['post_id', 'user_id']
        case 'task_assignments': return ['task_id', 'user_id']
        case 'session_attendance':
        case 'academy_attendance_reports': return ['session_id', table === 'session_attendance' ? 'enrollment_id' : 'report_id']
        default: return ['id']
    }
}

async function readBoundedRows(table: string, query: () => FilterLike): Promise<{ rows: RowBag[]; truncated: boolean; error?: string }> {
    const rows: RowBag[] = []
    // Explicit pages avoid PostgREST's server max-rows silently shortening a 5001-row request.
    while (rows.length <= MAX_ROWS_PER_SOURCE) {
        const requested = Math.min(PAGE_SIZE, MAX_ROWS_PER_SOURCE + 1 - rows.length)
        const ordered = primaryKeyColumns(table).reduce((builder, column) => builder.order(column), query())
        const { data, error } = await ordered.range(rows.length, rows.length + requested - 1)
        if (error) return { rows: [], truncated: false, error: error.message }
        const page = data ?? []
        rows.push(...page)
        if (page.length < requested) break
    }
    return { rows: rows.slice(0, MAX_ROWS_PER_SOURCE), truncated: rows.length > MAX_ROWS_PER_SOURCE }
}

function exportSection(table: string, label: string, result: { rows: RowBag[]; truncated: boolean }): GdprExportSection {
    return { table, label, rowCount: result.rows.length, truncated: result.truncated, rows: result.rows }
}

// ─── art. 15 — eksport ──────────────────────────────────────────────────────

export interface GdprExportSection {
    table: string
    label: string
    rowCount: number
    /** True, gdy wierszy było więcej niż MAX_ROWS_PER_SOURCE. */
    truncated: boolean
    rows: RowBag[]
}

export interface GdprExport {
    subjectType: GdprSubjectType
    subjectId: string
    subjectName: string
    generatedAt: string
    sections: GdprExportSection[]
    /** Źródła, których nie udało się odczytać — z powodem. */
    unavailable: { table: string; reason: string }[]
    /** Dane osobowe poza bazą, o które trzeba zadbać ręcznie. */
    manualFollowUps: string[]
}

interface SubjectIdentity {
    id: string
    fullName: string
}

async function loadSubject(subjectType: GdprSubjectType, subjectId: string): Promise<SubjectIdentity> {
    const table = subjectType === 'employee' ? 'profiles' : 'contractors'
    const { data, error } = await genericDb().from(table).select('id, full_name').eq('id', subjectId).limit(1)

    if (error) throw new Error(`Nie udało się odczytać osoby (${table}): ${error.message}`)

    const row = data?.[0]
    if (!row) {
        throw new ExpectedError(
            subjectType === 'employee'
                ? 'Nie znaleziono pracownika o podanym identyfikatorze.'
                : 'Nie znaleziono kontraktora o podanym identyfikatorze.',
        )
    }

    return { id: String(row.id), fullName: String(row.full_name ?? '') }
}

/**
 * Kopia wszystkich danych osoby (art. 15 ust. 3 RODO).
 *
 * Zwraca dane, a nie plik: format wręczenia (JSON, PDF, wydruk) to decyzja
 * wywołującego. Awaria pojedynczego źródła NIE przerywa eksportu — zamiast tego
 * ląduje w `unavailable`, bo niekompletny eksport z jawną listą braków jest
 * użyteczny, a brak eksportu nie jest.
 */
export async function exportPersonalData(input: {
    subjectType: GdprSubjectType
    subjectId: string
}): Promise<ActionResult<GdprExport>> {
    return runAction('exportPersonalData', async () => {
        const ctx = await requireAdminAction()
        const subject = await loadSubject(input.subjectType, input.subjectId)
        const db = genericDb()

        const sections: GdprExportSection[] = []
        const unavailable: { table: string; reason: string }[] = []

        for (const source of sourcesFor(input.subjectType)) {
            const result = await readBoundedRows(source.table, () => db.from(source.table)
                .select(source.select ?? '*').eq(source.column, input.subjectId))
            if (result.error) {
                unavailable.push({ table: source.table, reason: result.error })
                continue
            }
            sections.push(exportSection(source.table, source.label, source.table === 'course_completions' ? {
                ...result,
                rows: result.rows.flatMap(row => {
                    const projected = subjectCompletionRow(row, input.subjectId)
                    return projected ? [projected] : []
                }),
            } : result))
        }

        if (input.subjectType === 'employee') {
            // session_attendance has no user_id; its enrollment FK identifies the learner.
            const attendance = await readBoundedRows('session_attendance', () => db.from('session_attendance')
                .select('session_id,enrollment_id,status,attended_seconds,source,note,report_ids,updated_at,course_enrollments!inner(user_id)')
                .eq('course_enrollments.user_id', input.subjectId))
            if (attendance.error) unavailable.push({ table: 'session_attendance', reason: attendance.error })
            else {
                const hasManualNotes = attendance.rows.some(row => typeof row.note === 'string' && row.note.trim() !== '')
                sections.push(exportSection('session_attendance', 'Obecność na spotkaniach szkoleniowych', {
                    ...attendance, rows: attendance.rows.map(({ course_enrollments: _enrollment, note: _note, ...row }) => row),
                }))
                if (hasManualNotes) unavailable.push({ table: 'session_attendance', reason: 'Notatki ręcznej obecności mogą zawierać dane innych osób i wymagają przeglądu przed udostępnieniem.' })
            }

            const audit = await readBoundedRows('academy_audit_events', () => db.from('academy_audit_events')
                .select('id,action,course_id,details,created_at')
                .contains('details', { user_id: input.subjectId })
                .in('action', SUBJECT_ACADEMY_AUDIT_ACTIONS))
            if (audit.error) unavailable.push({ table: 'academy_audit_events', reason: audit.error })
            else sections.push(exportSection('academy_audit_events', 'Zdarzenia Akademii dotyczące osoby', {
                ...audit, rows: audit.rows.flatMap(row => {
                    const projected = subjectAcademyAuditRow(row, input.subjectId)
                    return projected ? [projected] : []
                }),
            }))

            const registrations = sections.find(section => section.table === 'course_run_registrations')
            const trainerSources = ['academy_user_capabilities', 'course_staff', 'course_run_staff', 'academy_organizers']
            const trainerScopeUnknown = trainerSources.some(table => !sections.some(section => section.table === table))
            const trainerHistory = trainerSources.some(table => sections.some(section => section.table === table && section.rows.length > 0))
            const authored = await db.from('courses').select('id').eq('author_id', input.subjectId).limit(1)
            const trainerScopeIncomplete = trainerScopeUnknown || !!authored.error || trainerHistory || !!authored.data?.length
            const runIds = registrations?.rows.map(row => row.run_id).filter((id): id is string => typeof id === 'string') ?? []
            const sessionIds = new Set(attendance.rows.map(row => row.session_id).filter((id): id is string => typeof id === 'string'))
            let sessionsFailed = false
            for (let offset = 0; offset < runIds.length && !sessionsFailed; offset += 50) {
                const runs = [...new Set(runIds.slice(offset, offset + 50))]
                const sessions = await readBoundedRows('course_sessions', () => db.from('course_sessions')
                    .select('id,run_id').in('run_id', runs))
                if (sessions.error || sessions.truncated) { sessionsFailed = true; break }
                for (const session of sessions.rows) if (typeof session.id === 'string') sessionIds.add(session.id)
            }
            if (trainerScopeIncomplete || attendance.error || attendance.truncated || !registrations || registrations.truncated
                || sessionsFailed || sessionIds.size > MAX_ROWS_PER_SOURCE) {
                unavailable.push({ table: 'academy_attendance_reports', reason: 'Nie można bezpiecznie ustalić pełnego zakresu raportów obecności osoby, w tym edycji prowadzonych jako trener.' })
            } else if (sessionIds.size === 0) {
                sections.push(exportSection('academy_attendance_reports', 'Własne zapisy z raportów Teams', { rows: [], truncated: false }))
            } else {
                const reportRows: RowBag[] = []
                let reportsTruncated = false
                let reportError: string | undefined
                let needsReview = false
                // Keep IN filters and responses bounded, even for long-lived learners.
                const ownSessionIds = [...sessionIds]
                for (let offset = 0; offset < ownSessionIds.length && !reportsTruncated && !reportError; offset += 50) {
                    const ids = ownSessionIds.slice(offset, offset + 50)
                    const rosterResponse = await db.rpc('academy_gdpr_attendance_roster', { p_session_ids: ids })
                    if (rosterResponse.error) { reportError = rosterResponse.error.message; break }
                    const rosters = parseAttendanceRosterRows(rosterResponse.data, ids)
                    if (!rosters) { reportError = 'Niepełna lub niepoprawna lista potwierdzonych uczestników; raporty wymagają ręcznego przeglądu.'; break }
                    const reports = await readBoundedRows('academy_attendance_reports', () => db.from('academy_attendance_reports')
                        .select('session_id,report_id,evidence,imported_at').in('session_id', ids))
                    if (reports.error) { reportError = reports.error; break }
                    reportsTruncated = reports.truncated
                    for (const report of reports.rows) {
                        const participants = rosters.get(String(report.session_id))
                        if (!participants) { reportError = 'Raport spoza potwierdzonej listy sesji.'; break }
                        needsReview ||= !participants.some(participant => participant.profileId === input.subjectId)
                        const projected = subjectTeamsReportRows(report, participants, input.subjectId)
                        reportRows.push(...projected.rows)
                        needsReview ||= projected.needsReview
                        if (reportRows.length > MAX_ROWS_PER_SOURCE) { reportsTruncated = true; break }
                    }
                }
                if (reportError) unavailable.push({ table: 'academy_attendance_reports', reason: reportError })
                else {
                    sections.push(exportSection('academy_attendance_reports', 'Własne zapisy z raportów Teams', {
                        rows: reportRows.slice(0, MAX_ROWS_PER_SOURCE), truncated: reportsTruncated,
                    }))
                    if (needsReview) unavailable.push({ table: 'academy_attendance_reports', reason: 'Część surowych wpisów Teams jest niejednoznaczna lub niepoprawna; pominięte wpisy wymagają ręcznego przeglądu.' })
                }
            }
        }

        // Sam eksport jest czynnością na danych osobowych — musi zostawić ślad,
        // kto i kiedy zbudował komplet danych o konkretnej osobie.
        await logAudit(ctx.userId, 'GDPR_DATA_EXPORTED', {
            subject_type: input.subjectType,
            subject_id: input.subjectId,
            sections: sections.length,
            rows: sections.reduce((sum, s) => sum + s.rowCount, 0),
            unavailable: unavailable.map(u => u.table),
        })

        return {
            subjectType: input.subjectType,
            subjectId: subject.id,
            subjectName: subject.fullName,
            generatedAt: new Date().toISOString(),
            sections,
            unavailable,
            manualFollowUps: [
                ...manualFollowUpsFor(input.subjectType),
                ...(input.subjectType === 'employee' ? ACADEMY_EXPORT_FOLLOW_UPS : []),
            ],
        }
    })
}

// ─── art. 17 — zacieranie ───────────────────────────────────────────────────

export interface GdprScrubStepResult {
    table: string
    label: string
    operation: 'update' | 'delete'
    ok: boolean
    error?: string
}

export interface GdprAnonymizationReport {
    subjectType: GdprSubjectType
    subjectId: string
    /** Nazwa sprzed zabiegu — jedyne miejsce, w którym jeszcze się pojawia. */
    previousName: string
    performedAt: string
    /** False, gdy choć jeden krok padł — operację można powtórzyć, jest idempotentna. */
    completed: boolean
    steps: GdprScrubStepResult[]
    retained: RetainedRecord[]
    manualFollowUps: string[]
}

/**
 * Zaciera tożsamość osoby, zostawiając rekordy z własnym terminem przechowywania
 * jako pseudonimowe (wzorzec anonimowego wywiadu wyjściowego z Fazy 22).
 *
 * Operacja jest NIEODWRACALNA, więc:
 *   • `confirmation` musi dosłownie zgadzać się z aktualną nazwą osoby —
 *     wymusza spojrzenie na to, kogo się faktycznie zaciera (identyfikatory
 *     w schowku bywają nie te),
 *   • `reason` (podstawa żądania) trafia do audytu — bez niej nie da się później
 *     wykazać, że zabieg był realizacją żądania, a nie czyimś pomysłem.
 *
 * Kroki są idempotentne: powtórzenie po częściowej awarii dokończy resztę.
 */
export async function anonymizePersonalData(input: {
    subjectType: GdprSubjectType
    subjectId: string
    /** Dosłowna nazwa osoby — potwierdzenie, że zacieramy właściwy rekord. */
    confirmation: string
    /** Podstawa żądania (np. numer sprawy, data wpłynięcia wniosku). */
    reason: string
}): Promise<ActionResult<GdprAnonymizationReport>> {
    return runAction('anonymizePersonalData', async () => {
        const ctx = await requireAdminAction()

        if (!input.reason?.trim()) {
            throw new ExpectedError('Podaj podstawę żądania — trafia do dziennika audytu.')
        }

        // Zacieranie własnego profilu odcięłoby operatora w połowie operacji
        // (employment_status='exited' blokuje logowanie od Fazy 43).
        if (input.subjectType === 'employee' && input.subjectId === ctx.userId) {
            throw new ExpectedError('Nie możesz zatrzeć własnego profilu — poproś innego administratora.')
        }

        const subject = await loadSubject(input.subjectType, input.subjectId)

        if (input.confirmation.trim() !== subject.fullName.trim()) {
            throw new ExpectedError(
                `Potwierdzenie nie zgadza się z nazwą osoby. Wpisz dokładnie: „${subject.fullName}".`,
            )
        }

        const db = genericDb()
        const steps: GdprScrubStepResult[] = []

        for (const step of scrubStepsFor(input.subjectType, input.subjectId)) {
            const table = db.from(step.table)
            const { error } =
                step.operation === 'delete'
                    ? await table.delete().eq(step.column, input.subjectId)
                    : await table.update(step.patch).eq(step.column, input.subjectId)

            steps.push({
                table: step.table,
                label: step.label,
                operation: step.operation,
                ok: !error,
                ...(error ? { error: error.message } : {}),
            })
        }

        const completed = steps.every(s => s.ok)

        await logAudit(ctx.userId, 'GDPR_SUBJECT_ANONYMIZED', {
            subject_type: input.subjectType,
            subject_id: input.subjectId,
            // Nazwa sprzed zabiegu zostaje w audycie ŚWIADOMIE: bez niej nie da się
            // wykazać, czyje żądanie zrealizowano. Dziennik ma własną retencję (12 mies.).
            previous_name: subject.fullName,
            reason: input.reason.trim(),
            completed,
            failed_steps: steps.filter(s => !s.ok).map(s => s.table),
        })

        return {
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            previousName: subject.fullName,
            performedAt: new Date().toISOString(),
            completed,
            steps,
            retained: [...retainedFor(input.subjectType)],
            manualFollowUps: [...manualFollowUpsFor(input.subjectType)],
        }
    })
}
