import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'
import { logger } from '@/lib/logger'
import type { createServiceClient } from '@/lib/supabase/admin'
import { DEFAULT_IN_CHUNK_SIZE } from '@/lib/supabase/select-in-chunks'
import {
    decideMatches,
    summarize,
    type CompassContractor,
    type MatchDecision,
    type NexusContractor,
} from '@/lib/contractors/nexus-match'

/**
 * GET /api/cron/nexus-contractors-sync
 *
 * Pobiera kontraktorów z NEXUSA i dopina im tożsamość po stronie COMPASSA.
 *
 * PO CO: `contractors` ma 689 wierszy, z czego ZERO ma e-mail i zero
 * `profile_id`; wszystkie mają `status='active'` mimo 365 zejść
 * w `client_departures`. NEXUS zna te osoby dokładnie — z e-mailem, klientem,
 * datami i realnym statusem umowy.
 *
 * CO TA TRASA ZAPISUJE: `nexus_contract_snapshot` (ostatni kompletny eksport)
 * oraz na `contractors` wyłącznie `nexus_contract_id`, `nexus_candidate_id`,
 * `nexus_match_status`, `nexus_match_reason` i `nexus_synced_at`. **Nie dotyka** `full_name`, `status`, `owner_tcm_id`
 * ani niczego, co prowadzi zespół TCM — ta integracja dokłada tożsamość,
 * nie przejmuje kartoteki.
 *
 * DLACZEGO NIE NADPISUJEMY `contractors.email`: adres z NEXUSA to adres
 * KANDYDATA. `activateSuccessMonitoring` wysyła na `contractors.email`
 * ankiety pulse do ludzi — a wpisanie tam adresu automatem, bez decyzji
 * człowieka, zmieniałoby odbiorcę realnej korespondencji. E-mail jedzie do
 * kolejki jako podpowiedź, nie jako zapis.
 */

export const dynamic = 'force-dynamic'

// Kolejne strony eksportu. Sufit istnieje, żeby awaria paginacji po drugiej
// stronie nie zamieniła crona w nieskończoną pętlę.
const MAX_PAGES = 50
const PAGE_SIZE = 200
const FETCH_TIMEOUT_MS = 20_000

type ExportPage = { items: NexusContractor[]; has_more: boolean }
type Admin = ReturnType<typeof createServiceClient>
type CurrentContractor = CompassContractor & { nexus_match_reason?: string | null }

/** PostgREST przekazuje kod Postgresa; 23505 = naruszenie unikalności. */
const UNIQUE_VIOLATION = '23505'
const SNAPSHOT_CHUNK = 500

function chunk<T>(items: readonly T[], size: number): T[][] {
    const out: T[][] = []
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
    return out
}

function reportWriteError(error: { message: string; code?: string }, extra: Record<string, unknown>) {
    logger.error({ event: 'cron.nexus_contractors.write_failed', msg: error.message, code: error.code, ...extra })
    Sentry.captureException(error, { tags: { kind: 'cron_nexus_contractors', stage: 'write' } })
}

/**
 * Upsert migawki + usunięcie kontraktów, których NEXUS już nie oddaje.
 * Zwraca `true`, gdy zapis się nie powiódł — wtedy przebieg nie jest `ok`.
 */
async function writeSnapshot(admin: Admin, nexus: readonly NexusContractor[]): Promise<boolean> {
    const seenAt = new Date().toISOString()
    const byId = new Map<number, NexusContractor>()
    for (const row of nexus) byId.set(row.nexus_contract_id, row)
    const rows = Array.from(byId.values()).map((r) => ({
        nexus_contract_id: r.nexus_contract_id,
        nexus_candidate_id: r.candidate.id,
        name: r.candidate.name,
        lastname: r.candidate.lastname,
        email: r.candidate.email,
        client_name: r.client_name,
        job_title: r.job_title,
        status: r.status,
        start_date: r.start_date,
        end_date: r.end_date,
        lacks_current_order: r.lacks_current_order === true,
        source_updated_at: r.updated_at ?? null,
        seen_at: seenAt,
    }))

    for (const part of chunk(rows, SNAPSHOT_CHUNK)) {
        const { error } = await admin
            .from('nexus_contract_snapshot')
            .upsert(part, { onConflict: 'nexus_contract_id' })
        if (error) {
            reportWriteError(error, { stage: 'snapshot_upsert', rows: part.length })
            return true
        }
    }
    // Usuwamy wyłącznie po udanym upsercie CAŁOŚCI — inaczej częściowy zapis
    // skasowałby kontrakty, których po prostu nie zdążyliśmy odświeżyć.
    const { error } = await admin.from('nexus_contract_snapshot').delete().lt('seen_at', seenAt)
    if (error) {
        reportWriteError(error, { stage: 'snapshot_prune' })
        return true
    }
    return false
}

