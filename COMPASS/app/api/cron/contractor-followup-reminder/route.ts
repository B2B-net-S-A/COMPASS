// Phase 33 — Kontraktorzy: follow-up reminder.
//
// Schedule (Coolify): 0 8 * * *  (daily 08:00 UTC)
// Auth: Authorization: Bearer $CRON_SECRET
//
// Side-effect: for unresolved conversations that are 'pilne'/'potrzebny_kontakt' or whose
// follow_up_date is due, nudge the contractor's owner TCM (or the conversation's TCM, or all
// TCM/admin) with an in-app notification + web push.
// Response: { ok, due, notified }

import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { withCronAuth } from '@/lib/api/with-auth'
import { sendPushToUserId } from '@/lib/actions/push-subscriptions'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

interface DueConv {
    id: string
    contractor_id: string
    status: string
    tcm_id: string | null
    follow_up_date: string | null
}

export const GET = withCronAuth(async (_request, { admin }) => {
    const today = new Date().toISOString().slice(0, 10)
    try {
        const { data, error } = await admin
            .from('contractor_conversations')
            .select('id, contractor_id, status, tcm_id, follow_up_date')
            .is('resolved_at', null)
            .or(`status.in.(pilne,potrzebny_kontakt),follow_up_date.lte.${today}`)
        if (error) throw new Error(error.message)
        const due = (data ?? []) as DueConv[]
        if (due.length === 0) return NextResponse.json({ ok: true, due: 0, notified: 0 })

        // Resolve contractor names + owner TCMs.
        const contractorIds = Array.from(new Set(due.map((c) => c.contractor_id)))
        const { data: cs } = await admin.from('contractors').select('id, full_name, owner_tcm_id').in('id', contractorIds)
        const cMap = new Map<string, { full_name: string; owner_tcm_id: string | null }>()
        for (const c of (cs ?? []) as Array<{ id: string; full_name: string; owner_tcm_id: string | null }>) cMap.set(c.id, c)

        // Fallback recipients (TCM + admin) only if some conversation has no owner and no tcm.
        let fallback: string[] = []
        if (due.some((c) => !cMap.get(c.contractor_id)?.owner_tcm_id && !c.tcm_id)) {
            const { data: tcms } = await admin.from('profiles').select('id').in('role', ['admin', 'talent_community'])
            fallback = ((tcms ?? []) as Array<{ id: string }>).map((t) => t.id)
        }

        const perUser = new Map<string, { count: number; sample: string }>()
        for (const c of due) {
            const contractor = cMap.get(c.contractor_id)
            const targets = contractor?.owner_tcm_id ? [contractor.owner_tcm_id] : c.tcm_id ? [c.tcm_id] : fallback
            for (const uid of targets) {
                const cur = perUser.get(uid) ?? { count: 0, sample: contractor?.full_name ?? 'kontraktor' }
                cur.count += 1
                perUser.set(uid, cur)
            }
        }

        let notified = 0
        for (const [uid, info] of Array.from(perUser.entries())) {
            const bodyPl = info.count === 1
                ? `${info.sample} — rozmowa wymaga kontaktu / follow-upu.`
                : `${info.count} rozmów z kontraktorami wymaga kontaktu / follow-upu.`
            const bodyEn = info.count === 1
                ? `${info.sample} — a conversation needs follow-up.`
                : `${info.count} contractor conversations need follow-up.`
            await admin.from('notifications').insert({
                user_id: uid,
                type: 'contractor_followup',
                title_pl: 'Follow-up z kontraktorem',
                title_en: 'Contractor follow-up',
                body_pl: bodyPl,
                body_en: bodyEn,
                action_url: '/internal/kontraktorzy',
                priority: 'normal',
            })
            await sendPushToUserId(uid, {
                title: 'Follow-up z kontraktorem',
                body: bodyPl,
                url: '/internal/kontraktorzy',
                tag: 'contractor-followup',
            }).catch(() => undefined)
            notified += 1
        }

        logger.info({ event: 'contractor.followup_reminder', due: due.length, notified })
        return NextResponse.json({ ok: true, due: due.length, notified })
    } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown_error'
        logger.error({ event: 'contractor.followup_reminder.exception', error: message })
        Sentry.captureException(err, { tags: { kind: 'contractor_followup_reminder' } })
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
    }
})
