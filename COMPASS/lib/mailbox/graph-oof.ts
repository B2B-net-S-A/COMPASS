// Phase 25 — Outlook Out-of-Office automation.
//
// When a leave request is approved we want the consultant's Outlook mailbox to
// auto-reply with a "Jestem na urlopie do DD-MM" message, mentioning who
// substitutes (if assigned). When the leave is cancelled or rejected after
// approval, we revert the auto-reply.
//
// Requires Application permission `MailboxSettings.ReadWrite` granted to the
// Compass Azure App (admin consent). Same client secret as Mail.Send /
// Calendars.ReadWrite.
//
// Soft-fail: every helper returns `{success: false, error}` on failure
// instead of throwing. Approval flow must NEVER be blocked by OOF problems —
// admin sees `graph_sync_error` flag in the queue and can retry manually.

import * as Sentry from '@sentry/nextjs'
import {
    extractGraphErrorInfo,
    getGraphClient,
    isRetryableGraphStatus,
} from '@/lib/graph/client'
import { isNoExchangeMailboxError } from '@/lib/graph/no-mailbox'
import { logger } from '@/lib/logger'

const MAX_ATTEMPTS = 3
const BASE_BACKOFF_MS = 1000
const TIMEZONE = 'Europe/Warsaw'

/**
 * Phase 25d marker — embedded as the first line of every OOF message body
 * Compass writes to Outlook. Lets us distinguish "Compass-managed OOF" from
 * "user-set OOF" on re-read, so we never overwrite somebody's own auto-reply.
 *
 * Versioned (v1) so a future format change can be detected if needed.
 */
const COMPASS_OOF_MARKER = '<!-- compass-managed-oof-v1 -->'

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function credsConfigured(): boolean {
    return Boolean(
        process.env.AZURE_TENANT_ID &&
            process.env.AZURE_CLIENT_ID &&
            process.env.AZURE_CLIENT_SECRET,
    )
}

/** Stamp a message with the Compass marker if not already present. */
function withCompassMarker(html: string): string {
    if (typeof html !== 'string') return html
    return html.includes(COMPASS_OOF_MARKER) ? html : `${COMPASS_OOF_MARKER}\n${html}`
}

function isCompassManaged(htmlMessage?: string | null): boolean {
    return typeof htmlMessage === 'string' && htmlMessage.includes(COMPASS_OOF_MARKER)
}

export interface SetOutOfOfficeInput {
    /** Mailbox owner — must be a real user in the tenant (UPN/email). */
    userEmail: string
    /** ISO date (YYYY-MM-DD), inclusive. Start of the leave. */
    startDate: string
    /** ISO date (YYYY-MM-DD), inclusive. End of the leave. */
    endDate: string
    /** HTML/text to reply to internal senders. */
    internalReply: string
    /** HTML/text to reply to external senders (`externalAudience='all'`). */
    externalReply: string
}

export type OofSkipReason =
    /** Azure/Graph credentials not configured (dev/local). */
    | 'no_credentials'
    /** Phase 25d — user already set their own OOF; we preserve it. */
    | 'user_custom'
    /**
     * Audyt 2026-09-22, INT-02 — skrzynka ma trwający (albo wcześniejszy,
     * jeszcze niezakończony) OOF COMPASS innego urlopu, a nowy urlop zaczyna się
     * dopiero po nim. Graph trzyma JEDEN harmonogram, więc nadpisanie odebrałoby
     * auto-reply bieżącemu urlopowi. Cron `oof-reconcile` ustawi nowy OOF, gdy
     * przyjdzie jego kolej (`applyDueCompassOof`).
     */
    | 'compass_active'
    /**
     * Audyt 2026-09-22, INT-03 — `disableOutOfOffice` z zakresem dat: bieżący
     * OOF nie należy do anulowanego urlopu (brak markera COMPASS albo inne okno),
     * więc go nie ruszamy.
     */
    | 'not_owned'
    /** `disableOutOfOffice` z zakresem dat: auto-reply jest już wyłączony. */
    | 'already_disabled'

export interface OutOfOfficeResult {
    success: boolean
    error?: string
    /** True when we skipped (e.g. credentials missing, user-managed OOF). Distinct from a real failure. */
    skipped?: boolean
    /** Set when skipped=true. Tells caller WHY we skipped so it can audit/persist. */
    skipReason?: OofSkipReason
}

