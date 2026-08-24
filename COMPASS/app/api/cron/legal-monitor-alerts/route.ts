import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { withCronAuth } from '@/lib/api/with-auth'
import { logAudit } from '@/lib/actions/audit'
import { logger } from '@/lib/logger'
import {
    sendLegalMonitorDailyDigest,
    sendLegalMonitorDigest,
    sendLegalMonitorDue,
    sendLegalMonitorOps,
    sendLegalMonitorRed,
} from '@/lib/email'
import { computeMonitorHealth } from '@/lib/legal-monitor/health'
import {
    DAILY_DIGEST_LAST_SENT_KEY,
    DAILY_DIGEST_RECIPIENTS_KEY,
    dailyDigestWindowStart,
    digestWindowStart,
    isDigestDay,
    OPS_RECIPIENTS_KEY,
    RED_RECIPIENTS_KEY,
    selectOverdueFollowUps,
    selectRedAlerts,
    shouldSendDailyDigest,
    sourcesCrossingFailureThreshold,
    SOURCE_FAILURE_STREAK_THRESHOLD,
} from '@/lib/legal-monitor/alert-selection'
import {
    allFinanseAndAdmins,
    dispatchLegalMonitorAlert,
    LEGAL_MONITOR_URL,
    resolveRecipients,
} from '@/lib/legal-monitor/alerts'
import {
    LEGAL_SOURCE_SHORT_PL,
    type LegalMonitorItemRow,
    type LegalMonitorRunRow,
} from '@/lib/types/legal-monitor'
import type { PublicHolidayDate } from '@/lib/hr/working-days'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

/**
 * Phase 50 — dzienny alert monitoringu prawnego.
 *
 * Phase 48 dał skrzynkę, ale nic z niej nie wychodziło: alarm „monitoring nie
 * odpowiada" widać było wyłącznie po wejściu na zakładkę, czyli dokładnie wtedy,
 * kiedy nie był potrzebny. Ten cron zamienia moduł z archiwum w coś, co samo się
 * odzywa. Cztery rzeczy w jednym przebiegu (+ digest w poniedziałki), żeby po
 * stronie Coolify było JEDNO zadanie do dodania, nie pięć:
 *
 *  1. czerwony wpis — nowy, nieprzejrzany, jeszcze niezgłoszony
 *  2. cisza monitoringu — heartbeat starszy niż dzień roboczy (ta sama czysta
 *     `computeMonitorHealth`, która liczy banner)
 *  3. seria awarii źródła — dopiero po N przebiegach z rzędu; pojedynczy `partial`
 *     zdarza się rutynowo i alert o każdym wyrobiłby odruch ignorowania
 *  4. zaległa reakcja — wpis „do reakcji" po terminie
 *  5. poniedziałek: tygodniowy digest (żółte i zielone nie zasługują na alert
 *     per sztuka przy 0-4 wpisach dziennie)
 *  6. dzienny digest emailowy dla jawnie wpisanych osób (Phase 54) — opt-in,
 *     kadencja tygodniowa zostaje domyślna dla reszty
 *
 * Coolify cron: `0 8 * * *` — po przebiegu pipeline'u (~7:30 czasu warszawskiego).
 *
 * Ślad w bazie: `LEGAL_MONITOR_ALERTS_RUN` (start/done). `start` bez `done` =
 * przebieg ubity w locie; brak `start` = cron w ogóle nie odpalił.
 */
