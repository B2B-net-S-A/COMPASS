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

/**
 * Górny limit wierszy na jedno źródło. `audit_logs` osoby aktywnej od roku to
 * już setki wpisów; bez limitu jedno żądanie potrafiłoby wciągnąć do pamięci
 * cały dziennik. Ucięcie jest RAPORTOWANE — eksport, który po cichu gubi dane,
 * nie realizuje art. 15.
 */
const MAX_ROWS_PER_SOURCE = 5000

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
    limit(count: number): FilterLike
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
}

function genericDb(): GenericDb {
    return createServiceClient() as unknown as GenericDb
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
            const { data, error } = await db
                .from(source.table)
                .select('*')
                .eq(source.column, input.subjectId)
                .limit(MAX_ROWS_PER_SOURCE + 1)

            if (error) {
                unavailable.push({ table: source.table, reason: error.message })
                continue
            }

            const rows = data ?? []
            const truncated = rows.length > MAX_ROWS_PER_SOURCE
            sections.push({
                table: source.table,
                label: source.label,
                rowCount: truncated ? MAX_ROWS_PER_SOURCE : rows.length,
                truncated,
                rows: truncated ? rows.slice(0, MAX_ROWS_PER_SOURCE) : rows,
            })
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
            manualFollowUps: [...manualFollowUpsFor(input.subjectType)],
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