/** Result of GET /mailboxSettings/automaticRepliesSetting (subset we care about). */
export interface CurrentOofState {
    status: 'disabled' | 'alwaysEnabled' | 'scheduled' | string
    scheduledStartDateTime?: { dateTime: string; timeZone: string } | null
    scheduledEndDateTime?: { dateTime: string; timeZone: string } | null
    internalReplyMessage?: string | null
    externalReplyMessage?: string | null
}

/**
 * Wynik odczytu OOF, który ODRÓŻNIA „wyłączony" od „nie wiadomo"
 * (audyt 2026-09-22, INT-04 / INT-08).
 *
 * Dawniej każda awaria (403, 429, timeout) zamieniała się w `null`, a `null`
 * znaczyło „nic nie ma, można nadpisać" — chwilowy błąd GET-a przy udanym
 * PATCH-u kasował własną odpowiedź użytkownika, a cron raportował sukces przy
 * 100% nieudanych odczytów.
 */
export type OofReadResult =
    | { ok: true; state: CurrentOofState }
    | {
          ok: false
          error: string
          statusCode?: number
          noCredentials?: boolean
          /** Konto bez skrzynki Exchange — stan, nie awaria (lib/graph/no-mailbox.ts). */
          noMailbox?: boolean
      }

/**
 * Odczyt bieżącego automaticRepliesSetting. Nigdy nie rzuca; błąd odczytu jest
 * jawnym `{ ok: false }`, a nie udawanym „brakiem OOF".
 *
 * No retry on purpose: the cron reads every HR mailbox sequentially, and the
 * per-request deadline in lib/graph/client.ts bounds a hung mailbox.
 */
export async function readCurrentOof(userEmail: string): Promise<OofReadResult> {
    if (!credsConfigured()) return { ok: false, error: 'no_credentials', noCredentials: true }

    let client
    try {
        client = await getGraphClient()
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'graph_client_setup_failed' }
    }

    try {
        const settings = await client
            .api(`/users/${encodeURIComponent(userEmail)}/mailboxSettings/automaticRepliesSetting`)
            .get()
        if (!settings || typeof settings !== 'object' || typeof (settings as { status?: unknown }).status !== 'string') {
            return { ok: false, error: 'invalid_oof_response' }
        }
        return { ok: true, state: settings as CurrentOofState }
    } catch (err) {
        const { statusCode } = extractGraphErrorInfo(err)
        const error = err instanceof Error ? err.message : String(err)
        if (isNoExchangeMailboxError(err)) {
            logger.info({ event: 'oof.graph.get_no_mailbox', userEmail })
            return { ok: false, error, statusCode, noMailbox: true }
        }
        logger.warn({
            event: 'oof.graph.get_failed',
            statusCode,
            userEmail,
            error,
        })
        return { ok: false, error, statusCode }
    }
}

/**
 * Read the user's current automaticRepliesSetting; null on any failure.
 *
 * @deprecated Zachowane dla zgodności wstecznej — `null` NIE rozróżnia „wyłączony"
 * od „błąd odczytu". Nowy kod używa `readCurrentOof`.
 */
export async function getCurrentOof(userEmail: string): Promise<CurrentOofState | null> {
    const read = await readCurrentOof(userEmail)
    return read.ok ? read.state : null
}

// ─── Okno harmonogramu OOF (daty w Warszawie) ───────────────────────────────

interface WallDateTime {
    /** YYYY-MM-DD w Europe/Warsaw. */
    date: string
}

function warsawDateOf(instant: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(instant)
}

/**
 * Graph zwraca scheduled*DateTime albo w UTC (`timeZone: 'UTC'`), albo w strefie,
 * którą zapisaliśmy (Warszawa). Dla UTC przeliczamy chwilę na datę warszawską;
 * dla innej strefy bierzemy datę ze ściany wprost — COMPASS zapisuje zawsze
 * `Europe/Warsaw`, więc to ta sama oś.
 */
