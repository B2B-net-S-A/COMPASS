import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { withCronAuth } from '@/lib/api/with-auth'
import { downloadSharedWorkbook } from '@/lib/graph/sharepoint'
import { importWejsciaFromBuffer, importZejsciaFromBuffer } from '@/lib/contractors/import-core'
import { seedBenchFromRecentDepartures } from '@/lib/contractors/bench-seed'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 240

const HUB = '/internal/kontraktorzy'

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
 */
export const GET = withCronAuth(async (_request, { admin }) => {
    const fileUrl = process.env.TC_SYNC_FILE_URL
    if (!fileUrl) {
        return NextResponse.json({ ok: false, error: 'TC_SYNC_FILE_URL nie skonfigurowany' })
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
        return NextResponse.json({ ok: false, error: 'Brak aktora importu (ustaw TC_SYNC_USER_ID)' })
    }

    let buffer: Buffer
    try {
        buffer = await downloadSharedWorkbook(fileUrl)
    } catch (e) {
        const error = e instanceof Error ? e.message : 'pobranie pliku nie powiodło się'
        logger.error({ event: 'cron.tc_sync.download_failed', error })
        return NextResponse.json({ ok: false, stage: 'download', error })
    }

    const out: Record<string, unknown> = { ok: true, bytes: buffer.length }
    // One workbook, two sheets; each parser finds its own. Import independently so one failing
    // sheet doesn't block the other.
    try {
        out.wejscia = await importWejsciaFromBuffer(admin, buffer, actorUserId)
    } catch (e) {
        out.wejscia = { error: e instanceof Error ? e.message : 'import wejść nie powiódł się' }
        out.ok = false
    }
    try {
        out.zejscia = await importZejsciaFromBuffer(admin, buffer, actorUserId)
    } catch (e) {
        out.zejscia = { error: e instanceof Error ? e.message : 'import zejść nie powiódł się' }
        out.ok = false
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
    return NextResponse.json(out)
})
