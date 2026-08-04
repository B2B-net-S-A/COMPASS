import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { withCronAuth } from '@/lib/api/with-auth'
import { logAudit } from '@/lib/actions/audit'
import { logger } from '@/lib/logger'
import { warsawDate } from '@/lib/oof/oof-dates'
import { sendTechMapProjectEnd } from '@/lib/email'
import {
    allTcmAndAdmins,
    dispatchAlert,
    PROJECT_END_ALERT_DAYS,
    PROJECT_END_RECIPIENTS_KEY,
    resolveRecipients,
    selectProjectEndAlerts,
    type ProjectEndCard,
} from '@/lib/tech-map/alerts'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * Phase 46c — dzienny alert o zbliżającym się końcu projektu konsultanta.
 *
 * Dla KAŻDEGO kontraktora bierze jego NAJNOWSZĄ sfinalizowaną kartę; jeśli jej
 * deadline (ostatni dzień podanego miesiąca) mieści się w oknie <60 dni i nie był
 * jeszcze zaalarmowany (dedup `project_end_alerted_at`), powiadamia właściciela
 * benchu (odbiorcy z system_settings; fallback owner_tcm_id → admin+TCM).
 *
 * Coolify cron: `0 6 * * *` (06:00 UTC daily).
 *
 * Ślad w bazie: audit_logs `TECH_MAP_PROJECT_END_RUN` (statystyki) — czytelny bez
 * CRON_SECRET dowód, że zadanie się wykonało.
 */
export const GET = withCronAuth(async (_request, { admin }) => {
    try {
        const todayISO = warsawDate(new Date())

        const { data, error } = await admin
            .from('tech_interview_cards')
            .select('id, contractor_id, interview_date, project_end_month, project_end_year, project_end_alerted_at')
            .eq('is_draft', false)
        if (error) throw new Error(error.message)

        const cards = (data ?? []) as ProjectEndCard[]
        const alerts = selectProjectEndAlerts(cards, todayISO, PROJECT_END_ALERT_DAYS)

        if (alerts.length === 0) {
            await logAudit(null, 'TECH_MAP_PROJECT_END_RUN', {
                scanned: cards.length,
                alerted: 0,
            })
            return NextResponse.json({ ok: true, scanned: cards.length, alerted: 0 })
        }

        // Dane kontraktorów (nazwa + owner + klient) + ostatnia karta do treści alertu.
        const contractorIds = Array.from(new Set(alerts.map((a) => a.contractorId)))
        const { data: contractors } = await admin
            .from('contractors')
            .select('id, full_name, owner_tcm_id, current_client')
            .in('id', contractorIds)
        const cMap = new Map(
            ((contractors ?? []) as Array<{
                id: string
                full_name: string
                owner_tcm_id: string | null
                current_client: string | null
            }>).map((c) => [c.id, c]),
        )
        const cardById = new Map(cards.map((c) => [c.id, c]))

        const fallbackAll = await allTcmAndAdmins(admin)
        let alerted = 0
        const errors: string[] = []

        for (const alert of alerts) {
            try {
                const contractor = cMap.get(alert.contractorId)
                const card = cardById.get(alert.cardId)
                if (!contractor || !card || card.project_end_month === null || card.project_end_year === null) {
                    continue
                }

                const fallback = contractor.owner_tcm_id ? [contractor.owner_tcm_id] : fallbackAll
                const recipients = await resolveRecipients(admin, PROJECT_END_RECIPIENTS_KEY, fallback)
                const clientName = contractor.current_client ?? 'klient'

                await dispatchAlert(admin, recipients, {
                    type: 'tech_map_project_end',
                    titlePl: `Koniec projektu: ${contractor.full_name}`,
                    titleEn: `Project ending: ${contractor.full_name}`,
                    bodyPl: `${clientName} — koniec ${card.project_end_month}/${card.project_end_year}. Zaplanuj kolejny krok.`,
                    bodyEn: `${clientName} — ends ${card.project_end_month}/${card.project_end_year}. Plan the next step.`,
                    actionUrl: '/internal/people?tab=mapa',
                    pushTag: `tech-map-project-end-${alert.cardId}`,
                    emailFn: (email, name) =>
                        sendTechMapProjectEnd(
                            email,
                            name,
                            contractor.full_name,
                            clientName,
                            card.project_end_month as number,
                            card.project_end_year as number,
                        ),
                })

                // Dedup: stempluj kartę, żeby jutrzejszy przebieg jej nie powtórzył.
                await admin
                    .from('tech_interview_cards')
                    .update({ project_end_alerted_at: new Date().toISOString() })
                    .eq('id', alert.cardId)

                alerted += 1
            } catch (e) {
                errors.push(`${alert.contractorId}: ${e instanceof Error ? e.message : String(e)}`)
            }
        }

        await logAudit(null, 'TECH_MAP_PROJECT_END_RUN', {
            scanned: cards.length,
            alerted,
            errors: errors.slice(0, 15),
        })

        if (errors.length > 0) {
            Sentry.captureMessage('tech_map_project_end_partial_failure', {
                level: 'warning',
                tags: { kind: 'cron_tech_map_project_end' },
            })
        }

        logger.info({ event: 'tech_map_project_end.done', scanned: cards.length, alerted })
        return NextResponse.json({ ok: errors.length === 0, scanned: cards.length, alerted })
    } catch (error) {
        Sentry.captureException(error)
        const message = error instanceof Error ? error.message : String(error)
        logger.error({ event: 'tech_map_project_end.failed', error: message })
        return NextResponse.json({ ok: false, stage: 'scan', error: message })
    }
})