function toWarsawWall(dt: { dateTime: string; timeZone: string } | null | undefined): WallDateTime | null {
    if (!dt?.dateTime) return null
    if ((dt.timeZone ?? '').toUpperCase() === 'UTC') {
        const instant = new Date(`${dt.dateTime.replace(/Z$/, '')}Z`)
        if (Number.isNaN(instant.getTime())) return null
        return { date: warsawDateOf(instant) }
    }
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(dt.dateTime)
    return m ? { date: m[1] } : null
}

/** Okno OOF COMPASS: [startDate, endExclusiveDate) w datach warszawskich. */
function compassScheduledWindow(
    current: CurrentOofState,
): { startDate: string; endExclusiveDate: string } | null {
    if (current.status !== 'scheduled') return null
    const start = toWarsawWall(current.scheduledStartDateTime)
    const end = toWarsawWall(current.scheduledEndDateTime)
    if (!start || !end) return null
    return { startDate: start.date, endExclusiveDate: end.date }
}

function isCompassManagedState(current: CurrentOofState): boolean {
    return isCompassManaged(current.internalReplyMessage) || isCompassManaged(current.externalReplyMessage)
}

/**
 * INT-03 — czy bieżący OOF należy do urlopu o podanym zakresie: marker COMPASS
 * i okno harmonogramu równe [startDate, endDate+1). Pure — eksport do testów.
 */
export function compassOofMatchesLeave(
    current: CurrentOofState | null,
    startDate: string,
    endDate: string,
): boolean {
    if (!current || current.status === 'disabled') return false
    if (!isCompassManagedState(current)) return false
    const window = compassScheduledWindow(current)
    if (!window) return false
    return window.startDate === startDate && window.endExclusiveDate === addDays(endDate, 1)
}

/**
 * INT-02 — czy bieżący OOF COMPASS innego urlopu blokuje ustawienie nowego.
 *
 * Blokuje, gdy harmonogram COMPASS jeszcze się nie skończył (trwa albo dopiero
 * nadejdzie), a nowy urlop zaczyna się w dniu jego końca lub później — nadpisanie
 * odebrałoby auto-reply wcześniejszemu urlopowi. Nowy urlop, który zaczyna się
 * WCZEŚNIEJ niż koniec bieżącego okna (np. poprawka tego samego urlopu albo urlop
 * przed zaplanowanym), nadpisuje jak dawniej — wcześniejszy ma pierwszeństwo,
 * a późniejszy dostanie OOF od crona, gdy nadejdzie jego kolej. Pure.
 */
export function compassOofBlocksNewLeave(
    current: CurrentOofState | null,
    newStartDate: string,
    now: Date = new Date(),
): boolean {
    if (!current || current.status === 'disabled') return false
    if (!isCompassManagedState(current)) return false
    const window = compassScheduledWindow(current)
    if (!window) return false
    const today = warsawDateOf(now)
    // Koniec wyłączny: okno kończące się dziś o północy już nie trwa.
    if (window.endExclusiveDate <= today) return false
    return newStartDate >= window.endExclusiveDate
}

/**
 * Phase 25d — should we preserve the user's existing OOF instead of overwriting?
 *
 * Rules:
 *   - status='disabled' → safe to overwrite (no existing OOF).
 *   - Either reply body carries the Compass marker → it's our own OOF from a
 *     previous leave; overwriting is fine.
 *   - status='alwaysEnabled' without marker → user set permanent OOF → preserve.
 *   - status='scheduled' without marker → check scheduledEndDateTime:
 *       end has already passed (vs `now`) → expired user schedule; safe to overwrite.
 *       end is in the future (or unknown) → user has active/upcoming OOF → preserve.
 *
 * Pure function — exported for unit testing.
 */
export function shouldPreserveUserOof(
    current: CurrentOofState | null,
    now: Date = new Date(),
): boolean {
    if (!current) return false // Graph read failed — keep legacy behavior (overwrite).
    if (current.status === 'disabled') return false

    const internalManaged = isCompassManaged(current.internalReplyMessage)
    const externalManaged = isCompassManaged(current.externalReplyMessage)
    if (internalManaged || externalManaged) return false

    if (current.status === 'alwaysEnabled') return true

    if (current.status === 'scheduled') {
        const endIso = current.scheduledEndDateTime?.dateTime
        if (!endIso) return true // active scheduled with unknown end — be conservative.
        const tz = current.scheduledEndDateTime?.timeZone
        // Graph returns ISO without offset; treat tz='UTC' as UTC, anything else
        // (e.g., 'Europe/Warsaw') as a wall-clock that's already past if its
        // UTC interpretation is past — that's conservative but adequate for "expired" check.
        const end = new Date(tz === 'UTC' ? `${endIso}Z` : endIso)
        if (Number.isNaN(end.getTime())) return true
        return end.getTime() > now.getTime()
    }

    // Unknown status value — be conservative, preserve.
    return true
}

