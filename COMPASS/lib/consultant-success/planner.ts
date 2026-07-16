import 'server-only'

import { areConsultantSuccessSurveysEnabled } from './flags'

import {
    CHECK_IN_MILESTONES,
    HEALTH_REVIEW_MILESTONES,
    SURVEY_MILESTONES,
    TASK_MILESTONES,
    TCM_DELIVERY_CHANNELS,
    addCalendarDays,
    deliveryDedupeKey,
    latestReachedMilestone,
    latestRecurrenceOnOrBefore,
    isLowPulseResponse,
    localBusinessTimeToUtc,
    localDate,
} from './scheduling'
import type {
    NotificationPriority,
    PlannedDelivery,
    PlannerStats,
    SuccessAdminClient,
    SuccessDeliveryPayload,
} from './types'

const SUCCESS_HUB_URL = '/internal/people/success'

function successDeepLink(options: {
    kind: 'check_in' | 'task' | 'follow_up' | 'health'
    entityId: string
    contractorId: string | null
}): string {
    if (options.kind === 'check_in') {
        return `${SUCCESS_HUB_URL}/check-ins/${options.entityId}`
    }
    if (!options.contractorId) return SUCCESS_HUB_URL
    const tab = options.kind === 'task'
        ? 'actions'
        : options.kind === 'follow_up'
            ? 'timeline'
            : 'overview'
    const focus = options.kind === 'health' ? 'health' : options.entityId
    return `${SUCCESS_HUB_URL}/consultants/${options.contractorId}?tab=${tab}&focus=${focus}`
}

interface SuccessSettingRow {
    contractor_id: string
    monitoring_status: 'inactive' | 'active' | 'paused'
    check_in_cadence_days: number
    next_check_in_on: string | null
    surveys_enabled: boolean
    health_status: 'unknown' | 'green' | 'amber' | 'red'
    health_review_on: string | null
}

interface ContractorRow {
    id: string
    full_name: string
    status: string
    owner_tcm_id: string | null
}

interface CheckInRow {
    id: string
    contractor_id: string
    assigned_tcm_id: string | null
    status: string
    scheduled_for: string
}

interface TaskRow {
    id: string
    contractor_id: string | null
    assigned_tcm_id: string | null
    due_date: string
    snoozed_until: string | null
}

interface ConversationRow {
    id: string
    contractor_id: string
    tcm_id: string | null
    follow_up_date: string
}

interface PulseRequestRow {
    id: string
    contractor_id: string
    status: 'draft' | 'scheduled' | 'sent' | 'completed' | 'expired' | 'cancelled'
    recipient_email_snapshot: string
    scheduled_for: string | null
    sent_at: string | null
    expires_at: string
    responded_at: string | null
}

interface PulseResponseRow {
    request_id: string
    satisfaction_score: number
    engagement_score: number
    recommendation_score: number
}

interface RecipientProfile {
    id: string
    email: string | null
}

interface PlannerOptions {
    admin: SuccessAdminClient
    now?: Date
    shadowMode?: boolean
    planningHorizonDays?: number
}

function notificationPriority(milestone: string): NotificationPriority {
    if (milestone === 'overdue7' || milestone === 'low') return 'urgent'
    if (milestone === 'overdue2' || milestone === 'due') return 'high'
    return 'normal'
}

function milestoneBody(
    kind: string,
    milestone: string,
    contractorName: string,
    dueDate: string,
): { pl: string; en: string } {
    const stage = milestone === 'pre3'
        ? { pl: 'Termin przypada za 3 dni.', en: 'The due date is in 3 days.' }
        : milestone === 'due'
            ? { pl: 'Termin przypada dzisiaj.', en: 'The item is due today.' }
            : milestone === 'overdue2'
                ? { pl: 'Termin minął co najmniej 2 dni temu.', en: 'The item is at least 2 days overdue.' }
                : { pl: 'Termin minął co najmniej 7 dni temu.', en: 'The item is at least 7 days overdue.' }
    const subject = kind === 'check_in'
        ? { pl: 'Check-in konsultanta', en: 'Consultant check-in' }
        : kind === 'task'
            ? { pl: 'Action step konsultanta', en: 'Consultant action step' }
            : kind === 'follow_up'
                ? { pl: 'Follow-up po rozmowie', en: 'Conversation follow-up' }
                : { pl: 'Przegląd kondycji konsultanta', en: 'Consultant health review' }
    return {
        pl: `${contractorName} — ${subject.pl}; termin ${dueDate}. ${stage.pl}`,
        en: `${contractorName} — ${subject.en}; due ${dueDate}. ${stage.en}`,
    }
}

