// Phase 28 — Placement 168h reminder.
//
// Schedule (Coolify): 0 8 * * *  (daily 08:00 UTC)
// Auth: Authorization: Bearer $CRON_SECRET
//
// Side-effect: for placements that are 'started', past their projected 168h date (within the
// last 30 days) and not yet confirmed (no bonuses generated), nudge the importer (or, if absent,
// all managers/admins) with an in-app notification + web push to confirm 168h.
// Response: { ok, due, notified }

import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { withCronAuth } from '@/lib/api/with-auth'
import { sendPushToUserId } from '@/lib/push/dispatch'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface DuePlacement {
    id: string
    consultant_name: string
    client_name: string
    imported_by: string | null
    bonus_eligible_date: string
}

export const GET = withCronAuth(async (_request, { admin }) => {
    const today = new Date()
    const todayIso = today.toISOString().slice(0, 10)
    const horizonIso = new Date(today.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)

    try {
        const { data, error } = await admin
            .from('placements')
            .select('id, consultant_name, client_name, imported_by, bonus_eligible_date')
            .eq('status', 'started')
            .is('dl_bonus_id', null)
            .lte('bonus_eligible_date', todayIso)
            .gte('bonus_eligible_date', horizonIso)
        if (error) throw new Error(error.message)
        const due = (data ?? []) as DuePlacement[]
        if (due.length === 0) return NextResponse.json({ ok: true, due: 0, notified: 0 })

        // Resolve fallback recipients (managers + admins) only if some placement lacks an importer.
        let fallback: string[] = []
        if (due.some((p) => !p.imported_by)) {
            const { data: mgrs } = await admin.from('profiles').select('id').in('role', ['admin', 'manager'])
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

        let notified = 0
        for (const [uid, info] of Array.from(perUser.entries())) {
            const bodyPl =
                info.count === 1
                    ? `${info.sample} prawdopodobnie przepracował 168h — potwierdź, aby naliczyć premie DL i rekrutera.`
                    : `${info.count} placementów osiągnęło prognozowane 168h — potwierdź, aby naliczyć premie.`
            const bodyEn =
                info.count === 1
                    ? `${info.sample} likely reached 168h — confirm to generate the DL and recruiter bonuses.`
                    : `${info.count} placements reached the projected 168h — confirm to generate bonuses.`

            await admin.from('notifications').insert({
                user_id: uid,
                type: 'placement_reminder',
                title_pl: 'Potwierdź 168h placementu',
                title_en: 'Confirm placement 168h',
                body_pl: bodyPl,
                body_en: bodyEn,
                action_url: '/internal/admin?tab=placements',
                priority: 'normal',
            })
            await sendPushToUserId(uid, {
                title: 'Potwierdź 168h placementu',
                body: bodyPl,
                url: '/internal/admin?tab=placements',
                tag: 'placement-hours-reminder',
            }).catch(() => undefined)
            notified += 1
        }

        logger.info({ event: 'placement.hours_reminder', due: due.length, notified })
        return NextResponse.json({ ok: true, due: due.length, notified })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown_error'
        logger.error({ event: 'placement.hours_reminder.exception', error: message })
        Sentry.captureException(err, { tags: { kind: 'placement_hours_reminder' } })
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
})
