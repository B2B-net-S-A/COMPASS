import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'
import { logSystemAudit } from '@/lib/audit/system-log'
import { revokeAccountAccess } from '@/lib/auth/account-access'
import { isSuperAdmin } from '@/lib/auth/super-admins'
import { isMovedToNexus } from '@/lib/hr/moved-to-nexus'
import {
    RosterContractError,
    parseNexusRoster,
    planRosterSync,
    type CompassProfileRow,
    type ProfileChange,
    type RosterPlan,
} from '@/lib/hr/nexus-roster'
import { logger } from '@/lib/logger'
import type { createServiceClient } from '@/lib/supabase/admin'

/**
 * GET /api/cron/nexus-roster-sync
 *
 * „Ludzie w NEXUSIE”: Compass (Akademia) czyta listę osób z NEXUSA
 * (`GET {NEXUS}/api/integrations/compass/roster`, `X-API-Key` z zakresem
 * `people_roster:read`) i aktualizuje u ISTNIEJĄCYCH profili status zatrudnienia,
 * przełożonego i daty. Rola zostaje lokalna. Reguły dopasowania i bezpieczniki:
 * `lib/hr/nexus-roster.ts`.
 *
 * Działa tylko, gdy `lifecycle` jest w `HR_MOVED_TO_NEXUS` — wcześniej źródłem listy
 * jest Compass (`/api/internal/roster` czyta NEXUS), a dwa źródła naraz to wyścig.
 *
 * Odejście (`exited`) odcina też konto w Auth (`revokeAccountAccess`, jak
 * `deactivateEmployee`), powrót zdejmuje blokadę (jak `reactivateEmployee`) — sam status
 * blokuje aplikację, ale nie Data API (audyt 2026-09-22, SEC-01).
 *
 * Zielony tylko przy pełnym zapisie: każdy nieudany zapis = HTTP 500 `ok:false`
 * (lekcja z `nexus-contractors-sync`, INT-07). Odpowiedź niesie same liczby.
 *
 * Bezpiecznik (>5 odejść albo >5 powrotów naraz) zatrzymuje cały przebieg. Gdy człowiek
 * sprawdził, że to prawda, zatwierdza DOKŁADNĄ liczbę jednym ręcznym wywołaniem:
 * `?confirm_exits=<n>` / `?confirm_returns=<n>` (ten sam Bearer `CRON_SECRET`). Inna liczba
 * niż zaplanowana = nadal odmowa, więc zatwierdzenie nie przechodzi na kolejny, inny stan.
 *
 * Coolify: zadanie z nazwą kontenera (bez niej pada mimo schedulera), np. `7 * * * *`.
 */

export const dynamic = 'force-dynamic'

const FETCH_TIMEOUT_MS = 20_000
const TRIGGER_REFUSAL = 'P0001'

type Admin = ReturnType<typeof createServiceClient>

interface WriteStats {
    written: number
    failed: number
    blocked_by_trigger: number
    skipped_concurrent: number
}

/** Zatwierdzenie bezpiecznika: `?confirm_exits=7` przepuszcza wyłącznie plan z 7 odejściami. */
function unconfirmedRefusals(plan: RosterPlan, url: URL): RosterPlan['refusals'] {
    const confirmed = (param: string, planned: number) => {
        const raw = url.searchParams.get(param)
        return raw !== null && /^\d+$/.test(raw) && Number(raw) === planned
    }
    return plan.refusals.filter((refusal) =>
        refusal === 'mass_exit'
            ? !confirmed('confirm_exits', plan.stats.exits)
            : !confirmed('confirm_returns', plan.stats.returns))
}

async function applyChange(admin: Admin, change: ProfileChange, stats: WriteStats): Promise<void> {
    // Odcięcie przed statusem: gdy zapis statusu padnie, następny przebieg powtórzy oba
    // kroki (blokada jest idempotentna). Odwrotna kolejność zostawiłaby `exited` bez blokady
    // w Auth, a kolejny przebieg nie widziałby już różnicy, którą trzeba naprawić.
    if (change.exit) await revokeAccountAccess(change.id)
    if (change.returning) {
        const { error } = await admin.auth.admin.updateUserById(change.id, { ban_duration: 'none' })
        if (error) throw new Error(`Zdjęcie blokady konta nie powiodło się: ${error.message}`)
    }

    const base = admin.from('profiles').update(change.patch).eq('id', change.id)
    const guarded = change.previousStatus === null
        ? base.is('employment_status', null)
        : base.eq('employment_status', change.previousStatus)
    const { data, error } = await guarded.select('id')
    if (error) {
        // `block_employment_reversal_after_exit` odmawia cofnięcia `offboarding` przy
        // wypełnionym exit interview — to decyzja dla człowieka, nie awaria sieci.
        if (error.code === TRIGGER_REFUSAL) stats.blocked_by_trigger += 1
        else stats.failed += 1
        logger.error({ event: 'cron.nexus_roster.write_failed', profileId: change.id, code: error.code })
        return
    }
    if (!data || data.length === 0) {
        // Ktoś zmienił status między odczytem a zapisem — następny przebieg porówna od nowa.
        stats.skipped_concurrent += 1
        return
    }
    stats.written += 1
    await logSystemAudit(change.id, 'NEXUS_ROSTER_PROFILE_SYNCED', {
        source: 'nexus_roster',
        fields: Object.keys(change.patch),
        ...(change.patch.employment_status
            ? { employment_status: { from: change.previousStatus, to: change.patch.employment_status } }
            : {}),
    })
}

