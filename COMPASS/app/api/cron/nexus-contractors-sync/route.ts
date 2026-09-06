import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'
import { logger } from '@/lib/logger'
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
 * CO TA TRASA ZAPISUJE: wyłącznie `nexus_contract_id`, `nexus_match_status`
 * i `nexus_synced_at`. **Nie dotyka** `full_name`, `status`, `owner_tcm_id`
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
        const body = (await response.json()) as ExportPage
        out.push(...(body.items ?? []))
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

        // `nexus_match_status` jest CZĘŚCIĄ wejścia reguły, nie tylko wyjściem:
        // bez niego `decideMatches` nie odróżni „jeszcze nierozstrzygnięty" od
        // „człowiek powiedział, że tej osoby nie ma w NEXUSIE".
        const { data: rows, error: readError } = await admin
            .from('contractors')
            .select('id, full_name, email, nexus_contract_id, nexus_match_status')
        if (readError) {
            throw new Error(`Odczyt contractors nie powiódł się: ${readError.message}`)
        }

        const decisions = decideMatches((rows ?? []) as CompassContractor[], nexus)
        const now = new Date().toISOString()

        // Zapis grupami po werdykcie: 689 pojedynczych UPDATE-ów to 689
        // round-tripów na każdy przebieg. Grupowanie schodzi do czterech.
        //
        // Świadomie NIE `upsert(..., { onConflict: 'id' })`: to ścieżka
        // INSERT ... ON CONFLICT, więc PostgREST waliduje payload wobec
        // całej tabeli i brak `full_name` (NOT NULL, bez wartości domyślnej)
        // wywracałby zapis. UPDATE ... IN nie ma tego problemu.
        const byStatus = new Map<string, MatchDecision[]>()
        for (const d of decisions) {
            const bucket = byStatus.get(d.status)
            if (bucket) bucket.push(d)
            else byStatus.set(d.status, [d])
        }

        let written = 0
        for (const [status, group] of byStatus) {
            // `linked` niesie RÓŻNE `nexus_contract_id` per wiersz, więc tej
            // grupy nie da się zapisać jednym UPDATE-em — ale to jedyna taka
            // grupa i po pierwszym przebiegu jest już w większości stabilna.
            if (status === 'linked') {
                for (const d of group) {
                    const { error: writeError } = await admin
                        .from('contractors')
                        .update({
                            nexus_contract_id: d.nexusContractId,
                            nexus_match_status: d.status,
                            nexus_synced_at: now,
                        })
                        .eq('id', d.contractorId)
                    if (writeError) {
                        logger.error({
                            event: 'cron.nexus_contractors.write_failed',
                            contractor_id: d.contractorId,
                            msg: writeError.message,
                        })
                        Sentry.captureException(writeError, {
                            tags: { kind: 'cron_nexus_contractors', stage: 'write' },
                        })
                        continue
                    }
                    written += 1
                }
                continue
            }

            const ids = group.map((d) => d.contractorId)
            const { error: writeError } = await admin
                .from('contractors')
                .update({
                    nexus_contract_id: null,
                    nexus_match_status: status,
                    nexus_synced_at: now,
                })
                .in('id', ids)
            if (writeError) {
                // Grupa nie może wywrócić całego przebiegu, ale musi zostawić
                // ślad — cichy błąd zapisu wygląda jak brak zmian.
                logger.error({
                    event: 'cron.nexus_contractors.write_failed',
                    status,
                    rows: ids.length,
                    msg: writeError.message,
                })
                Sentry.captureException(writeError, {
                    tags: { kind: 'cron_nexus_contractors', stage: 'write' },
                })
                continue
            }
            written += ids.length
        }

        const out = {
            ok: true,
            nexus_rows: nexus.length,
            compass_rows: decisions.length,
            written,
            ...summarize(decisions),
        }
        logger.info({ event: 'cron.nexus_contractors.done', ...out })
        return NextResponse.json(out)
    }),
)