export const GET = withCronAuth(async (_request, { admin }) => {
    const now = new Date()
    const errors: string[] = []
    const stats = { red: 0, silent: 0, sourceFailures: 0, due: 0, digest: 0, dailyDigest: 0 }

    await logAudit(null, 'LEGAL_MONITOR_ALERTS_RUN', { phase: 'start' })

    try {
        const [itemsRes, runsRes, holidaysRes] = await Promise.all([
            admin
                .from('legal_monitor_items')
                .select(
                    'id, title, severity, status, source_label, why_it_matters, url, created_at, alerted_at, due_date, reminded_at, assigned_to',
                )
                .order('created_at', { ascending: false })
                .limit(1000),
            admin
                .from('legal_monitor_runs')
                .select('id, run_at, window_from, status, items_found, sources_checked, notes')
                .order('run_at', { ascending: false })
                .limit(20),
            admin
                .from('public_holidays')
                .select('date, name_pl')
                .gte('date', new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)),
        ])
        if (itemsRes.error) throw new Error(`items: ${itemsRes.error.message}`)
        if (runsRes.error) throw new Error(`runs: ${runsRes.error.message}`)
        // Świąt NIE traktujemy jak reszty: gdy zapytanie padnie, pusta lista kazałaby
        // uznać święto za dzień roboczy i wysłać fałszywe „monitoring nie odpowiada".
        // Rzucenie wyjątkiem byłoby jednak gorsze — zabrałoby też alerty o czerwonych
        // wpisach, czyli główną funkcję. Więc: pomijamy sam test ciszy, reszta leci.
        const holidaysAvailable = !holidaysRes.error
        if (holidaysRes.error) {
            errors.push(`święta niedostępne, pominięto test ciszy: ${holidaysRes.error.message}`)
        }

        const items = (itemsRes.data ?? []) as unknown as Array<
            Pick<
                LegalMonitorItemRow,
                'id' | 'title' | 'severity' | 'status' | 'source_label' | 'why_it_matters' | 'url' | 'created_at'
            > & {
                alerted_at: string | null
                due_date: string | null
                reminded_at: string | null
                assigned_to: string | null
            }
        >
        const runs = (runsRes.data ?? []) as unknown as LegalMonitorRunRow[]
        const holidays = (holidaysRes.data ?? []) as PublicHolidayDate[]

        const fallback = await allFinanseAndAdmins(admin)
        const redRecipients = await resolveRecipients(admin, RED_RECIPIENTS_KEY, fallback)
        const opsRecipients = await resolveRecipients(admin, OPS_RECIPIENTS_KEY, fallback)
        // Phase 54: dzienny digest jest opt-in — pusty fallback, żeby bez jawnego
        // wpisu w `system_settings` sekcja 6 była no-opem dla wszystkich.
        const dailyDigestRecipients = await resolveRecipients(admin, DAILY_DIGEST_RECIPIENTS_KEY, [])
        const dailyDigestSet = new Set(dailyDigestRecipients)

        // ── 1. Czerwone wpisy ────────────────────────────────────────────────
        for (const item of selectRedAlerts(items)) {
            try {
                await dispatchLegalMonitorAlert(admin, redRecipients, {
                    type: 'legal_monitor_red',
                    titlePl: 'Monitoring prawny: pozycja może wymagać decyzji',
                    titleEn: 'Legal monitor: item may require a decision',
                    bodyPl: item.title,
                    bodyEn: item.title,
                    actionUrl: LEGAL_MONITOR_URL,
                    pushTag: `legal-monitor-red-${item.id}`,
                    emailFn: (email, name) =>
                        sendLegalMonitorRed(
                            email,
                            name,
                            item.title,
                            item.source_label,
                            item.why_it_matters,
                            item.url,
                        ),
                })
                // Dedup: stempluj dopiero po wysyłce. Błąd stempla = ryzyko
                // duplikatu jutro, więc ląduje w errors, nie znika po cichu.
                const { error } = await admin
                    .from('legal_monitor_items')
                    .update({ alerted_at: new Date().toISOString() })
                    .eq('id', item.id)
                if (error) errors.push(`stempel alerted_at ${item.id}: ${error.message}`)
                stats.red += 1
            } catch (e) {
                errors.push(`alert red ${item.id}: ${e instanceof Error ? e.message : String(e)}`)
            }
        }

        // ── 2. Cisza monitoringu ─────────────────────────────────────────────
        // Dedup po `run_at` ostatniego przebiegu: dopóki nie przyjdzie nowy,
        // alertujemy o tej samej ciszy tylko raz.
        const health = computeMonitorHealth({ lastRun: runs[0] ?? null, now, holidays })
        if (holidaysAvailable && (health.state === 'stale' || health.state === 'never')) {
            const marker = health.lastRunAt ?? 'never'
            const { data: settingRow } = await admin
                .from('system_settings')
                .select('value')
                .eq('key', 'legal_monitor_silence_alerted_for')
                .maybeSingle()
            const alreadyAlerted = (settingRow as { value?: string } | null)?.value === marker
            if (!alreadyAlerted) {
                const detail =
                    health.state === 'never'
                        ? 'Monitoring prawny nie zaraportował jeszcze żadnego przebiegu.'
                        : `Monitoring prawny nie odpowiada — ostatni przebieg ${health.lastRunAt}, od tego czasu dni roboczych bez przebiegu: ${health.missedWorkingDays}.`
                try {
                    await dispatchLegalMonitorAlert(admin, opsRecipients, {
                        type: 'legal_monitor_silent',
                        titlePl: 'Monitoring prawny nie odpowiada',
                        titleEn: 'Legal monitor is silent',
                        bodyPl: detail,
                        bodyEn: detail,
                        actionUrl: LEGAL_MONITOR_URL,
                        pushTag: 'legal-monitor-silent',
                        emailFn: (email, name) =>
                            sendLegalMonitorOps(email, name, 'brak przebiegu', detail),
                    })
                    await admin
                        .from('system_settings')
                        .upsert(
                            { key: 'legal_monitor_silence_alerted_for', value: marker },
                            { onConflict: 'key' },
                        )
                    stats.silent += 1
                } catch (e) {
                    errors.push(`alert ciszy: ${e instanceof Error ? e.message : String(e)}`)
                }
            }
        }

        // ── 3. Seria awarii źródła ───────────────────────────────────────────
        for (const source of sourcesCrossingFailureThreshold(runs)) {
            const label = LEGAL_SOURCE_SHORT_PL[source] ?? source
            const detail = `Źródło ${label} nie odpowiedziało w ${SOURCE_FAILURE_STREAK_THRESHOLD} kolejnych przebiegach monitoringu.`
            try {
                await dispatchLegalMonitorAlert(admin, opsRecipients, {
                    type: 'legal_monitor_silent',
                    titlePl: `Monitoring prawny: ${label} niedostępne`,
                    titleEn: `Legal monitor: ${label} unavailable`,
                    bodyPl: detail,
                    bodyEn: detail,
                    actionUrl: LEGAL_MONITOR_URL,
                    pushTag: `legal-monitor-source-${source}`,
                    emailFn: (email, name) =>
                        sendLegalMonitorOps(email, name, `${label} niedostępne`, detail),
                })
                stats.sourceFailures += 1
            } catch (e) {
                errors.push(`alert źródła ${source}: ${e instanceof Error ? e.message : String(e)}`)
            }
        }

        // ── 4. Zaległe reakcje ───────────────────────────────────────────────
        for (const item of selectOverdueFollowUps(items, now)) {
            const recipients = item.assigned_to ? [item.assigned_to] : redRecipients
            try {
                await dispatchLegalMonitorAlert(admin, recipients, {
                    type: 'legal_monitor_due',
                    titlePl: 'Zaległa reakcja na wpis monitoringu',
                    titleEn: 'Overdue legal monitor follow-up',
                    bodyPl: `${item.title} — termin ${item.due_date}`,
                    bodyEn: `${item.title} — due ${item.due_date}`,
                    actionUrl: LEGAL_MONITOR_URL,
                    pushTag: `legal-monitor-due-${item.id}`,
                    emailFn: (email, name) =>
                        sendLegalMonitorDue(email, name, item.title, item.due_date as string),
                })
                const { error } = await admin
                    .from('legal_monitor_items')
                    .update({ reminded_at: new Date().toISOString() })
                    .eq('id', item.id)
                if (error) errors.push(`stempel reminded_at ${item.id}: ${error.message}`)
                stats.due += 1
            } catch (e) {
                errors.push(`przypomnienie ${item.id}: ${e instanceof Error ? e.message : String(e)}`)
            }
        }

        // ── 5. Digest (poniedziałki) ─────────────────────────────────────────
        if (isDigestDay(now)) {
            const from = digestWindowStart(now)
            const fresh = items.filter((i) => i.created_at.slice(0, 10) >= from)
            const counts = {
                total: fresh.length,
                red: fresh.filter((i) => i.severity === 'red').length,
                yellow: fresh.filter((i) => i.severity === 'yellow').length,
                green: fresh.filter((i) => i.severity === 'green').length,
                pending: items.filter((i) => i.status === 'new').length,
            }
            // Odbiorcy dziennego digestu nie dostają tygodniowego — widzieli już
            // każdy dzień z osobna, drugi mail w poniedziałek byłby duplikatem.
            const weeklyRecipients = redRecipients.filter((id) => !dailyDigestSet.has(id))
            // Pusty tydzień + pusta skrzynka = nie ma o czym pisać.
            if (weeklyRecipients.length > 0 && (counts.total > 0 || counts.pending > 0)) {
                try {
                    await dispatchLegalMonitorAlert(admin, weeklyRecipients, {
                        type: 'legal_monitor_digest',
                        titlePl: `Monitoring prawny — podsumowanie tygodnia (${counts.total})`,
                        titleEn: `Legal monitor — weekly summary (${counts.total})`,
                        bodyPl: `Nowych pozycji: ${counts.total}. Nieprzejrzanych w skrzynce: ${counts.pending}.`,
                        bodyEn: `New items: ${counts.total}. Pending review: ${counts.pending}.`,
                        actionUrl: LEGAL_MONITOR_URL,
                        pushTag: 'legal-monitor-digest',
                        emailFn: (email, name) =>
                            sendLegalMonitorDigest(
                                email,
                                name,
                                from,
                                counts,
                                fresh.slice(0, 10).map((i) => i.title),
                            ),
                    })
                    stats.digest += 1
                } catch (e) {
                    errors.push(`digest: ${e instanceof Error ? e.message : String(e)}`)
                }
            }
        }

        // ── 6. Dzienny digest (opt-in per osoba, Phase 54) ───────────────────
        // Wyłącznie mailem — o ten kanał chodziło; dzwonek i push zostają dla
        // alertów, codzienny digest by je zaszumił. Okno = od stempla ostatniej
        // wysyłki, więc nic nie ginie i nic się nie powtarza; cichy dzień (zero
        // nowych pozycji — pipeline chodzi pn–pt) = brak maila, nie „pusty mail".
        if (dailyDigestRecipients.length > 0) {
            const { data: stampRow } = await admin
                .from('system_settings')
                .select('value')
                .eq('key', DAILY_DIGEST_LAST_SENT_KEY)
                .maybeSingle()
            const lastSentAt = (stampRow as { value?: string } | null)?.value ?? null
            if (shouldSendDailyDigest(lastSentAt, now)) {
                const windowStart = Date.parse(dailyDigestWindowStart(lastSentAt, now))
                const fresh = items.filter((i) => Date.parse(i.created_at) > windowStart)
                const counts = {
                    total: fresh.length,
                    red: fresh.filter((i) => i.severity === 'red').length,
                    yellow: fresh.filter((i) => i.severity === 'yellow').length,
                    green: fresh.filter((i) => i.severity === 'green').length,
                    pending: items.filter((i) => i.status === 'new').length,
                }
                if (counts.total > 0) {
                    // Czerwone przodem — po dłuższej przerwie okno może mieć >10
                    // pozycji, a limit tytułów nie ma prawa uciąć akurat czerwonych.
                    // Sort stabilny, więc wewnątrz koloru zostaje najnowsze-pierwsze.
                    const severityOrder: Record<string, number> = { red: 0, yellow: 1, green: 2 }
                    const titles = fresh
                        .slice()
                        .sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3))
                        .slice(0, 10)
                        .map((i) => i.title)
                    const { data: recipientProfiles } = await admin
                        .from('profiles')
                        .select('id, email, full_name')
                        .in('id', dailyDigestRecipients)
                    let sent = 0
                    let attempted = 0
                    for (const profile of (recipientProfiles ?? []) as Array<{
                        id: string
                        email: string | null
                        full_name: string | null
                    }>) {
                        if (!profile.email) continue
                        attempted += 1
                        try {
                            const result = await sendLegalMonitorDailyDigest(
                                profile.email,
                                profile.full_name ?? 'Zespół',
                                counts,
                                titles,
                            )
                            if (result.success) sent += 1
                            else errors.push(`dzienny digest ${profile.id}: wysyłka nieudana`)
                        } catch (e) {
                            errors.push(
                                `dzienny digest ${profile.id}: ${e instanceof Error ? e.message : String(e)}`,
                            )
                        }
                    }
                    // Skonfigurowani odbiorcy bez profilu/emaila = digest po cichu
                    // nie wychodzi w ogóle — to ma być widoczne w audycie, nie nieme.
                    if (attempted === 0) {
                        errors.push('dzienny digest: żaden skonfigurowany odbiorca nie ma profilu z emailem')
                    }
                    // Stempel dopiero po ≥1 udanej wysyłce — totalna awaria kanału
                    // ma się ponowić następnym przebiegiem, nie zniknąć po cichu.
                    if (sent > 0) {
                        const { error } = await admin
                            .from('system_settings')
                            .upsert(
                                { key: DAILY_DIGEST_LAST_SENT_KEY, value: now.toISOString() },
                                { onConflict: 'key' },
                            )
                        if (error) errors.push(`stempel dziennego digestu: ${error.message}`)
                        stats.dailyDigest = sent
                    }
                }
            }
        }

        await logAudit(null, 'LEGAL_MONITOR_ALERTS_RUN', { phase: 'done', ...stats, errors })
        return NextResponse.json({ ok: true, ...stats, errors })
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        logger.error({ event: 'legal_monitor.alerts.failed', error: message })
        Sentry.captureException(e)
        await logAudit(null, 'LEGAL_MONITOR_ALERTS_RUN', { phase: 'done', failed: true, error: message })
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
})