type WriteResult = {
    written: number
    unchanged: number
    failed: number
    conflicts: number
    /** UPDATE-y, które trafiły w zero wierszy, bo ktoś zmienił wiersz po odczycie (INT-17). */
    skippedConcurrent: number
}

type Filterable = {
    eq: (column: string, value: string | number) => unknown
    is: (column: string, value: null) => unknown
}

/** `= wartość` albo `IS NULL` — PostgREST nie dopasuje NULL-a przez `eq`. */
function matchOrNull<T extends Filterable>(query: T, column: string, value: string | number | null | undefined): T {
    return (value == null ? query.is(column, null) : query.eq(column, value)) as T
}

/**
 * Zapis werdyktów. `written` liczy WYŁĄCZNIE skuteczne UPDATE-y — dawniej
 * liczył decyzje, więc awaria wszystkich zapisów dawała `ok:true`.
 *
 * - `dismissed` nie jest zapisywany wcale: to decyzja człowieka (autor, data,
 *   powód), automat jej nie dotyka.
 * - `linked` zapisujemy per wiersz i tylko przy zmianie (różne kontrakty
 *   i osoby; bez zmian nie ma czego pisać).
 * - reszta grupami po (status, powód), paczkami `.in()` ≤ 60 id.
 *   Świadomie NIE `upsert(..., { onConflict: 'id' })`: ścieżka INSERT
 *   waliduje payload wobec całej tabeli, a brak `full_name` (NOT NULL) by go
 *   wywracał.
 *
 * COMPARE-AND-SET (audyt 2026-09-22, INT-17): werdykt liczony jest z odczytu
 * sprzed kilku sekund, a w tym czasie TCM mógł w kolejce kliknąć „nie ma
 * w NEXUSIE" albo powiązać osobę ręcznie. Każdy UPDATE ma więc w WHERE stan,
 * z którego werdykt policzono (status + obie kotwice). Gdy człowiek zdążył
 * pierwszy, UPDATE trafia w zero wierszy — liczymy to jako `skipped_concurrent`
 * (nie awaria: kolejny bieg oceni wiersz od nowa, a decyzja człowieka zostaje).
 */
async function writeDecisions(
    admin: Admin,
    compass: readonly CurrentContractor[],
    decisions: readonly MatchDecision[],
    now: string,
): Promise<WriteResult> {
    const result: WriteResult = { written: 0, unchanged: 0, failed: 0, conflicts: 0, skippedConcurrent: 0 }
    const currentById = new Map(compass.map((c) => [c.id, c]))

    // Grupa = (werdykt, powód, status ODCZYTANY) — ten ostatni trafia do WHERE jako
    // warunek compare-and-set, więc wiersze o różnym stanie wyjściowym nie mogą
    // dzielić jednego UPDATE-u.
    const groups = new Map<
        string,
        { status: string; reason: string | null; readStatus: string | null; ids: string[] }
    >()
    const linked: MatchDecision[] = []
    for (const d of decisions) {
        if (d.status === 'dismissed') {
            result.unchanged += 1
            continue
        }
        if (d.status === 'linked') {
            const cur = currentById.get(d.contractorId)
            const same =
                cur?.nexus_match_status === 'linked' &&
                (cur.nexus_contract_id ?? null) === d.nexusContractId &&
                (cur.nexus_candidate_id ?? null) === d.nexusCandidateId
            if (same) result.unchanged += 1
            else linked.push(d)
            continue
        }
        const readStatus = currentById.get(d.contractorId)?.nexus_match_status ?? null
        const key = `${d.status}|${d.reason ?? ''}|${readStatus ?? ''}`
        const group = groups.get(key)
        if (group) group.ids.push(d.contractorId)
        else groups.set(key, { status: d.status, reason: d.reason, readStatus, ids: [d.contractorId] })
    }

    // Najpierw grupy bez kontraktu (zwalniają ewentualne kotwice), potem linki.
    for (const group of Array.from(groups.values())) {
        for (const ids of chunk(group.ids, DEFAULT_IN_CHUNK_SIZE)) {
            // Werdykt bez kontraktu powstaje tylko dla wierszy BEZ kotwic i nie
            // `dismissed` — dokładnie ten stan musi nadal obowiązywać w chwili zapisu.
            const base = admin
                .from('contractors')
                .update({
                    nexus_contract_id: null,
                    nexus_candidate_id: null,
                    nexus_match_status: group.status,
                    nexus_match_reason: group.reason,
                    nexus_synced_at: now,
                })
                .in('id', ids)
                .is('nexus_candidate_id', null)
                .is('nexus_contract_id', null)
            const { data, error } = await matchOrNull(base, 'nexus_match_status', group.readStatus).select('id')
            if (error) {
                if ((error as { code?: string }).code === UNIQUE_VIOLATION) result.conflicts += ids.length
                result.failed += ids.length
                reportWriteError(error, { status: group.status, rows: ids.length })
                continue
            }
            const affected = Array.isArray(data) ? data.length : 0
            result.written += affected
            result.skippedConcurrent += ids.length - affected
        }
    }

    for (const d of linked) {
        const cur = currentById.get(d.contractorId)
        let query = admin
            .from('contractors')
            .update({
                nexus_contract_id: d.nexusContractId,
                nexus_candidate_id: d.nexusCandidateId,
                nexus_match_status: 'linked',
                nexus_synced_at: now,
            })
            .eq('id', d.contractorId)
        // Zapis tylko, gdy wiersz jest w stanie, z którego policzono werdykt:
        // ręczne powiązanie z inną osobą, rozłączenie albo odrzucenie po odczycie
        // zmienia któreś z tych pól i UPDATE trafia w zero wierszy.
        query = matchOrNull(query, 'nexus_candidate_id', cur?.nexus_candidate_id)
        query = matchOrNull(query, 'nexus_contract_id', cur?.nexus_contract_id)
        query = matchOrNull(query, 'nexus_match_status', cur?.nexus_match_status)
        const { data, error } = await query.select('id')
        if (error) {
            if ((error as { code?: string }).code === UNIQUE_VIOLATION) result.conflicts += 1
            result.failed += 1
            reportWriteError(error, { contractor_id: d.contractorId, status: 'linked' })
            continue
        }
        if (Array.isArray(data) && data.length > 0) result.written += 1
        else result.skippedConcurrent += 1
    }
    return result
}