/**
 * Schedule an Out-of-Office auto-reply in the user's Outlook mailbox for the
 * date range of the approved leave. Inclusive endDate is bumped to the next
 * day at 00:00 (Graph treats `scheduledEndDateTime` as exclusive midnight).
 */
export async function setOutOfOffice(
    input: SetOutOfOfficeInput,
): Promise<OutOfOfficeResult> {
    if (!credsConfigured()) {
        logger.info({ event: 'oof.graph.skip_no_credentials', userEmail: input.userEmail })
        return { success: true, skipped: true, skipReason: 'no_credentials' }
    }

    // Phase 25d — preserve user-managed OOF. Read current state first; if user
    // has their own auto-reply active (and it's not a previous Compass-managed
    // OOF), skip the PATCH.
    //
    // Audyt 2026-09-22, INT-04: błąd odczytu to NIE „brak OOF". Dawniej wracaliśmy
    // do bezwarunkowego nadpisania, więc chwilowy 429/timeout GET-a przy udanym
    // PATCH-u kasował własną odpowiedź użytkownika. Teraz żadnego PATCH-a —
    // wołający zapisuje `graph_sync_error`, a admin może ponowić z kolejki.
    const read = await readCurrentOof(input.userEmail)
    if (!read.ok) {
        logger.warn({
            event: 'oof.graph.set_aborted_read_failed',
            userEmail: input.userEmail,
            statusCode: read.statusCode,
            error: read.error,
        })
        return { success: false, error: `oof_read_failed: ${read.error}` }
    }
    const current = read.state
    if (shouldPreserveUserOof(current)) {
        logger.info({
            event: 'oof.graph.skip_user_custom',
            userEmail: input.userEmail,
            currentStatus: current?.status,
            scheduledEnd: current?.scheduledEndDateTime?.dateTime ?? null,
        })
        return { success: true, skipped: true, skipReason: 'user_custom' }
    }

    // INT-02 — nie odbieraj auto-reply urlopowi, który trwa (albo nadejdzie
    // wcześniej) na rzecz późniejszego. Ten sam urlop (identyczne okno) nie blokuje.
    if (
        !compassOofMatchesLeave(current, input.startDate, input.endDate) &&
        compassOofBlocksNewLeave(current, input.startDate)
    ) {
        logger.info({
            event: 'oof.graph.skip_compass_active',
            userEmail: input.userEmail,
            newStart: input.startDate,
            currentStart: current.scheduledStartDateTime?.dateTime ?? null,
            currentEnd: current.scheduledEndDateTime?.dateTime ?? null,
        })
        return { success: true, skipped: true, skipReason: 'compass_active' }
    }

    const endExclusive = addDays(input.endDate, 1)

    const body = {
        automaticRepliesSetting: {
            status: 'scheduled',
            externalAudience: 'all',
            scheduledStartDateTime: {
                dateTime: `${input.startDate}T00:00:00`,
                timeZone: TIMEZONE,
            },
            scheduledEndDateTime: {
                dateTime: `${endExclusive}T00:00:00`,
                timeZone: TIMEZONE,
            },
            internalReplyMessage: withCompassMarker(input.internalReply),
            externalReplyMessage: withCompassMarker(input.externalReply),
        },
    }

    let client
    try {
        client = await getGraphClient()
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'graph_client_setup_failed',
        }
    }

    let lastErr: unknown = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await client
                .api(`/users/${encodeURIComponent(input.userEmail)}/mailboxSettings`)
                .patch(body)
            return { success: true }
        } catch (err) {
            lastErr = err
            const { statusCode, retryAfterMs } = extractGraphErrorInfo(err)

            const retryable = isRetryableGraphStatus(statusCode)
            const moreAttempts = attempt < MAX_ATTEMPTS
            if (!retryable || !moreAttempts) break

            const backoff = retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt - 1)
            logger.warn({
                event: 'oof.graph.retry',
                attempt,
                statusCode,
                backoffMs: backoff,
                userEmail: input.userEmail,
            })
            await sleep(backoff)
        }
    }

    const message = lastErr instanceof Error ? lastErr.message : 'unknown_graph_error'
    logger.error({
        event: 'oof.graph.set_failed',
        error: message,
        userEmail: input.userEmail,
    })
    Sentry.captureMessage('oof_set_failed', {
        level: 'warning',
        tags: { kind: 'graph_oof_set' },
        extra: { userEmail: input.userEmail, error: message },
    })
    return { success: false, error: message }
}

