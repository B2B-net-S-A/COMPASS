import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { withCronAuth } from '@/lib/api/with-auth'
import { logAudit } from '@/lib/actions/audit'
import { logger } from '@/lib/logger'
import {
    sendLegalMonitorDigest,
    sendLegalMonitorDue,
    sendLegalMonitorOps,
    sendLegalMonitorRed,
} from '@/lib/email'
import { computeMonitorHealth } from '@/lib/legal-monitor/health'
import {
    digestWindowStart,
    isDigestDay,
    OPS_RECIPIENTS_KEY,
    RED_RECIPIENTS_KEY,
    selectOverdueFollowUps,
    selectRedAlerts,
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
 *
 * Coolify cron: `0 8 * * *` — po przebiegu pipeline'u (~7:30 czasu warszawskiego).
 *
 * Ślad w bazie: `LEGAL_MONITOR_ALERTS_RUN` (start/done). `start` bez `done` =
 * przebieg ubity w locie; brak `start` = cron w ogóle nie odpalił.
 */
export const GET = withCronAuth(async (_request, { admin }) => {
    const now = new Date()
    const errors: string[] = []
    const stats = { red: 0, silent: 0, sourceFailures: 0, due: 0, digest: 0 }

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
        if (health.state === 'stale' || health.state === 'never') {
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
            // Pusty tydzień + pusta skrzynka = nie ma o czym pisać.
            if (counts.total > 0 || counts.pending > 0) {
                try {
                    await dispatchLegalMonitorAlert(admin, redRecipients, {
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