/**
 * Walidacja strony eksportu w runtime (audyt 2026-09-22, INT-18). Samo rzutowanie
 * TS niczego nie sprawdza: strona z `items`, ale BEZ `has_more`, kończyła pobieranie
 * (`!undefined`), a migawka usuwała wszystko, czego nie było na pierwszej stronie.
 * Każde odstępstwo od kontraktu rzuca — przebieg kończy się na etapie `fetch`,
 * zanim cokolwiek zostanie zapisane albo usunięte.
 */
function parseExportPage(raw: unknown, page: number): ExportPage {
    if (!raw || typeof raw !== 'object') {
        throw new Error(`NEXUS: strona ${page} nie jest obiektem JSON`)
    }
    const body = raw as { items?: unknown; has_more?: unknown }
    if (!Array.isArray(body.items)) {
        throw new Error(`NEXUS: strona ${page} bez tablicy items`)
    }
    if (typeof body.has_more !== 'boolean') {
        throw new Error(
            `NEXUS: strona ${page} bez logicznego has_more — nie wiadomo, czy eksport jest kompletny`,
        )
    }
    body.items.forEach((item: unknown, i: number) => {
        const row = item as { nexus_contract_id?: unknown; candidate?: { id?: unknown } | null } | null
        if (
            !row ||
            typeof row.nexus_contract_id !== 'number' ||
            !row.candidate ||
            typeof row.candidate.id !== 'number'
        ) {
            throw new Error(`NEXUS: strona ${page}, pozycja ${i} bez nexus_contract_id/candidate.id`)
        }
    })
    return { items: body.items as NexusContractor[], has_more: body.has_more }
}