export interface DisableOutOfOfficeInput {
    userEmail: string
    /**
     * Audyt 2026-09-22, INT-03 — zakres anulowanego urlopu (YYYY-MM-DD, włącznie).
     * Podany → wyłączamy WYŁĄCZNIE OOF z markerem COMPASS i dokładnie tym oknem;
     * cudzy urlop albo własna odpowiedź użytkownika zostają (`skipped: not_owned`).
     * Pominięty → dawne bezwarunkowe wyłączenie (zgodność wsteczna).
     */
    startDate?: string
    endDate?: string
}

/**
 * Disable the user's auto-reply. Used when a previously-approved leave is
 * cancelled or rejected. Idempotent — Graph accepts status=disabled even when
 * no schedule was active.
 */
export async function disableOutOfOffice(
    input: DisableOutOfOfficeInput,
): Promise<OutOfOfficeResult> {
    if (!credsConfigured()) {
        return { success: true, skipped: true, skipReason: 'no_credentials' }
    }

    if (input.startDate && input.endDate) {
        const read = await readCurrentOof(input.userEmail)
        if (!read.ok) {
            // Nie wiemy, czyj OOF tam jest — nie strzelamy na ślepo (INT-04).
            return { success: false, error: `oof_read_failed: ${read.error}` }
        }
        if (read.state.status === 'disabled') {
            return { success: true, skipped: true, skipReason: 'already_disabled' }
        }
        if (!compassOofMatchesLeave(read.state, input.startDate, input.endDate)) {
            logger.info({
                event: 'oof.graph.disable_skip_not_owned',
                userEmail: input.userEmail,
                leaveStart: input.startDate,
                leaveEnd: input.endDate,
                currentStatus: read.state.status,
            })
            return { success: true, skipped: true, skipReason: 'not_owned' }
        }
    }

    let client
    try {
        client = await getGraphClient()
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'graph_client_setup_failed',
        }
    }

    const body = {
        automaticRepliesSetting: {
            status: 'disabled',
        },
    }

    let lastErr: unknown = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            await client
                .api(`/users/${encodeURIComponent(input.userEmail)}/mailboxSettings`)
                .patch(body)
            return { success: true }
        } catch (err) {
            lastErr = err
            const { statusCode, retryAfterMs } = extractGraphErrorInfo(err)
            const retryable = isRetryableGraphStatus(statusCode)
            const moreAttempts = attempt < MAX_ATTEMPTS
            if (!retryable || !moreAttempts) break

            const backoff = retryAfterMs ?? BASE_BACKOFF_MS * Math.pow(2, attempt - 1)
            await sleep(backoff)
        }
    }

    const message = lastErr instanceof Error ? lastErr.message : 'unknown_graph_error'
    logger.error({
        event: 'oof.graph.disable_failed',
        error: message,
        userEmail: input.userEmail,
    })
    Sentry.captureMessage('oof_disable_failed', {
        level: 'warning',
        tags: { kind: 'graph_oof_disable' },
        extra: { userEmail: input.userEmail, error: message },
    })
    return { success: false, error: message }
}

// ─── Helpers ────────────────────────────────────────────────────────────────
// Phase 53: the default message templates (buildDefaultOofMessages) moved to
// ./oof-template.ts — a pure module the form preview action can also import.

function addDays(isoDate: string, days: number): string {
    const d = new Date(`${isoDate}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}