function title(kind: string): { pl: string; en: string } {
    if (kind === 'check_in') return { pl: 'Consultant Success — check-in', en: 'Consultant Success — check-in' }
    if (kind === 'task') return { pl: 'Consultant Success — action step', en: 'Consultant Success — action step' }
    if (kind === 'follow_up') return { pl: 'Consultant Success — follow-up', en: 'Consultant Success — follow-up' }
    if (kind === 'low_pulse') return { pl: 'Consultant Success — niski pulse', en: 'Consultant Success — low pulse' }
    return { pl: 'Consultant Success — przegląd kondycji', en: 'Consultant Success — health review' }
}

function asDate(value: string): string {
    return value.slice(0, 10)
}

function baseStats(shadowMode: boolean): PlannerStats {
    return {
        settingsScanned: 0,
        checkInsMaterialized: 0,
        checkInsAlreadyPlanned: 0,
        checkInsScanned: 0,
        tasksScanned: 0,
        conversationsScanned: 0,
        healthReviewsScanned: 0,
        pulseRequestsScanned: 0,
        pulseRequestsExpired: 0,
        lowPulseResponses: 0,
        deliveriesPlanned: 0,
        deliveriesInserted: 0,
        unassigned: 0,
        missingRecipientEmail: 0,
        shadowMode,
        durationMs: 0,
    }
}

function ensureQuery(error: { message: string } | null, context: string): void {
    if (error) throw new Error(`${context}:${error.message}`)
}

