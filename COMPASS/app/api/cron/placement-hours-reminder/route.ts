// Phase 28 — Placement 168h reminder.
//
// Schedule (Coolify): 0 8 * * *  (daily 08:00 UTC)
// Auth: Authorization: Bearer $CRON_SECRET
//
// Side-effect: for placements that are 'started', past their projected 168h date and not yet
// confirmed (no bonuses generated), nudge the importer (or, if absent, all managers/admins)
// with an in-app notification + web push to confirm 168h.
// Response: { ok, due, notified, skipped }
//
// Audyt 2026-08: zapytanie miało dolną granicę `bonus_eligible_date >= dziś - 30 dni`.
// Placement, którego nikt nie potwierdził przez miesiąc, wypadał z przypomnień NA ZAWSZE,
// a przypomnienie jest jedynym sygnałem, że premie DL i rekrutera (1-2 tys. zł) czekają na
// potwierdzenie 168h — nic innego się nie upomni. Na prodzie tak wisiał 1 z 1 placementów
// w tym stanie i cron nie wysłał ani jednego powiadomienia (0 wpisów `placement_reminder`).
// Horyzont zniknął; zamiast niego jest kadencja tygodniowa per odbiorca, więc stary
// placement przypomina o sobie dalej, ale nie codziennie.

import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'
import { sendPushToUserId } from '@/lib/push/dispatch'
import { excludeExited } from '@/lib/hr/employment-window'
import {
    DEFAULT_REMINDER_CADENCE_DAYS,
    loadLastReminderSentAt,
    pickDueRecipients,
} from '@/lib/notifications/reminder-cadence'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
// UWAGA: `maxDuration` jest tu MARTWE. Next 14.2 czyta ten eksport przy buildzie i
// tłumaczy go na limit funkcji serverless (Vercel/Lambda); w kontenerze na Coolify nikt
// go nie egzekwuje, więc nie jest to działająca ochrona przed zawieszonym przebiegiem.
// Zostaje jako deklaracja intencji na wypadek zmiany hostingu — realnym limitem jest
// timeout per żądanie na proxy (Traefik/Cloudflare) i limity samych wywołań.
export const maxDuration = 120

interface DuePlacement {
    id: string
    consultant_name: string
    client_name: string
    imported_by: string | null
    bonus_eligible_date: string
}

export const GET = withCronAuth(withCronHeartbeat('PLACEMENT_HOURS_REMINDER_RUN', async (_request, { admin }) => {
    const today = new Date()
    const todayIso = today.toISOString().slice(0, 10)

    try {
        const { data, error } = await admin
            .from('placements')
            .select('id, consultant_name, client_name, imported_by, bonus_eligible_date')
            .eq('status', 'started')
            .is('dl_bonus_id', null)
            .lte('bonus_eligible_date', todayIso)
        if (error) throw new Error(error.message)
        const due = (data ?? []) as DuePlacement[]
        if (due.length === 0) return NextResponse.json({ ok: true, due: 0, notified: 0, skipped: 0 })

        // Resolve fallback recipients (managers + admins) only if some placement lacks an importer.
        let fallback: string[] = []
        if (due.some((p) => !p.imported_by)) {
            // Bez filtra archiwum przypomnienie celowałoby też w osoby, które
            // odeszły — archiwizacja nie zmienia roli (reguła „tu i teraz", Phase 43).
            const { data: mgrs } = await excludeExited(
                admin.from('profiles').select('id').in('role', ['admin', 'manager']),
            )
            fallback = ((mgrs ?? []) as Array<{ id: string }>).map((m) => m.id)
        }

        // Aggregate per recipient: count + one sample consultant.
        const perUser = new Map<string, { count: number; sample: string }>()
        for (const p of due) {
            const targets = p.imported_by ? [p.imported_by] : fallback
            for (const uid of targets) {
                const cur = perUser.get(uid) ?? { count: 0, sample: `${p.consultant_name} (${p.client_name})` }
                cur.count += 1
                perUser.set(uid, cur)
            }
        }

        // Kadencja tygodniowa per odbiorca — dziennikiem jest sama tabela
        // `notifications`, którą ten cron i tak zapisuje.
        const candidates = Array.from(perUser.keys())
        const lastSent = await loadLastReminderSentAt(
            admin,
            'placement_reminder',
            candidates,
            DEFAULT_REMINDER_CADENCE_DAYS,
        )
        const dueRecipients = new Set(pickDueRecipients(candidates, lastSent, new Date()))
        const skipped = candidates.length - dueRecipients.size

        let notified = 0
        const errors: string[] = []
        for (const [uid, info] of Array.from(perUser.entries())) {
            if (!dueRecipients.has(uid)) continue
            const bodyPl =
                info.count === 1
                    ? `${info.sample} prawdopodobnie przepracował 168h — potwierdź, aby naliczyć premie DL i rekrutera.`
                    : `${info.count} placementów osiągnęło prognozowane 168h — potwierdź, aby naliczyć premie.`
            const bodyEn =
                info.count === 1
                    ? `${info.sample} likely reached 168h — confirm to generate the DL and recruiter bonuses.`
                    : `${info.count} placements reached the projected 168h — confirm to generate bonuses.`

            // Nieudany insert nie może liczyć się jako wysłane powiadomienie —
            // dzwonek jest tu jedynym trwałym kanałem (push bywa bez subskrypcji)
            // i zarazem dziennikiem, z którego liczy się kadencja.
            const { error: insErr } = await admin.from('notifications').insert({
                user_id: uid,
                type: 'placement_reminder',
                title_pl: 'Potwierdź 168h placementu',
                title_en: 'Confirm placement 168h',
                body_pl: bodyPl,
                body_en: bodyEn,
                action_url: '/internal/admin?tab=placements',
                priority: 'normal',
            })
            if (insErr) {
                errors.push(`${uid}: ${insErr.message}`)
                continue
            }
            await sendPushToUserId(uid, {
                title: 'Potwierdź 168h placementu',
                body: bodyPl,
                url: '/internal/admin?tab=placements',
                tag: 'placement-hours-reminder',
            }).catch(() => undefined)
            notified += 1
        }

        logger.info({ event: 'placement.hours_reminder', due: due.length, notified, skipped })
        return NextResponse.json({ ok: true, due: due.length, notified, skipped, errors: errors.slice(0, 10) })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown_error'
        logger.error({ event: 'placement.hours_reminder.exception', error: message })
        Sentry.captureException(err, { tags: { kind: 'placement_hours_reminder' } })
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
}))