async function fetchAllContractors(
    baseUrl: string,
    apiKey: string,
): Promise<NexusContractor[]> {
    const out: NexusContractor[] = []
    for (let page = 1; page <= MAX_PAGES; page += 1) {
        const url = new URL(baseUrl)
        url.searchParams.set('page', String(page))
        url.searchParams.set('page_size', String(PAGE_SIZE))

        // Własny timeout — w Compassie NIE MA wspólnego klienta HTTP dla
        // wywołań spoza Supabase (`hardenedFetch` jest wpięty tylko tam),
        // a najbliższy precedens (Voyage w lib/ai/embeddings.ts) nie ma ani
        // timeoutu, ani ponowień. Bez tego jedno zawieszone żądanie zjada
        // budżet czasu całej trasy bez żadnego śladu.
        const response = await fetch(url, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
        if (!response.ok) {
            throw new Error(
                `NEXUS zwrócił ${response.status} dla strony ${page}`,
            )
        }
        const body = parseExportPage(await response.json(), page)
        out.push(...body.items)
        if (!body.has_more) return out
    }
    throw new Error(`Przekroczono limit ${MAX_PAGES} stron eksportu`)
}

export const GET = withCronAuth(
    withCronHeartbeat('NEXUS_CONTRACTORS_SYNC_RUN', async (_request, { admin }) => {
        const baseUrl = process.env.NEXUS_CONTRACTORS_URL
        const apiKey = process.env.NEXUS_CONTRACTORS_API_KEY
        if (!baseUrl || !apiKey) {
            // 500, nigdy 200 z `ok:false` — brak konfiguracji musi być widoczny
            // jako awaria (audyt C11.3), inaczej cron „przechodzi" latami.
            const error = 'Brak NEXUS_CONTRACTORS_URL albo NEXUS_CONTRACTORS_API_KEY'
            logger.error({ event: 'cron.nexus_contractors.not_configured' })
            Sentry.captureMessage('nexus_contractors_not_configured')
            return NextResponse.json(
                { ok: false, stage: 'config', error },
                { status: 500 },
            )
        }

        let nexus: NexusContractor[]
        try {
            nexus = await fetchAllContractors(baseUrl, apiKey)
        } catch (e) {
            const error = e instanceof Error ? e.message : String(e)
            Sentry.captureException(e, { tags: { kind: 'cron_nexus_contractors' } })
            return NextResponse.json(
                { ok: false, stage: 'fetch', error },
                { status: 500 },
            )
        }

        // Pusta odpowiedź to awaria po drugiej stronie, nie „nie ma
        // kontraktorów". Bez tego bezpiecznika jeden zły przebieg oznaczyłby
        // wszystkie 689 wierszy jako `not_found`.
        if (nexus.length === 0) {
            const error = 'NEXUS zwrócił pustą listę kontraktorów'
            Sentry.captureMessage('nexus_contractors_empty')
            return NextResponse.json(
                { ok: false, stage: 'fetch', error },
                { status: 500 },
            )
        }

        // Migawka ostatniego KOMPLETNEGO eksportu — źródło podpowiedzi kolejki
        // i weryfikacji ręcznego powiązania. Pisana dopiero tutaj: pobranie
        // wyżej rzuca albo zwraca pełny zbiór, więc „niewidziane" = zniknęło
        // z NEXUSA, a nie „nie zdążyliśmy pobrać strony".
        const snapshotFailed = await writeSnapshot(admin, nexus)

        // `nexus_match_status` jest CZĘŚCIĄ wejścia reguły, nie tylko wyjściem:
        // bez niego `decideMatches` nie odróżni automatu od decyzji człowieka.
        const { data: rows, error: readError } = await admin
            .from('contractors')
            .select(
                'id, full_name, email, nexus_contract_id, nexus_candidate_id, nexus_match_status, nexus_match_reason',
            )
        if (readError) {
            throw new Error(`Odczyt contractors nie powiódł się: ${readError.message}`)
        }

        const compass = (rows ?? []) as CurrentContractor[]
        const decisions = decideMatches(compass, nexus)
        const result = await writeDecisions(admin, compass, decisions, new Date().toISOString())

        const failed = result.failed + (snapshotFailed ? 1 : 0)
        const out = {
            ok: failed === 0,
            ...(failed > 0 ? { stage: snapshotFailed && result.failed === 0 ? 'snapshot' : 'write' } : {}),
            nexus_rows: nexus.length,
            compass_rows: decisions.length,
            written: result.written,
            unchanged: result.unchanged,
            failed: result.failed,
            conflicts: result.conflicts,
            skipped_concurrent: result.skippedConcurrent,
            snapshot_failed: snapshotFailed,
            // Osoba NEXUSA trzymana przez kilku kontraktorów — do rozstrzygnięcia w kolejce.
            linked_twice: decisions.filter((d) => d.reason === 'nexus_person_linked_twice').length,
            ...summarize(decisions),
        }
        if (failed > 0) {
            // 500, nie 200: zielony przebieg przy niezapisanych werdyktach
            // wyglądałby na kompletny (audyt integracji 14.09, INT-07).
            logger.error({ event: 'cron.nexus_contractors.partial', ...out })
            Sentry.captureMessage('nexus_contractors_write_failed', {
                level: 'error',
                extra: out,
            })
            return NextResponse.json(out, { status: 500 })
        }
        logger.info({ event: 'cron.nexus_contractors.done', ...out })
        return NextResponse.json(out)
    }),
)