export async function runConsultantSuccessPlanner(options: PlannerOptions): Promise<PlannerStats> {
    const startedAt = Date.now()
    const now = options.now ?? new Date()
    const shadowMode = options.shadowMode ?? false
    const horizonDays = options.planningHorizonDays ?? 90
    const today = localDate(now)
    const horizonDate = addCalendarDays(today, horizonDays)
    const stats = baseStats(shadowMode)
    const admin = options.admin
    const deliveries = new Map<string, PlannedDelivery>()
    const surveysFeatureEnabled = areConsultantSuccessSurveysEnabled()

    const { data: profileData, error: profileError } = await admin
        .from('profiles')
        .select('id, email')
        .in('role', ['talent_community', 'admin'])
        .order('id')
    ensureQuery(profileError, 'profiles_read_failed')
    const fallbackProfiles = (profileData ?? []) as RecipientProfile[]
    const allowedRecipientIds = new Set(fallbackProfiles.map((profile) => profile.id))

    const { data: contractorData, error: contractorError } = await admin
        .from('contractors')
        .select('id, full_name, status, owner_tcm_id')
    ensureQuery(contractorError, 'contractors_read_failed')
    const contractors = (contractorData ?? []) as ContractorRow[]
    const contractorMap = new Map(contractors.map((contractor) => [contractor.id, contractor]))

    const recipientFor = (preferredId: string | null | undefined): RecipientProfile | null => {
        // An owner/assignee may have changed role since assignment. Never send
        // private Success Hub metadata to a profile outside TCM/admin.
        if (preferredId && allowedRecipientIds.has(preferredId)) {
            return fallbackProfiles.find((profile) => profile.id === preferredId) ?? null
        }
        stats.unassigned += 1
        return null
    }

    const enqueueMilestone = (options: {
        kind: 'check_in' | 'task' | 'follow_up' | 'health'
        deliveryKind: PlannedDelivery['delivery_kind']
        entityId: string
        contractorId: string | null
        preferredRecipientId: string | null
        milestone: string
        dueDate: string
    }): void => {
        const recipient = recipientFor(options.preferredRecipientId)
        if (!recipient) return
        const contractorName = options.contractorId
            ? contractorMap.get(options.contractorId)?.full_name ?? 'Konsultant'
            : 'Zadanie zespołu TCM'
        const body = milestoneBody(
            options.kind,
            options.milestone,
            contractorName,
            options.dueDate,
        )
        const heading = title(options.kind)
        const payload: SuccessDeliveryPayload = {
            milestone: options.milestone,
            title_pl: heading.pl,
            title_en: heading.en,
            body_pl: body.pl,
            body_en: body.en,
            action_url: successDeepLink(options),
            priority: notificationPriority(options.milestone),
            due_on: options.dueDate,
        }
        const dedupeKey = deliveryDedupeKey([
            options.kind,
            options.entityId,
            options.milestone,
            options.dueDate,
        ])
        for (const channel of TCM_DELIVERY_CHANNELS) {
            if (channel === 'email' && !recipient.email) {
                stats.missingRecipientEmail += 1
                continue
            }
            deliveries.set(`${dedupeKey}:${channel}`, {
                delivery_kind: options.deliveryKind,
                entity_id: options.entityId,
                contractor_id: options.contractorId,
                recipient_user_id: recipient.id,
                recipient_email: channel === 'email' ? recipient.email : null,
                channel,
                dedupe_key: dedupeKey,
                available_at: now.toISOString(),
                status: 'pending',
                payload,
            })
        }
    }

    // 1. Materialise one upcoming/missed check-in per active monitored consultant.
    const { data: settingData, error: settingError } = await admin
        .from('contractor_success_settings')
        .select('contractor_id, monitoring_status, check_in_cadence_days, next_check_in_on, surveys_enabled, health_status, health_review_on')
        .eq('monitoring_status', 'active')
    ensureQuery(settingError, 'settings_read_failed')
    const settings = (settingData ?? []) as SuccessSettingRow[]
    stats.settingsScanned = settings.length
    const activeContractorIds = new Set(settings.map((setting) => setting.contractor_id))

    const monitoredIds = settings.map((setting) => setting.contractor_id)
    const plannedByContractor = new Set<string>()
    if (monitoredIds.length > 0) {
        const { data: activeCheckIns, error: activeCheckInsError } = await admin
            .from('contractor_check_ins')
            .select('contractor_id')
            .in('contractor_id', monitoredIds)
            .in('status', ['scheduled', 'in_progress'])
        ensureQuery(activeCheckInsError, 'active_check_ins_read_failed')
        for (const row of (activeCheckIns ?? []) as Array<{ contractor_id: string }>) {
            plannedByContractor.add(row.contractor_id)
        }
    }

    for (const setting of settings) {
        const contractor = contractorMap.get(setting.contractor_id)
        if (!setting.next_check_in_on || contractor?.status === 'exited') continue
        if (plannedByContractor.has(setting.contractor_id)) {
            stats.checkInsAlreadyPlanned += 1
            continue
        }
        const scheduledFor = setting.next_check_in_on <= today
            ? latestRecurrenceOnOrBefore({
                firstDueDate: setting.next_check_in_on,
                intervalDays: setting.check_in_cadence_days,
                today,
            })
            : setting.next_check_in_on
        if (scheduledFor > horizonDate) continue
        stats.checkInsMaterialized += 1
        if (shadowMode) continue

        const actorId = contractor?.owner_tcm_id && allowedRecipientIds.has(contractor.owner_tcm_id)
            ? contractor.owner_tcm_id
            : null
        const { error: insertError } = await admin.from('contractor_check_ins').insert({
            contractor_id: setting.contractor_id,
            check_in_type: 'regular',
            status: 'scheduled',
            scheduled_at: localBusinessTimeToUtc(scheduledFor, 9).toISOString(),
            assigned_tcm_id: actorId,
            created_by: actorId,
            updated_by: actorId,
        })
        if (insertError && insertError.code !== '23505') {
            throw new Error(`check_in_materialize_failed:${insertError.message}`)
        }
    }

    // 2. Check-ins: pre-3, due, overdue +2/+7. Only latest reached stage per run.
    const { data: checkInData, error: checkInError } = await admin
        .from('contractor_check_ins')
        .select('id, contractor_id, assigned_tcm_id, status, scheduled_for')
        .in('status', ['scheduled', 'in_progress'])
        .lte('scheduled_for', addCalendarDays(today, 3))
    ensureQuery(checkInError, 'check_ins_read_failed')
    const checkIns = (checkInData ?? []) as CheckInRow[]
    stats.checkInsScanned = checkIns.length
    for (const checkIn of checkIns) {
        if (!activeContractorIds.has(checkIn.contractor_id)) continue
        const milestone = latestReachedMilestone(checkIn.scheduled_for, today, CHECK_IN_MILESTONES)
        if (!milestone) continue
        enqueueMilestone({
            kind: 'check_in',
            deliveryKind: 'check_in_due',
            entityId: checkIn.id,
            contractorId: checkIn.contractor_id,
            preferredRecipientId: contractorMap.get(checkIn.contractor_id)?.owner_tcm_id ?? null,
            milestone: milestone.key,
            dueDate: checkIn.scheduled_for,
        })
    }

    // 3. Open action steps/tasks.
    const { data: taskData, error: taskError } = await admin
        .from('contractor_tasks')
        .select('id, contractor_id, assigned_tcm_id, due_date, snoozed_until')
        .in('status', ['todo', 'in_progress'])
        .not('due_date', 'is', null)
        .lte('due_date', today)
    ensureQuery(taskError, 'tasks_read_failed')
    const tasks = (taskData ?? []) as TaskRow[]
    stats.tasksScanned = tasks.length
    for (const task of tasks) {
        if (!task.contractor_id || !activeContractorIds.has(task.contractor_id)) continue
        if (task.snoozed_until && task.snoozed_until > today) continue
        const effectiveDueDate = task.snoozed_until ?? task.due_date
        const milestone = latestReachedMilestone(effectiveDueDate, today, TASK_MILESTONES)
        if (!milestone) continue
        enqueueMilestone({
            kind: 'task',
            deliveryKind: 'task_due',
            entityId: task.id,
            contractorId: task.contractor_id,
            // Audyt 2026-07-16 P1.9: reminder taska idzie do WYKONAWCY
            // (assigned_tcm_id); owner portfolio tylko jako jawny fallback,
            // gdy task nie ma assignee. recipientFor() nadal egzekwuje
            // allowlistę TCM/admin.
            preferredRecipientId: task.assigned_tcm_id
                ?? (task.contractor_id
                    ? contractorMap.get(task.contractor_id)?.owner_tcm_id ?? null
                    : null),
            milestone: milestone.key,
            dueDate: effectiveDueDate,
        })
    }

    // 4. Conversation follow-ups reuse the private contractor conversation log.
    const { data: conversationData, error: conversationError } = await admin
        .from('contractor_conversations')
        .select('id, contractor_id, tcm_id, follow_up_date')
        .is('resolved_at', null)
        .not('follow_up_date', 'is', null)
        .lte('follow_up_date', today)
    ensureQuery(conversationError, 'conversations_read_failed')
    const conversations = (conversationData ?? []) as ConversationRow[]
    stats.conversationsScanned = conversations.length
    for (const conversation of conversations) {
        if (!activeContractorIds.has(conversation.contractor_id)) continue
        const milestone = latestReachedMilestone(conversation.follow_up_date, today, TASK_MILESTONES)
        if (!milestone) continue
        enqueueMilestone({
            kind: 'follow_up',
            deliveryKind: 'conversation_follow_up',
            entityId: conversation.id,
            contractorId: conversation.contractor_id,
            preferredRecipientId: contractorMap.get(conversation.contractor_id)?.owner_tcm_id ?? null,
            milestone: milestone.key,
            dueDate: conversation.follow_up_date,
        })
    }

    // 5. Health review is intentionally separate from check-in cadence.
    for (const setting of settings) {
        if (!setting.health_review_on || setting.health_review_on > addCalendarDays(today, 3)) continue
        stats.healthReviewsScanned += 1
        const milestone = latestReachedMilestone(setting.health_review_on, today, HEALTH_REVIEW_MILESTONES)
        if (!milestone) continue
        enqueueMilestone({
            kind: 'health',
            deliveryKind: 'health_review',
            entityId: setting.contractor_id,
            contractorId: setting.contractor_id,
            preferredRecipientId: contractorMap.get(setting.contractor_id)?.owner_tcm_id ?? null,
            milestone: milestone.key,
            dueDate: setting.health_review_on,
        })
    }

    // 6. Pulse invitations, D+3/D+7 reminders, D+14 expiry and low-score alerts.
    const { data: pulseData, error: pulseError } = await admin
        .from('contractor_pulse_requests')
        .select('id, contractor_id, status, recipient_email_snapshot, scheduled_for, sent_at, expires_at, responded_at')
        .in('status', ['scheduled', 'sent', 'completed'])
    ensureQuery(pulseError, 'pulse_requests_read_failed')
    const pulseRequests = (pulseData ?? []) as PulseRequestRow[]
    stats.pulseRequestsScanned = pulseRequests.length

    for (const request of pulseRequests) {
        const monitoringActive = activeContractorIds.has(request.contractor_id)
        if (request.status === 'scheduled' && request.scheduled_for && new Date(request.scheduled_for) <= now) {
            if (!monitoringActive || !surveysFeatureEnabled) continue
            const dedupeKey = `survey:${request.id}:invitation`
            deliveries.set(`${dedupeKey}:email`, {
                delivery_kind: 'pulse_invitation',
                entity_id: request.id,
                contractor_id: request.contractor_id,
                recipient_user_id: null,
                recipient_email: request.recipient_email_snapshot,
                channel: 'email',
                dedupe_key: dedupeKey,
                available_at: now.toISOString(),
                status: 'pending',
                payload: { milestone: 'invitation' },
            })
        }

        if (request.status === 'sent' && request.sent_at) {
            if (new Date(request.expires_at) <= now) {
                stats.pulseRequestsExpired += 1
                if (!shadowMode) {
                    const { error: expireError } = await admin
                        .from('contractor_pulse_requests')
                        .update({ status: 'expired', updated_at: now.toISOString() })
                        .eq('id', request.id)
                        .eq('status', 'sent')
                    ensureQuery(expireError, 'pulse_expire_failed')
                }
                continue
            }
            if (!monitoringActive || !surveysFeatureEnabled) continue
            const reminderDefinitions = SURVEY_MILESTONES.filter((item) => item.key !== 'expiry14')
            const milestone = latestReachedMilestone(asDate(request.sent_at), today, reminderDefinitions)
            if (milestone) {
                const dedupeKey = `survey:${request.id}:${milestone.key}`
                deliveries.set(`${dedupeKey}:email`, {
                    delivery_kind: 'pulse_reminder',
                    entity_id: request.id,
                    contractor_id: request.contractor_id,
                    recipient_user_id: null,
                    recipient_email: request.recipient_email_snapshot,
                    channel: 'email',
                    dedupe_key: dedupeKey,
                    available_at: now.toISOString(),
                    status: 'pending',
                    payload: { milestone: milestone.key },
                })
            }
        }
    }

    const completedRequests = pulseRequests.filter((request) => request.status === 'completed')
    if (completedRequests.length > 0) {
        const completedIds = completedRequests.map((request) => request.id)
        const { data: responseData, error: responseError } = await admin
            .from('contractor_pulse_responses')
            .select('request_id, satisfaction_score, engagement_score, recommendation_score')
            .in('request_id', completedIds)
        ensureQuery(responseError, 'pulse_responses_read_failed')
        const responseByRequest = new Map(
            ((responseData ?? []) as PulseResponseRow[]).map((response) => [response.request_id, response]),
        )
        for (const request of completedRequests) {
            if (!surveysFeatureEnabled || !activeContractorIds.has(request.contractor_id)) continue
            const response = responseByRequest.get(request.id)
            if (!response) continue
            const isLow = isLowPulseResponse({
                satisfactionScore: response.satisfaction_score,
                engagementScore: response.engagement_score,
                recommendationScore: response.recommendation_score,
            })
            if (!isLow) continue
            stats.lowPulseResponses += 1
            const recipient = recipientFor(contractorMap.get(request.contractor_id)?.owner_tcm_id)
            if (!recipient) continue
            const dedupeKey = `survey:${request.id}:low`
            const heading = title('low_pulse')
            const contractorName = contractorMap.get(request.contractor_id)?.full_name ?? 'Konsultant'
            const payload: SuccessDeliveryPayload = {
                milestone: 'low',
                title_pl: heading.pl,
                title_en: heading.en,
                body_pl: `${contractorName} — niski pulse; termin ręcznego przeglądu ${today}. Bez treści odpowiedzi w tej wiadomości.`,
                body_en: `${contractorName} — low pulse; manual review due ${today}. The response content is not included in this message.`,
                action_url: `${SUCCESS_HUB_URL}/consultants/${request.contractor_id}?tab=feedback&focus=${request.id}`,
                priority: 'urgent',
                due_on: today,
            }
            for (const channel of TCM_DELIVERY_CHANNELS) {
                if (channel === 'email' && !recipient.email) {
                    stats.missingRecipientEmail += 1
                    continue
                }
                deliveries.set(`${dedupeKey}:${channel}`, {
                    delivery_kind: 'pulse_low_alert',
                    entity_id: request.id,
                    contractor_id: request.contractor_id,
                    recipient_user_id: recipient.id,
                    recipient_email: channel === 'email' ? recipient.email : null,
                    channel,
                    dedupe_key: dedupeKey,
                    available_at: now.toISOString(),
                    status: 'pending',
                    payload,
                })
            }
        }
    }

    const rows = Array.from(deliveries.values())
    stats.deliveriesPlanned = rows.length
    if (!shadowMode) {
        for (let offset = 0; offset < rows.length; offset += 200) {
            const chunk = rows.slice(offset, offset + 200)
            const { data: inserted, error: insertError } = await admin
                .from('contractor_success_deliveries')
                .upsert(chunk, { onConflict: 'dedupe_key,channel', ignoreDuplicates: true })
                .select('id')
            ensureQuery(insertError, 'deliveries_enqueue_failed')
            stats.deliveriesInserted += inserted?.length ?? 0
        }
    }

    stats.durationMs = Date.now() - startedAt
    return stats
}