export const GET = withCronAuth(
    withCronHeartbeat('NEXUS_ROSTER_SYNC_RUN', async (request, { admin }) => {
        if (!isMovedToNexus('lifecycle')) {
            return NextResponse.json({
                ok: true,
                skipped: true,
                reason: 'lifecycle nie jest w HR_MOVED_TO_NEXUS — listę osób prowadzi jeszcze Compass',
            })
        }

        const url = process.env.NEXUS_ROSTER_URL
        const apiKey = process.env.NEXUS_ROSTER_API_KEY
        if (!url || !apiKey) {
            // 500, nie 200 `ok:false` — brak konfiguracji ma być widoczny jak awaria (audyt C11.3).
            logger.error({ event: 'cron.nexus_roster.not_configured' })
            Sentry.captureMessage('nexus_roster_not_configured')
            return NextResponse.json(
                { ok: false, stage: 'config', error: 'Brak NEXUS_ROSTER_URL albo NEXUS_ROSTER_API_KEY' },
                { status: 500 },
            )
        }

        let people
        try {
            const response = await fetch(url, {
                headers: { 'X-API-Key': apiKey },
                cache: 'no-store',
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            })
            if (!response.ok) {
                // 404 = NEXUS jeszcze nie wydaje listy (moduł wejścia/odejścia wyłączony),
                // 503 = NEXUS odmówił pustej listy. Żadne z nich nie jest „wszyscy odeszli”.
                return NextResponse.json(
                    { ok: false, stage: 'fetch', nexus_status: response.status },
                    { status: 500 },
                )
            }
            people = parseNexusRoster(await response.json())
        } catch (e) {
            const contract = e instanceof RosterContractError
            const error = contract ? e.message : 'Pobranie listy osób z NEXUSA nie powiodło się'
            if (!contract) Sentry.captureException(e, { tags: { kind: 'cron_nexus_roster' } })
            return NextResponse.json(
                { ok: false, stage: contract ? 'contract' : 'fetch', error },
                { status: 500 },
            )
        }

        const { data: rows, error: readError } = await admin
            .from('profiles')
            .select('id, email, role, employment_status, manager_id, work_start_date, termination_date')
        if (readError || !rows) {
            // `null` bez błędu to też awaria — pusta kartoteka Compassa nie jest stanem do zapisu.
            throw new Error(`Odczyt profiles nie powiódł się: ${readError?.message ?? 'brak danych'}`)
        }

        // Admina automat nie wyłącza (lustro `skipped_admin` w NEXUSIE) — to on cofa błędne odejście.
        const plan = planRosterSync(people, rows as CompassProfileRow[], {
            isProtected: (row) => row.role === 'admin' || isSuperAdmin(row.email),
        })
        const refusals = unconfirmedRefusals(plan, new URL(request.url))
        if (refusals.length > 0) {
            logger.error({ event: 'cron.nexus_roster.safety_refused', refusals, ...plan.stats })
            Sentry.captureMessage('nexus_roster_safety_refused', { level: 'error', extra: { refusals, ...plan.stats } })
            return NextResponse.json(
                { ok: false, stage: 'safety', refusals, ...plan.stats, written: 0 },
                { status: 500 },
            )
        }

        const stats: WriteStats = { written: 0, failed: 0, blocked_by_trigger: 0, skipped_concurrent: 0 }
        for (const change of plan.changes) {
            try {
                await applyChange(admin, change, stats)
            } catch (e) {
                stats.failed += 1
                logger.error({ event: 'cron.nexus_roster.change_failed', profileId: change.id, error: e })
                Sentry.captureException(e, { tags: { kind: 'cron_nexus_roster', stage: 'write' } })
            }
        }

        const ok = stats.failed === 0 && stats.blocked_by_trigger === 0
        const out = { ok, ...(ok ? {} : { stage: 'write' }), ...plan.stats, ...stats }
        if (!ok) {
            Sentry.captureMessage('nexus_roster_write_failed', { level: 'error', extra: out })
            return NextResponse.json(out, { status: 500 })
        }
        logger.info({ event: 'cron.nexus_roster.done', ...out })
        return NextResponse.json(out)
    }),
)
