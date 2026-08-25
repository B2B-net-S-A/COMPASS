import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import * as Sentry from '@sentry/nextjs'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'
import { downloadSharedWorkbook } from '@/lib/graph/sharepoint'
import { importWejsciaFromBuffer, importZejsciaFromBuffer } from '@/lib/contractors/import-core'
import { seedBenchFromRecentDepartures } from '@/lib/contractors/bench-seed'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
// UWAGA: `maxDuration` jest tu MARTWE. Next 14.2 czyta ten eksport przy buildzie i
// tłumaczy go na limit funkcji serverless (Vercel/Lambda); w kontenerze na Coolify nikt
// go nie egzekwuje, więc nie jest to działająca ochrona przed zawieszonym przebiegiem.
// Zostaje jako deklaracja intencji na wypadek zmiany hostingu — realnym limitem jest
// timeout per żądanie na proxy (Traefik/Cloudflare) i limity samych wywołań.
export const maxDuration = 240

// Audyt 2026-08 — patrz komentarz w lib/actions/contractors.ts: stara trasa to redirect.
const HUB = '/internal/people'

/**
 * Phase 39 — daily Talent Community sync. Downloads the canonical SharePoint workbook
 * ("Wejścia i zejścia od klientów") via Microsoft Graph (app-only, Sites.Read.All) and re-imports
 * both sheets idempotently (upsert by external_key) into client_entries / client_departures.
 * Additive: new rows in the file appear in Compass; the parsers each locate their own sheet in the
 * shared workbook.
 *
 * Config (Coolify env, runtime):
 *   - TC_SYNC_FILE_URL  — the SharePoint sharing link to the workbook (required)
 *   - TC_SYNC_USER_ID   — profile id used as imported_by / audit actor (optional; falls back to
 *                          the earliest admin)
 *
 * Coolify cron suggestion: `0 5 * * *` (05:00 UTC daily).
 *
 * Audyt 2026-08 (C11.3): awaria konfiguracji i pobrania pliku zwracały HTTP 200 z
 * `ok:false` i nie raportowały nic do Sentry — dla każdego monitoringu patrzącego na
 * kod odpowiedzi wyglądało to jak udany przebieg, więc sync mógł stać tygodniami.
 * Teraz każda z tych ścieżek kończy się 500 + wpisem w Sentry, a ślad w bazie zostawia
 * heartbeat `TC_SYNC_RUN` (statystyki = ciało odpowiedzi).
 */
export const GET = withCronAuth(withCronHeartbeat('TC_SYNC_RUN', async (_request, { admin }) => {
    const fileUrl = process.env.TC_SYNC_FILE_URL
    if (!fileUrl) {
        const error = 'TC_SYNC_FILE_URL nie skonfigurowany'
        logger.error({ event: 'cron.tc_sync.not_configured', error })
        Sentry.captureMessage('tc_sync_not_configured', {
            level: 'error',
            tags: { kind: 'cron_tc_sync' },
        })
        return NextResponse.json({ ok: false, stage: 'config', error }, { status: 500 })
    }

    // System actor (imported_by / audit). client_entries etc. allow NULL, but a real id is better
    // for traceability and import-core expects a string.
    let actorUserId = process.env.TC_SYNC_USER_ID ?? null
    if (!actorUserId) {
        const { data } = await admin
            .from('profiles')
            .select('id')
            .eq('role', 'admin')
            .order('created_at', { ascending: true })
            .limit(1)
        actorUserId = ((data ?? []) as Array<{ id: string }>)[0]?.id ?? null
    }
    if (!actorUserId) {
        const error = 'Brak aktora importu (ustaw TC_SYNC_USER_ID)'
        logger.error({ event: 'cron.tc_sync.no_actor', error })
        Sentry.captureMessage('tc_sync_no_actor', {
            level: 'error',
            tags: { kind: 'cron_tc_sync' },
        })
        return NextResponse.json({ ok: false, stage: 'config', error }, { status: 500 })
    }

    let buffer: Buffer
    try {
        buffer = await downloadSharedWorkbook(fileUrl)
    } catch (e) {
        const error = e instanceof Error ? e.message : 'pobranie pliku nie powiodło się'
        logger.error({ event: 'cron.tc_sync.download_failed', error })
        Sentry.captureException(e, { tags: { kind: 'cron_tc_sync' } })
        return NextResponse.json({ ok: false, stage: 'download', error }, { status: 500 })
    }

    const out: Record<string, unknown> = { ok: true, bytes: buffer.length }
    // One workbook, two sheets; each parser finds its own. Import independently so one failing
    // sheet doesn't block the other.
    try {
        out.wejscia = await importWejsciaFromBuffer(admin, buffer, actorUserId)
    } catch (e) {
        out.wejscia = { error: e instanceof Error ? e.message : 'import wejść nie powiódł się' }
        out.ok = false
        Sentry.captureException(e, { tags: { kind: 'cron_tc_sync', sheet: 'wejscia' } })
    }
    try {
        out.zejscia = await importZejsciaFromBuffer(admin, buffer, actorUserId)
    } catch (e) {
        out.zejscia = { error: e instanceof Error ? e.message : 'import zejść nie powiódł się' }
        out.ok = false
        Sentry.captureException(e, { tags: { kind: 'cron_tc_sync', sheet: 'zejscia' } })
    }

    // Bench seeduje się tu (jawny job), nie przy renderze listy — audyt 2026-07-16 P1.8.
    // Best-effort: brak seedu nie unieważnia importu.
    try {
        out.benchSeed = await seedBenchFromRecentDepartures(admin)
    } catch (e) {
        out.benchSeed = { error: e instanceof Error ? e.message : 'seed benchu nie powiódł się' }
    }

    revalidatePath(HUB)
    logger.info({ event: 'cron.tc_sync.done', ...out })
    // Padnięty arkusz to nadal padnięty sync — kod odpowiedzi musi to powiedzieć,
    // inaczej `ok:false` w ciele przeczyta wyłącznie ten, kto zna CRON_SECRET.
    return NextResponse.json(out, { status: out.ok === false ? 500 : 200 })
}))
