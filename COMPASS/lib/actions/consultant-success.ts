'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { createServiceClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
    createPulseToken,
    getPulseTokenSecret,
    hashPulseToken,
} from '@/lib/consultant-success/pulse-token'
import {
    areConsultantSuccessSurveysEnabled,
    isConsultantSuccessEnabled,
} from '@/lib/consultant-success/flags'
import type {
    ActivateSuccessMonitoringInput,
    AddSuccessClientFeedbackInput,
    CompleteSuccessCheckInInput,
    CreateSuccessTaskInput,
    PauseSuccessMonitoringInput,
    RescheduleSuccessCheckInInput,
    RetrySuccessDeliveryInput,
    ScheduleSuccessCheckInInput,
    SendSuccessPulseSurveyInput,
    SetSuccessHealthStatusInput,
    SuccessCheckInDetail,
    SuccessCheckInListItem,
    SuccessClientFeedback,
    SuccessConsultantDetail,
    SuccessConsultantListItem,
    SuccessDashboard,
    SuccessDeadDelivery,
    SuccessHealth,
    SuccessHealthStatus,
    SuccessPlacement,
    SuccessPriority,
    SuccessPriorityItem,
    SuccessPulseResponse,
    SuccessTask,
    SuccessTaskStatus,
    SuccessTimelineEvent,
    SuccessTcmOption,
    UpdateSuccessTaskInput,
} from '@/lib/types/consultant-success'

const SUCCESS_ROOT = '/internal/people/success'
const DAY_MS = 86_400_000

// New tables are intentionally accessed through one narrow untyped boundary until
// `npm run db:types` is run after applying the migration to the linked project.
function successDb() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createServiceClient() as any
}

function successUserDb() {
    // The migration and generated types ship together. Keep the temporary cast
    // local while preserving the authenticated JWT required by SECURITY INVOKER.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return createClient() as any
}

type DbRow = Record<string, unknown>

async function requireSuccessManagerAction() {
    const ctx = await requireLifecycleManagerAction()
    if (!isConsultantSuccessEnabled()) {
        throw new Error('Moduł Consultant Success jest obecnie wyłączony.')
    }
    return ctx
}

function assertDb(error: { message?: string } | null, context: string): void {
    if (error) throw new Error(`${context}: ${error.message ?? 'unknown database error'}`)
}

function text(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null
}

function iso(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null
}

function dateOnly(value: string): string {
    return value.slice(0, 10)
}

function asScheduledIso(value: string): string {
    if (value.includes('T')) return new Date(value).toISOString()
    return new Date(`${value}T09:00:00.000Z`).toISOString()
}

function addDays(date: string, days: number): string {
    const base = new Date(`${dateOnly(date)}T12:00:00.000Z`)
    return new Date(base.getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

function dbPriority(priority: SuccessPriority): 'low' | 'normal' | 'high' | 'urgent' {
    return ({ low: 'low', medium: 'normal', high: 'high', critical: 'urgent' } as const)[priority]
}

function uiPriority(priority: unknown): SuccessPriority {
    if (priority === 'urgent' || priority === 'critical') return 'critical'
    if (priority === 'high') return 'high'
    if (priority === 'low') return 'low'
    return 'medium'
}

function uiTaskStatus(status: unknown): SuccessTaskStatus {
    if (status === 'in_progress' || status === 'done' || status === 'cancelled') return status
    return 'todo'
}

function healthFromSettings(row: DbRow | undefined, profileNames: Map<string, string>): SuccessHealth {
    const status = (row?.health_status ?? 'unknown') as SuccessHealthStatus
    const setterId = text(row?.health_status_set_by)
    return {
        status: ['green', 'amber', 'red'].includes(status) ? status : 'unknown',
        reason: text(row?.health_status_reason),
        reviewOn: iso(row?.health_review_on),
        setAt: iso(row?.health_status_set_at),
        setByName: setterId ? profileNames.get(setterId) ?? null : null,
    }
}

async function loadTcmOptions(db = successDb()): Promise<{ options: SuccessTcmOption[]; names: Map<string, string> }> {
    const { data, error } = await db
        .from('profiles')
        .select('id, full_name')
        .in('role', ['talent_community', 'admin'])
        .order('full_name')
    assertDb(error, 'Nie udało się pobrać opiekunów TCM')
    const options = ((data ?? []) as DbRow[]).map((row) => ({
        id: String(row.id),
        name: text(row.full_name) ?? '—',
    }))
    return { options, names: new Map(options.map((option) => [option.id, option.name])) }
}

async function loadSuccessConsultants(): Promise<SuccessConsultantListItem[]> {
    const db = successDb()
    const [contractorsRes, settingsRes, conversationsRes, checkInsRes, tasksRes, tcms] = await Promise.all([
        db.from('contractors').select('*').order('full_name').limit(5000),
        db.from('contractor_success_settings').select('*').limit(5000),
        db.from('contractor_conversations').select('contractor_id, conversation_date').limit(5000),
        db.from('contractor_check_ins').select('contractor_id, scheduled_at, occurred_at, status').limit(5000),
        db.from('contractor_tasks').select('contractor_id, status, due_date').limit(5000),
        loadTcmOptions(db),
    ])
    assertDb(contractorsRes.error, 'Nie udało się pobrać konsultantów')
    assertDb(settingsRes.error, 'Nie udało się pobrać ustawień Success')
    assertDb(conversationsRes.error, 'Nie udało się pobrać historii kontaktów')
    assertDb(checkInsRes.error, 'Nie udało się pobrać check-inów')
    assertDb(tasksRes.error, 'Nie udało się pobrać działań')

    const settings = new Map(((settingsRes.data ?? []) as DbRow[]).map((row) => [String(row.contractor_id), row]))
    const lastContact = new Map<string, string>()
    const nextCheckIn = new Map<string, string>()
    const taskCounts = new Map<string, { open: number; overdue: number }>()
    const today = new Date().toISOString().slice(0, 10)

    for (const row of (conversationsRes.data ?? []) as DbRow[]) {
        const id = String(row.contractor_id)
        const at = iso(row.conversation_date)
        if (at && (!lastContact.get(id) || at > lastContact.get(id)!)) lastContact.set(id, at)
    }
    for (const row of (checkInsRes.data ?? []) as DbRow[]) {
        const id = String(row.contractor_id)
        const occurred = iso(row.occurred_at)
        if (occurred && (!lastContact.get(id) || occurred > lastContact.get(id)!)) lastContact.set(id, occurred)
        if (row.status === 'scheduled' || row.status === 'in_progress') {
            const scheduled = iso(row.scheduled_at)
            if (scheduled && (!nextCheckIn.get(id) || scheduled < nextCheckIn.get(id)!)) nextCheckIn.set(id, scheduled)
        }
    }
    for (const row of (tasksRes.data ?? []) as DbRow[]) {
        if (!row.contractor_id || row.status === 'done' || row.status === 'cancelled') continue
        const id = String(row.contractor_id)
        const count = taskCounts.get(id) ?? { open: 0, overdue: 0 }
        count.open += 1
        if (text(row.due_date) && String(row.due_date) < today) count.overdue += 1
        taskCounts.set(id, count)
    }

    return ((contractorsRes.data ?? []) as DbRow[]).map((row) => {
        const contractorId = String(row.id)
        const state = settings.get(contractorId)
        const ownerId = text(row.owner_tcm_id)
        const counts = taskCounts.get(contractorId) ?? { open: 0, overdue: 0 }
        return {
            contractorId,
            fullName: text(row.full_name) ?? '—',
            email: text(row.email),
            phone: text(row.phone),
            currentClient: text(row.current_client),
            currentPosition: text(row.current_position),
            contractorStatus: (row.status ?? 'prospect') as SuccessConsultantListItem['contractorStatus'],
            statusVerifiedAt: iso(state?.status_verified_at),
            ownerTcmId: ownerId,
            ownerTcmName: ownerId ? tcms.names.get(ownerId) ?? null : null,
            monitoringState: (state?.monitoring_status ?? 'inactive') as SuccessConsultantListItem['monitoringState'],
            cadenceDays: typeof state?.check_in_cadence_days === 'number' ? state.check_in_cadence_days : null,
            health: healthFromSettings(state, tcms.names),
            lastContactAt: lastContact.get(contractorId) ?? null,
            nextCheckInAt: nextCheckIn.get(contractorId) ?? iso(state?.next_check_in_on),
            openTaskCount: counts.open,
            overdueTaskCount: counts.overdue,
        }
    })
}

async function loadSuccessCheckIns(contractorId?: string): Promise<SuccessCheckInListItem[]> {
    const db = successDb()
    let query = db.from('contractor_check_ins').select('*').order('scheduled_at', { ascending: true }).limit(5000)
    if (contractorId) query = query.eq('contractor_id', contractorId)
    const { data, error } = await query
    assertDb(error, 'Nie udało się pobrać check-inów')
    const rows = (data ?? []) as DbRow[]
    if (rows.length === 0) return []

    const contractorIds = Array.from(new Set(rows.map((row) => String(row.contractor_id))))
    const checkInIds = rows.map((row) => String(row.id))
    const [contractorsRes, tasksRes, pulsesRes, tcms] = await Promise.all([
        db.from('contractors').select('id, full_name, current_client, owner_tcm_id').in('id', contractorIds),
        db.from('contractor_tasks').select('source_check_in_id, status').in('source_check_in_id', checkInIds),
        db.from('contractor_pulse_requests').select('source_check_in_id, status').in('source_check_in_id', checkInIds),
        loadTcmOptions(db),
    ])
    assertDb(contractorsRes.error, 'Nie udało się pobrać danych konsultantów')
    assertDb(tasksRes.error, 'Nie udało się pobrać działań check-inu')
    assertDb(pulsesRes.error, 'Nie udało się pobrać ankiet check-inu')

    const contractors = new Map(((contractorsRes.data ?? []) as DbRow[]).map((row) => [String(row.id), row]))
    const taskCount = new Map<string, number>()
    for (const row of (tasksRes.data ?? []) as DbRow[]) {
        if (!row.source_check_in_id || row.status === 'done' || row.status === 'cancelled') continue
        const id = String(row.source_check_in_id)
        taskCount.set(id, (taskCount.get(id) ?? 0) + 1)
    }
    const pulseStatus = new Map<string, SuccessCheckInListItem['pulseStatus']>()
    for (const row of (pulsesRes.data ?? []) as DbRow[]) {
        if (!row.source_check_in_id) continue
        const id = String(row.source_check_in_id)
        pulseStatus.set(id, row.status === 'completed' ? 'completed' : 'pending')
    }

    return rows.map((row) => {
        const contractor = contractors.get(String(row.contractor_id))
        const assignedTcmId = text(row.assigned_tcm_id) ?? text(contractor?.owner_tcm_id)
        return {
            id: String(row.id),
            contractorId: String(row.contractor_id),
            contractorName: text(contractor?.full_name) ?? '—',
            clientName: text(contractor?.current_client),
            ownerTcmId: assignedTcmId,
            ownerTcmName: assignedTcmId ? tcms.names.get(assignedTcmId) ?? null : null,
            scheduledAt: iso(row.scheduled_at) ?? new Date().toISOString(),
            actualAt: iso(row.occurred_at),
            status: (row.status ?? 'scheduled') as SuccessCheckInListItem['status'],
            type: (row.check_in_type ?? 'regular') as SuccessCheckInListItem['type'],
            channel: (row.channel ?? null) as SuccessCheckInListItem['channel'],
            priority: uiPriority(row.priority),
            agenda: text(row.agenda),
            notes: text(row.notes),
            durationMinutes: typeof row.duration_minutes === 'number' ? row.duration_minutes : null,
            tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === 'string') : [],
            openTaskCount: taskCount.get(String(row.id)) ?? 0,
            pulseStatus: pulseStatus.get(String(row.id)) ?? 'not_requested',
        }
    })
}

export async function listSuccessConsultants(): Promise<SuccessConsultantListItem[]> {
    await requireSuccessManagerAction()
    return loadSuccessConsultants()
}

// Full TCM/admin roster (not just currently-assigned owners) — used to populate
// "opiekun" pickers/filters so every eligible person is selectable, even before
// any consultant has been assigned to them.
export async function listSuccessTcmOptions(): Promise<SuccessTcmOption[]> {
    await requireSuccessManagerAction()
    const { options } = await loadTcmOptions()
    return options
}

export async function listSuccessCheckIns(): Promise<SuccessCheckInListItem[]> {
    await requireSuccessManagerAction()
    return loadSuccessCheckIns()
}

function mapFeedback(row: DbRow, creatorNames: Map<string, string>): SuccessClientFeedback {
    const technical = Number(row.technical_rating ?? 0)
    const communication = Number(row.communication_rating ?? 0)
    const reliability = Number(row.reliability_rating ?? 0)
    const engagement = Number(row.engagement_rating ?? 0)
    const calculated = [technical, communication, reliability, engagement].reduce((sum, score) => sum + score, 0) / 4
    const creatorId = text(row.recorded_by)
    return {
        id: String(row.id),
        contractorId: String(row.contractor_id),
        checkInId: text(row.source_check_in_id),
        placementId: text(row.placement_id),
        feedbackDate: String(row.feedback_date),
        clientName: text(row.client_name_snapshot) ?? '—',
        sourceName: text(row.provided_by_name),
        technicalScore: technical,
        communicationScore: communication,
        reliabilityScore: reliability,
        engagementScore: engagement,
        averageScore: Number(row.overall_rating ?? calculated),
        strengths: text(row.strengths),
        improvementAreas: text(row.improvement_areas),
        recommendations: text(row.recommended_actions),
        willingToContinue: (row.willing_to_continue ?? null) as SuccessClientFeedback['willingToContinue'],
        priority: uiPriority(row.risk_level),
        createdByName: creatorId ? creatorNames.get(creatorId) ?? null : null,
        createdAt: iso(row.created_at) ?? new Date().toISOString(),
    }
}

function mapTask(row: DbRow, tcmNames: Map<string, string>): SuccessTask {
    const assigneeId = text(row.assigned_tcm_id)
    return {
        id: String(row.id),
        contractorId: text(row.contractor_id),
        checkInId: text(row.source_check_in_id),
        title: text(row.title) ?? 'Działanie',
        description: text(row.description),
        status: uiTaskStatus(row.status),
        priority: uiPriority(row.priority),
        assignedTcmId: assigneeId,
        assignedTcmName: assigneeId ? tcmNames.get(assigneeId) ?? null : null,
        dueDate: iso(row.due_date),
        completedAt: iso(row.completed_at),
        createdAt: iso(row.created_at) ?? new Date().toISOString(),
    }
}

function mapPulseResponse(row: DbRow, request: DbRow): SuccessPulseResponse {
    const satisfaction = Number(row.satisfaction_score)
    const engagement = Number(row.engagement_score)
    const recommendation = Number(row.recommendation_score)
    const normalized = (satisfaction * 10 + (engagement - 1) * 25 + recommendation * 10) / 3
    return {
        id: String(row.request_id),
        contractorId: String(request.contractor_id),
        checkInId: text(request.source_check_in_id),
        satisfactionScore: satisfaction,
        engagementScore: engagement,
        recommendationScore: recommendation,
        overallScore: Math.round(normalized * 10) / 10,
        note: text(row.note),
        source: 'token',
        recordedAt: iso(row.submitted_at) ?? new Date().toISOString(),
    }
}

export async function getSuccessConsultantDetail(contractorId: string): Promise<SuccessConsultantDetail> {
    await requireSuccessManagerAction()
    if (!z.string().uuid().safeParse(contractorId).success) throw new Error('Nieprawidłowy identyfikator konsultanta.')

    const db = successDb()
    const consultants = await loadSuccessConsultants()
    const consultant = consultants.find((item) => item.contractorId === contractorId)
    if (!consultant) throw new Error('Konsultant nie istnieje lub nie masz dostępu.')

    const [settingsRes, conversationsRes, feedbackRes, requestsRes, tasksRes, placementsRes, onboardingRes, exitRes, healthHistoryRes, tcms] = await Promise.all([
        db.from('contractor_success_settings').select('*').eq('contractor_id', contractorId).maybeSingle(),
        db.from('contractor_conversations').select('*').eq('contractor_id', contractorId).order('conversation_date', { ascending: false }).limit(1000),
        db.from('contractor_client_feedback').select('*').eq('contractor_id', contractorId).is('archived_at', null).order('feedback_date', { ascending: false }).limit(1000),
        db.from('contractor_pulse_requests').select('*').eq('contractor_id', contractorId).order('created_at', { ascending: false }).limit(1000),
        db.from('contractor_tasks').select('*').eq('contractor_id', contractorId).order('created_at', { ascending: false }).limit(1000),
        db.from('placements').select('id, client_name, position, start_date, status').eq('contractor_id', contractorId).order('start_date', { ascending: false }).limit(500),
        db.from('contractor_onboarding_interviews').select('id, status, scheduled_for, submitted_at, created_at').eq('contractor_id', contractorId).limit(500),
        db.from('contractor_exit_interviews').select('id, status, scheduled_for, submitted_at, created_at').eq('contractor_id', contractorId).limit(500),
        db.from('contractor_health_status_history').select('*').eq('contractor_id', contractorId).order('created_at', { ascending: false }).limit(500),
        loadTcmOptions(db),
    ])
    assertDb(settingsRes.error, 'Nie udało się pobrać ustawień monitoringu')
    assertDb(conversationsRes.error, 'Nie udało się pobrać rozmów')
    assertDb(feedbackRes.error, 'Nie udało się pobrać feedbacku')
    assertDb(requestsRes.error, 'Nie udało się pobrać ankiet')
    assertDb(tasksRes.error, 'Nie udało się pobrać działań')
    assertDb(placementsRes.error, 'Nie udało się pobrać placementów')
    assertDb(healthHistoryRes.error, 'Nie udało się pobrać historii kondycji')

    const checkIns = await loadSuccessCheckIns(contractorId)
    const requests = (requestsRes.data ?? []) as DbRow[]
    const requestIds = requests.map((row) => String(row.id))
    const responsesRes = requestIds.length > 0
        ? await db.from('contractor_pulse_responses').select('*').in('request_id', requestIds)
        : { data: [], error: null }
    assertDb(responsesRes.error, 'Nie udało się pobrać odpowiedzi ankiet')
    const requestMap = new Map(requests.map((row) => [String(row.id), row]))

    const feedback = ((feedbackRes.data ?? []) as DbRow[]).map((row) => mapFeedback(row, tcms.names))
    const tasks = ((tasksRes.data ?? []) as DbRow[]).map((row) => mapTask(row, tcms.names))
    const pulseResponses = ((responsesRes.data ?? []) as DbRow[])
        .map((row) => ({ row, request: requestMap.get(String(row.request_id)) }))
        .filter((item): item is { row: DbRow; request: DbRow } => Boolean(item.request))
        .map(({ row, request }) => mapPulseResponse(row, request))
    const placements: SuccessPlacement[] = ((placementsRes.data ?? []) as DbRow[]).map((row) => ({
        id: String(row.id),
        clientName: text(row.client_name) ?? '—',
        position: text(row.position),
        startDate: String(row.start_date ?? ''),
        status: String(row.status ?? ''),
    }))

    const timeline: SuccessTimelineEvent[] = []
    for (const row of (conversationsRes.data ?? []) as DbRow[]) {
        const actorId = text(row.tcm_id) ?? text(row.created_by)
        timeline.push({
            id: `conversation:${String(row.id)}`,
            type: 'conversation',
            occurredAt: String(row.conversation_date),
            title: `Rozmowa: ${String(row.category ?? 'inne')}`,
            description: text(row.note),
            actorName: actorId ? tcms.names.get(actorId) ?? text(row.tcm_raw) : text(row.tcm_raw),
            clientName: text(row.client_snapshot),
            statusLabel: text(row.status),
            priority: row.status === 'pilne' ? 'critical' : row.status === 'potrzebny_kontakt' ? 'high' : 'medium',
            href: `${SUCCESS_ROOT}/consultants/${contractorId}?tab=timeline&focus=${String(row.id)}`,
        })
    }
    for (const item of checkIns) {
        timeline.push({
            id: `check-in:${item.id}`,
            type: 'check_in',
            occurredAt: item.actualAt ?? item.scheduledAt,
            title: item.status === 'completed' ? 'Zakończony check-in' : 'Zaplanowany check-in',
            description: item.notes ?? item.agenda,
            actorName: item.ownerTcmName,
            clientName: item.clientName,
            statusLabel: item.status,
            priority: item.priority,
            href: `${SUCCESS_ROOT}/check-ins/${item.id}`,
        })
    }
    for (const item of feedback) {
        timeline.push({
            id: `feedback:${item.id}`,
            type: 'client_feedback',
            occurredAt: item.feedbackDate,
            title: `Feedback klienta · ${item.averageScore.toFixed(1)}/5`,
            description: item.strengths ?? item.improvementAreas,
            actorName: item.createdByName,
            clientName: item.clientName,
            statusLabel: null,
            priority: item.priority,
            href: `${SUCCESS_ROOT}/consultants/${contractorId}?tab=feedback&focus=${item.id}`,
        })
    }
    for (const item of pulseResponses) {
        timeline.push({
            id: `pulse:${item.id}`,
            type: 'pulse',
            occurredAt: item.recordedAt,
            title: 'Odpowiedź ankietowa konsultanta',
            description: item.note,
            actorName: null,
            clientName: consultant.currentClient,
            statusLabel: null,
            priority: item.satisfactionScore <= 4 || item.engagementScore <= 2 || item.recommendationScore <= 4 ? 'high' : 'medium',
            href: `${SUCCESS_ROOT}/consultants/${contractorId}?tab=feedback&focus=${item.id}`,
        })
    }
    for (const item of tasks) {
        timeline.push({
            id: `task:${item.id}`,
            type: 'task',
            occurredAt: item.completedAt ?? item.createdAt,
            title: item.title,
            description: item.description,
            actorName: item.assignedTcmName,
            clientName: consultant.currentClient,
            statusLabel: item.status,
            priority: item.priority,
            href: `${SUCCESS_ROOT}/consultants/${contractorId}?tab=actions&focus=${item.id}`,
        })
    }
    for (const row of (onboardingRes.data ?? []) as DbRow[]) {
        timeline.push({ id: `onboarding:${String(row.id)}`, type: 'onboarding', occurredAt: iso(row.submitted_at) ?? iso(row.scheduled_for) ?? iso(row.created_at) ?? '', title: 'Onboarding kontraktora', description: null, actorName: null, clientName: consultant.currentClient, statusLabel: text(row.status), priority: null, href: null })
    }
    for (const row of (exitRes.data ?? []) as DbRow[]) {
        timeline.push({ id: `exit:${String(row.id)}`, type: 'exit', occurredAt: iso(row.submitted_at) ?? iso(row.scheduled_for) ?? iso(row.created_at) ?? '', title: 'Exit interview kontraktora', description: null, actorName: null, clientName: consultant.currentClient, statusLabel: text(row.status), priority: null, href: null })
    }
    for (const item of placements) {
        timeline.push({ id: `placement:${item.id}`, type: 'placement', occurredAt: item.startDate, title: `Start u klienta ${item.clientName}`, description: item.position, actorName: null, clientName: item.clientName, statusLabel: item.status, priority: null, href: null })
    }
    for (const row of (healthHistoryRes.data ?? []) as DbRow[]) {
        const actorId = text(row.changed_by)
        timeline.push({ id: `health:${String(row.id)}`, type: 'health', occurredAt: iso(row.created_at) ?? '', title: `Kondycja: ${String(row.new_status)}`, description: text(row.reason), actorName: actorId ? tcms.names.get(actorId) ?? null : null, clientName: consultant.currentClient, statusLabel: text(row.new_status), priority: row.new_status === 'red' ? 'critical' : row.new_status === 'amber' ? 'high' : 'low', href: `${SUCCESS_ROOT}/consultants/${contractorId}?tab=overview&focus=health` })
    }
    timeline.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))

    const settings = settingsRes.data as DbRow | null
    return {
        consultant,
        monitoring: settings ? {
            state: (settings.monitoring_status ?? 'inactive') as SuccessConsultantDetail['monitoring'] extends infer T ? T extends { state: infer S } ? S : never : never,
            cadenceDays: Number(settings.check_in_cadence_days ?? 30),
            ownerTcmId: consultant.ownerTcmId,
            ownerTcmName: consultant.ownerTcmName,
            nextCheckInAt: iso(settings.next_check_in_on),
            monitoringStartedAt: iso(settings.monitoring_started_at),
            pausedAt: iso(settings.monitoring_paused_at),
            surveysEnabled: settings.surveys_enabled === true,
        } : null,
        health: healthFromSettings(settings ?? undefined, tcms.names),
        timeline,
        checkIns,
        feedback,
        pulseResponses,
        tasks,
        placements,
        tcmOptions: tcms.options,
    }
}

export async function getSuccessCheckInDetail(checkInId: string): Promise<SuccessCheckInDetail> {
    await requireSuccessManagerAction()
    if (!z.string().uuid().safeParse(checkInId).success) throw new Error('Nieprawidłowy identyfikator check-inu.')
    const allCheckIns = await loadSuccessCheckIns()
    const checkIn = allCheckIns.find((item) => item.id === checkInId)
    if (!checkIn) throw new Error('Check-in nie istnieje lub nie masz dostępu.')
    const detail = await getSuccessConsultantDetail(checkIn.contractorId)
    return {
        checkIn,
        consultant: detail.consultant,
        health: detail.health,
        previousCheckIns: detail.checkIns.filter((item) => item.id !== checkInId && item.status === 'completed').slice(0, 5),
        openTasks: detail.tasks.filter((item) => item.status !== 'done' && item.status !== 'cancelled'),
        latestFeedback: detail.feedback[0] ?? null,
        placements: detail.placements,
        tcmOptions: detail.tcmOptions,
    }
}

export async function getSuccessDashboard(): Promise<SuccessDashboard> {
    await requireSuccessManagerAction()
    const [consultants, checkIns] = await Promise.all([loadSuccessConsultants(), loadSuccessCheckIns()])
    const db = successDb()
    const [tasksRes, conversationsRes, requestsRes, historyRes, deliveriesRes] = await Promise.all([
        db.from('contractor_tasks').select('id, contractor_id, title, status, due_date, priority').limit(5000),
        db.from('contractor_conversations').select('id, contractor_id, note, status, follow_up_date, resolved_at').is('resolved_at', null).limit(5000),
        db.from('contractor_pulse_requests').select('id, contractor_id, status').in('status', ['scheduled', 'sent']).limit(5000),
        db.from('contractor_health_status_history').select('new_status, created_at').gte('created_at', new Date(Date.now() - 185 * DAY_MS).toISOString()).limit(5000),
        db.from('contractor_success_deliveries')
            .select('id, contractor_id, delivery_kind, channel, attempt_count, last_error, created_at')
            .eq('status', 'dead')
            .order('created_at', { ascending: false })
            .limit(50),
    ])
    assertDb(tasksRes.error, 'Nie udało się pobrać działań dashboardu')
    assertDb(conversationsRes.error, 'Nie udało się pobrać follow-upów dashboardu')
    assertDb(requestsRes.error, 'Nie udało się pobrać ankiet dashboardu')
    assertDb(deliveriesRes.error, 'Nie udało się pobrać niedostarczonych alertów')

    const consultantMap = new Map(consultants.map((item) => [item.contractorId, item]))
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const inSeven = addDays(today, 7)
    const openCheckIns = checkIns.filter((item) => item.status === 'scheduled' || item.status === 'in_progress')
    const priorityItems: SuccessPriorityItem[] = []

    for (const item of openCheckIns) {
        const day = dateOnly(item.scheduledAt)
        if (day > inSeven) continue
        priorityItems.push({
            id: item.id,
            kind: 'check_in',
            contractorId: item.contractorId,
            contractorName: item.contractorName,
            title: day < today ? 'Zaległy check-in' : day === today ? 'Check-in na dziś' : 'Nadchodzący check-in',
            subtitle: item.agenda,
            dueAt: item.scheduledAt,
            priority: day < today ? 'critical' : item.priority,
            href: `${SUCCESS_ROOT}/check-ins/${item.id}`,
        })
    }
    for (const row of (tasksRes.data ?? []) as DbRow[]) {
        if (row.status === 'done' || row.status === 'cancelled' || !row.contractor_id) continue
        const due = text(row.due_date)
        if (!due || due > inSeven) continue
        const consultant = consultantMap.get(String(row.contractor_id))
        if (!consultant) continue
        priorityItems.push({ id: String(row.id), kind: 'task', contractorId: consultant.contractorId, contractorName: consultant.fullName, title: text(row.title) ?? 'Działanie', subtitle: due < today ? 'Termin minął' : null, dueAt: due, priority: due < today ? 'critical' : uiPriority(row.priority), href: `${SUCCESS_ROOT}/consultants/${consultant.contractorId}?tab=actions&focus=${String(row.id)}` })
    }
    for (const row of (conversationsRes.data ?? []) as DbRow[]) {
        const due = text(row.follow_up_date)
        const urgent = row.status === 'pilne' || row.status === 'potrzebny_kontakt'
        if (!urgent && (!due || due > today)) continue
        const consultant = consultantMap.get(String(row.contractor_id))
        if (!consultant) continue
        priorityItems.push({ id: String(row.id), kind: 'follow_up', contractorId: consultant.contractorId, contractorName: consultant.fullName, title: 'Rozmowa wymaga follow-upu', subtitle: text(row.note), dueAt: due, priority: row.status === 'pilne' ? 'critical' : 'high', href: `${SUCCESS_ROOT}/consultants/${consultant.contractorId}?tab=timeline&focus=${String(row.id)}` })
    }
    for (const consultant of consultants.filter((item) => item.health.status === 'red' || item.health.status === 'amber')) {
        priorityItems.push({ id: `health:${consultant.contractorId}`, kind: 'health', contractorId: consultant.contractorId, contractorName: consultant.fullName, title: consultant.health.status === 'red' ? 'Czerwona kondycja' : 'Żółta kondycja', subtitle: consultant.health.reason, dueAt: consultant.health.reviewOn, priority: consultant.health.status === 'red' ? 'critical' : 'high', href: `${SUCCESS_ROOT}/consultants/${consultant.contractorId}?tab=overview&focus=health` })
    }
    const priorityRank: Record<SuccessPriorityItem['priority'], number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
    }
    priorityItems.sort(
        (a, b) =>
            priorityRank[a.priority] - priorityRank[b.priority]
            || (a.dueAt ?? '').localeCompare(b.dueAt ?? ''),
    )

    const healthDistribution = (['green', 'amber', 'red', 'unknown'] as const).map((status) => ({ status, count: consultants.filter((item) => item.health.status === status).length }))
    const monthRows = new Map<string, { period: string; green: number; amber: number; red: number; unknown: number }>()
    for (let offset = 5; offset >= 0; offset--) {
        const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
        const period = date.toISOString().slice(0, 7)
        monthRows.set(period, { period, green: 0, amber: 0, red: 0, unknown: 0 })
    }
    for (const row of (historyRes.data ?? []) as DbRow[]) {
        const period = String(row.created_at ?? '').slice(0, 7)
        const bucket = monthRows.get(period)
        const status = String(row.new_status)
        if (bucket && (status === 'green' || status === 'amber' || status === 'red' || status === 'unknown')) bucket[status] += 1
    }

    const openTasks = ((tasksRes.data ?? []) as DbRow[]).filter((row) => row.status !== 'done' && row.status !== 'cancelled').length
    const deadDeliveries: SuccessDeadDelivery[] = ((deliveriesRes.data ?? []) as DbRow[]).map((row) => {
        const contractorId = text(row.contractor_id)
        return {
            id: String(row.id),
            contractorId,
            contractorName: contractorId ? consultantMap.get(contractorId)?.fullName ?? null : null,
            deliveryKind: String(row.delivery_kind),
            channel: row.channel as SuccessDeadDelivery['channel'],
            attemptCount: Number(row.attempt_count ?? 0),
            lastError: text(row.last_error),
            createdAt: String(row.created_at),
        }
    })
    return {
        generatedAt: now.toISOString(),
        stats: {
            monitored: consultants.filter((item) => item.monitoringState === 'active').length,
            dueToday: openCheckIns.filter((item) => dateOnly(item.scheduledAt) === today).length,
            overdue: openCheckIns.filter((item) => dateOnly(item.scheduledAt) < today).length,
            upcoming7Days: openCheckIns.filter((item) => dateOnly(item.scheduledAt) > today && dateOnly(item.scheduledAt) <= inSeven).length,
            openTasks,
            atRisk: consultants.filter((item) => item.health.status === 'amber' || item.health.status === 'red').length,
            awaitingPulse: ((requestsRes.data ?? []) as DbRow[]).length,
        },
        priorityItems: priorityItems.slice(0, 100),
        upcomingCheckIns: openCheckIns.filter((item) => dateOnly(item.scheduledAt) >= today).slice(0, 12),
        healthDistribution,
        healthHistory: Array.from(monthRows.values()),
        deadDeliveries,
    }
}

const uuid = z.string().uuid()
const contractorStatus = z.enum(['prospect', 'onboarding', 'active', 'offboarding', 'exited'])
const checkInType = z.enum(['regular', 'ad_hoc', 'emergency', 'feedback'])
const contactChannel = z.enum(['phone', 'video', 'in_person', 'email', 'other'])
const priority = z.enum(['low', 'medium', 'high', 'critical'])

const activateSchema = z.object({
    contractorId: uuid,
    cadenceDays: z.coerce.number().int().min(7).max(180),
    ownerTcmId: uuid,
    nextCheckInOn: z.string().date(),
    contractorStatus,
    surveysEnabled: z.boolean(),
})

const scheduleSchema = z.object({
    contractorId: uuid,
    scheduledAt: z.string().min(10),
    type: checkInType,
    channel: contactChannel.nullish(),
    priority,
    agenda: z.string().trim().max(5000).nullish(),
})

const rescheduleSchema = z.object({
    checkInId: uuid,
    scheduledAt: z.string().min(10),
})

const actionStepSchema = z.object({
    title: z.string().trim().min(1).max(240),
    description: z.string().trim().max(5000).nullish(),
    dueDate: z.string().date(),
    priority,
    assignedTcmId: uuid.nullish(),
})

const completeSchema = z.object({
    checkInId: uuid,
    actualAt: z.string().min(10),
    notes: z.string().trim().min(1).max(50_000),
    channel: contactChannel.nullish(),
    durationMinutes: z.coerce.number().int().min(1).max(1440).nullish(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    actionSteps: z.array(actionStepSchema).max(30),
})

const feedbackSchema = z.object({
    contractorId: uuid,
    checkInId: uuid.nullish(),
    placementId: uuid.nullish(),
    feedbackDate: z.string().date(),
    clientName: z.string().trim().min(1).max(240),
    sourceName: z.string().trim().max(240).nullish(),
    technicalScore: z.coerce.number().int().min(1).max(5),
    communicationScore: z.coerce.number().int().min(1).max(5),
    reliabilityScore: z.coerce.number().int().min(1).max(5),
    engagementScore: z.coerce.number().int().min(1).max(5),
    strengths: z.string().trim().max(10_000).nullish(),
    improvementAreas: z.string().trim().max(10_000).nullish(),
    recommendations: z.string().trim().max(10_000).nullish(),
    willingToContinue: z.enum([
        'definitely_yes',
        'yes',
        'neutral',
        'no',
        'definitely_no',
        'not_asked',
    ]).nullish(),
    priority,
})

function revalidateSuccess(contractorId?: string): void {
    revalidatePath(SUCCESS_ROOT)
    revalidatePath(`${SUCCESS_ROOT}/consultants`)
    revalidatePath(`${SUCCESS_ROOT}/check-ins`)
    revalidatePath(`${SUCCESS_ROOT}/analytics`)
    if (contractorId) revalidatePath(`${SUCCESS_ROOT}/consultants/${contractorId}`)
}

export async function activateSuccessMonitoring(input: ActivateSuccessMonitoringInput): Promise<void> {
    const ctx = await requireSuccessManagerAction()
    const parsed = activateSchema.parse(input)
    const db = successDb()

    const [{ data: contractor, error: contractorError }, { data: owner, error: ownerError }] = await Promise.all([
        db.from('contractors').select('id, email').eq('id', parsed.contractorId).maybeSingle(),
        db.from('profiles').select('id, role').eq('id', parsed.ownerTcmId).maybeSingle(),
    ])
    assertDb(contractorError, 'Nie udało się sprawdzić konsultanta')
    assertDb(ownerError, 'Nie udało się sprawdzić opiekuna')
    if (!contractor) throw new Error('Konsultant nie istnieje.')
    if (!owner || !['admin', 'talent_community'].includes(String(owner.role))) throw new Error('Opiekunem może być tylko TCM lub admin.')
    if (parsed.surveysEnabled && !text(contractor.email)) throw new Error('Uzupełnij email konsultanta przed włączeniem ankiet.')

    const now = new Date().toISOString()
    const { error: contractorUpdateError } = await db.from('contractors').update({
        owner_tcm_id: parsed.ownerTcmId,
        status: parsed.contractorStatus,
        updated_at: now,
    }).eq('id', parsed.contractorId)
    assertDb(contractorUpdateError, 'Nie udało się przypisać opiekuna')

    const { error } = await db.from('contractor_success_settings').upsert({
        contractor_id: parsed.contractorId,
        monitoring_status: 'active',
        status_verified_at: now,
        status_verified_by: ctx.userId,
        check_in_cadence_days: parsed.cadenceDays,
        next_check_in_on: parsed.nextCheckInOn,
        surveys_enabled: parsed.surveysEnabled,
        monitoring_started_at: now,
        monitoring_started_by: ctx.userId,
        monitoring_paused_at: null,
        monitoring_paused_by: null,
        created_by: ctx.userId,
        updated_by: ctx.userId,
        updated_at: now,
    }, { onConflict: 'contractor_id' })
    assertDb(error, 'Nie udało się aktywować monitoringu')
    await logAudit(ctx.userId, 'CONSULTANT_SUCCESS_MONITORING_ACTIVATED', {
        contractor_id: parsed.contractorId,
        owner_tcm_id: parsed.ownerTcmId,
        cadence_days: parsed.cadenceDays,
        next_check_in_on: parsed.nextCheckInOn,
        surveys_enabled: parsed.surveysEnabled,
    })
    revalidateSuccess(parsed.contractorId)
}

export async function pauseSuccessMonitoring(input: PauseSuccessMonitoringInput): Promise<void> {
    const ctx = await requireSuccessManagerAction()
    const contractorId = uuid.parse(input.contractorId)
    const now = new Date().toISOString()
    const db = successDb()
    const { error } = await db.from('contractor_success_settings').update({
        monitoring_status: 'paused',
        monitoring_paused_at: now,
        monitoring_paused_by: ctx.userId,
        updated_by: ctx.userId,
        updated_at: now,
    }).eq('contractor_id', contractorId)
    assertDb(error, 'Nie udało się wstrzymać monitoringu')
    await logAudit(ctx.userId, 'CONSULTANT_SUCCESS_MONITORING_PAUSED', { contractor_id: contractorId })
    revalidateSuccess(contractorId)
}

export async function scheduleSuccessCheckIn(input: ScheduleSuccessCheckInInput): Promise<void> {
    const ctx = await requireSuccessManagerAction()
    const parsed = scheduleSchema.parse(input)
    const db = successDb()
    const { data: contractor, error: contractorError } = await db
        .from('contractors')
        .select('id, owner_tcm_id')
        .eq('id', parsed.contractorId)
        .maybeSingle()
    assertDb(contractorError, 'Nie udało się sprawdzić konsultanta')
    if (!contractor) throw new Error('Konsultant nie istnieje.')

    const scheduledAt = asScheduledIso(parsed.scheduledAt)
    const { data, error } = await db.from('contractor_check_ins').insert({
        contractor_id: parsed.contractorId,
        check_in_type: parsed.type,
        status: 'scheduled',
        scheduled_at: scheduledAt,
        assigned_tcm_id: contractor.owner_tcm_id || ctx.userId,
        channel: parsed.channel || null,
        priority: dbPriority(parsed.priority),
        agenda: parsed.agenda || null,
        created_by: ctx.userId,
        updated_by: ctx.userId,
    }).select('id').single()
    assertDb(error, 'Nie udało się zaplanować check-inu')

    await db.from('contractor_success_settings').update({
        next_check_in_on: dateOnly(scheduledAt),
        updated_by: ctx.userId,
        updated_at: new Date().toISOString(),
    }).eq('contractor_id', parsed.contractorId)
    await logAudit(ctx.userId, 'CONSULTANT_SUCCESS_CHECK_IN_SCHEDULED', {
        contractor_id: parsed.contractorId,
        check_in_id: data?.id,
        scheduled_at: scheduledAt,
        type: parsed.type,
    })
    revalidateSuccess(parsed.contractorId)
}

export async function rescheduleSuccessCheckIn(input: RescheduleSuccessCheckInInput): Promise<void> {
    const ctx = await requireSuccessManagerAction()
    const parsed = rescheduleSchema.parse(input)
    const scheduledAt = asScheduledIso(parsed.scheduledAt)
    const db = successDb()
    const { data: checkIn, error: lookupError } = await db
        .from('contractor_check_ins')
        .select('id, contractor_id, status, scheduled_at')
        .eq('id', parsed.checkInId)
        .maybeSingle()
    assertDb(lookupError, 'Nie udało się sprawdzić check-inu')
    if (!checkIn) throw new Error('Check-in nie istnieje.')
    if (checkIn.status !== 'scheduled' && checkIn.status !== 'in_progress') {
        throw new Error('Można przełożyć tylko aktywny check-in.')
    }

    const now = new Date().toISOString()
    const { error } = await db
        .from('contractor_check_ins')
        .update({
            scheduled_at: scheduledAt,
            status: 'scheduled',
            updated_by: ctx.userId,
            updated_at: now,
        })
        .eq('id', parsed.checkInId)
        .in('status', ['scheduled', 'in_progress'])
    assertDb(error, 'Nie udało się przełożyć check-inu')

    await db
        .from('contractor_success_settings')
        .update({
            next_check_in_on: dateOnly(scheduledAt),
            updated_by: ctx.userId,
            updated_at: now,
        })
        .eq('contractor_id', checkIn.contractor_id)

    await logAudit(ctx.userId, 'CONSULTANT_SUCCESS_CHECK_IN_RESCHEDULED', {
        contractor_id: checkIn.contractor_id,
        check_in_id: parsed.checkInId,
        previous_scheduled_at: checkIn.scheduled_at,
        scheduled_at: scheduledAt,
    })
    revalidateSuccess(String(checkIn.contractor_id))
}

export async function completeSuccessCheckIn(input: CompleteSuccessCheckInInput): Promise<void> {
    await requireSuccessManagerAction()
    const parsed = completeSchema.parse(input)
    // This RPC is deliberately SECURITY INVOKER. It must run with the request
    // user's JWT so auth.uid() and the lifecycle RLS policies remain effective.
    const db = successUserDb()
    const { data: checkIn, error: checkInError } = await db
        .from('contractor_check_ins')
        .select('id, contractor_id')
        .eq('id', parsed.checkInId)
        .maybeSingle()
    assertDb(checkInError, 'Nie udało się sprawdzić check-inu')
    if (!checkIn) throw new Error('Check-in nie istnieje.')
    const { data: settings } = await db
        .from('contractor_success_settings')
        .select('check_in_cadence_days')
        .eq('contractor_id', checkIn.contractor_id)
        .maybeSingle()
    const cadenceDays = Number(settings?.check_in_cadence_days ?? 30)
    const nextCheckInOn = addDays(parsed.actualAt, cadenceDays)
    const summary = parsed.notes.split('\n').map((line) => line.trim()).find(Boolean)?.slice(0, 500) ?? 'Check-in zakończony'

    const { error } = await db.rpc('complete_contractor_check_in', {
        p_check_in_id: parsed.checkInId,
        p_summary: summary,
        p_notes: parsed.notes,
        p_occurred_at: new Date(parsed.actualAt).toISOString(),
        p_channel: parsed.channel || null,
        p_duration_minutes: parsed.durationMinutes ?? null,
        p_tags: parsed.tags ?? [],
        p_health_status: null,
        p_health_status_reason: null,
        p_health_review_on: null,
        p_next_check_in_on: nextCheckInOn,
        p_action_steps: parsed.actionSteps.map((step) => ({
            title: step.title,
            description: step.description || null,
            due_date: step.dueDate,
            priority: dbPriority(step.priority),
            assigned_tcm_id: step.assignedTcmId || null,
        })),
    })
    assertDb(error, 'Nie udało się zakończyć check-inu')
    // The database completion trigger writes the durable audit event inside the
    // same transaction, so we intentionally avoid a duplicate app-level entry.
    revalidateSuccess(String(checkIn.contractor_id))
}

export async function addSuccessClientFeedback(input: AddSuccessClientFeedbackInput): Promise<void> {
    const ctx = await requireSuccessManagerAction()
    const parsed = feedbackSchema.parse(input)
    const average = (parsed.technicalScore + parsed.communicationScore + parsed.reliabilityScore + parsed.engagementScore) / 4
    const db = successDb()
    const { data, error } = await db.from('contractor_client_feedback').insert({
        contractor_id: parsed.contractorId,
        placement_id: parsed.placementId || null,
        source_check_in_id: parsed.checkInId || null,
        feedback_date: parsed.feedbackDate,
        client_name_snapshot: parsed.clientName,
        provided_by_role: 'client',
        provided_by_name: parsed.sourceName || null,
        overall_rating: average,
        technical_rating: parsed.technicalScore,
        communication_rating: parsed.communicationScore,
        reliability_rating: parsed.reliabilityScore,
        engagement_rating: parsed.engagementScore,
        willing_to_continue: parsed.willingToContinue || null,
        risk_level: dbPriority(parsed.priority),
        strengths: parsed.strengths || null,
        improvement_areas: parsed.improvementAreas || null,
        recommended_actions: parsed.recommendations || null,
        recorded_by: ctx.userId,
    }).select('id').single()
    assertDb(error, 'Nie udało się zapisać feedbacku')
    await logAudit(ctx.userId, 'CONSULTANT_SUCCESS_CLIENT_FEEDBACK_ADDED', {
        contractor_id: parsed.contractorId,
        feedback_id: data?.id,
        check_in_id: parsed.checkInId || null,
        risk_level: dbPriority(parsed.priority),
    })
    revalidateSuccess(parsed.contractorId)
}

export async function setSuccessHealthStatus(input: SetSuccessHealthStatusInput): Promise<void> {
    const ctx = await requireSuccessManagerAction()
    const schema = z.discriminatedUnion('status', [
        z.object({
            contractorId: uuid,
            status: z.enum(['unknown', 'green']),
            reason: z.string().trim().max(5000).nullish(),
            reviewOn: z.null().optional(),
        }),
        z.object({ contractorId: uuid, status: z.enum(['amber', 'red']), reason: z.string().trim().min(1).max(5000), reviewOn: z.string().date() }),
    ])
    const parsed = schema.parse(input)
    const now = new Date().toISOString()
    const db = successDb()
    const { error } = await db.from('contractor_success_settings').update({
        health_status: parsed.status,
        health_status_reason: parsed.reason || null,
        health_review_on: parsed.status === 'amber' || parsed.status === 'red' ? parsed.reviewOn : null,
        health_status_source: 'manual',
        health_status_source_id: null,
        health_reviewed_at: now,
        health_reviewed_by: ctx.userId,
        health_status_set_at: now,
        health_status_set_by: ctx.userId,
        updated_by: ctx.userId,
        updated_at: now,
    }).eq('contractor_id', parsed.contractorId)
    assertDb(error, 'Nie udało się zmienić kondycji')
    // The settings history trigger records both the immutable health history and
    // the audit event atomically with this update.
    revalidateSuccess(parsed.contractorId)
}

export async function createSuccessTask(input: CreateSuccessTaskInput): Promise<void> {
    const ctx = await requireSuccessManagerAction()
    const parsed = z.object({
        contractorId: uuid,
        checkInId: uuid.nullish(),
        title: z.string().trim().min(1).max(240),
        description: z.string().trim().max(5000).nullish(),
        dueDate: z.string().date().nullish(),
        priority,
        assignedTcmId: uuid.nullish(),
    }).parse(input)
    const db = successDb()
    let assignee = parsed.assignedTcmId || null
    if (!assignee) {
        const { data: contractor } = await db.from('contractors').select('owner_tcm_id').eq('id', parsed.contractorId).maybeSingle()
        assignee = contractor?.owner_tcm_id || ctx.userId
    }
    const { data, error } = await db.from('contractor_tasks').insert({
        contractor_id: parsed.contractorId,
        source_check_in_id: parsed.checkInId || null,
        task_kind: 'success_action',
        title: parsed.title,
        description: parsed.description || null,
        status: 'todo',
        priority: dbPriority(parsed.priority),
        assigned_tcm_id: assignee,
        due_date: parsed.dueDate || null,
        original_due_date: parsed.dueDate || null,
        created_by: ctx.userId,
    }).select('id').single()
    assertDb(error, 'Nie udało się utworzyć działania')
    await logAudit(ctx.userId, 'CONTRACTOR_TASK_CREATED', {
        contractor_id: parsed.contractorId,
        task_id: data?.id,
        kind: 'success_action',
    })
    revalidateSuccess(parsed.contractorId)
}

export async function updateSuccessTask(input: UpdateSuccessTaskInput): Promise<void> {
    const ctx = await requireSuccessManagerAction()
    const parsed = z.object({ taskId: uuid, status: z.enum(['todo', 'in_progress', 'done', 'cancelled']) }).parse(input)
    const db = successDb()
    const { data: task, error: lookupError } = await db.from('contractor_tasks').select('id, contractor_id').eq('id', parsed.taskId).maybeSingle()
    assertDb(lookupError, 'Nie udało się sprawdzić działania')
    if (!task) throw new Error('Działanie nie istnieje.')
    const completedAt = parsed.status === 'done' || parsed.status === 'cancelled' ? new Date().toISOString() : null
    const { error } = await db.from('contractor_tasks').update({ status: parsed.status, completed_at: completedAt }).eq('id', parsed.taskId)
    assertDb(error, 'Nie udało się zaktualizować działania')
    await logAudit(ctx.userId, 'CONTRACTOR_TASK_UPDATED', { task_id: parsed.taskId, status: parsed.status })
    revalidateSuccess(text(task.contractor_id) ?? undefined)
}

export async function retrySuccessDelivery(input: RetrySuccessDeliveryInput): Promise<void> {
    const ctx = await requireSuccessManagerAction()
    const deliveryId = uuid.parse(input.deliveryId)
    const db = successDb()
    const { data: delivery, error: lookupError } = await db
        .from('contractor_success_deliveries')
        .select('id, contractor_id, status, delivery_kind, channel')
        .eq('id', deliveryId)
        .maybeSingle()
    assertDb(lookupError, 'Nie udało się sprawdzić dostawy')
    if (!delivery || delivery.status !== 'dead') {
        throw new Error('Dostawa nie istnieje albo nie jest w dead-letter queue.')
    }

    const now = new Date().toISOString()
    const { error } = await db
        .from('contractor_success_deliveries')
        .update({
            status: 'retry',
            available_at: now,
            attempt_count: 0,
            claimed_at: null,
            claimed_by: null,
            lease_expires_at: null,
            last_error: null,
            sent_at: null,
            updated_at: now,
        })
        .eq('id', deliveryId)
        .eq('status', 'dead')
    assertDb(error, 'Nie udało się ponowić dostawy')
    await logAudit(ctx.userId, 'CONSULTANT_SUCCESS_DELIVERY_RETRIED', {
        delivery_id: deliveryId,
        contractor_id: delivery.contractor_id,
        delivery_kind: delivery.delivery_kind,
        channel: delivery.channel,
    })
    revalidateSuccess(text(delivery.contractor_id) ?? undefined)
}

export async function sendSuccessPulseSurvey(input: SendSuccessPulseSurveyInput): Promise<void> {
    const ctx = await requireSuccessManagerAction()
    if (!areConsultantSuccessSurveysEnabled()) {
        throw new Error('Ankiety Consultant Success są obecnie wyłączone.')
    }
    const parsed = z.object({ contractorId: uuid, checkInId: uuid.nullish() }).parse(input)
    const db = successDb()
    const [{ data: contractor, error: contractorError }, { data: settings, error: settingsError }] = await Promise.all([
        db.from('contractors').select('id, full_name, email, owner_tcm_id').eq('id', parsed.contractorId).maybeSingle(),
        db.from('contractor_success_settings').select('monitoring_status, surveys_enabled').eq('contractor_id', parsed.contractorId).maybeSingle(),
    ])
    assertDb(contractorError, 'Nie udało się sprawdzić konsultanta')
    assertDb(settingsError, 'Nie udało się sprawdzić ustawień ankiet')
    if (!contractor) throw new Error('Konsultant nie istnieje.')
    if (!settings || settings.monitoring_status !== 'active' || settings.surveys_enabled !== true) throw new Error('Ankiety nie są włączone dla tej osoby.')
    const recipientEmail = text(contractor.email)
    if (!recipientEmail) throw new Error('Konsultant nie ma uzupełnionego emaila.')

    const { count, error: activeError } = await db
        .from('contractor_pulse_requests')
        .select('id', { count: 'exact', head: true })
        .eq('contractor_id', parsed.contractorId)
        .in('status', ['draft', 'scheduled', 'sent'])
    assertDb(activeError, 'Nie udało się sprawdzić aktywnych ankiet')
    if ((count ?? 0) > 0) throw new Error('Ta osoba ma już aktywną ankietę.')

    const requestId = randomUUID()
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 14 * DAY_MS).toISOString()
    const secret = getPulseTokenSecret()
    const token = createPulseToken(requestId, expiresAt, secret)
    const tokenHash = hashPulseToken(token)
    const { error: requestError } = await db.from('contractor_pulse_requests').insert({
        id: requestId,
        contractor_id: parsed.contractorId,
        source_check_in_id: parsed.checkInId || null,
        token_hash: tokenHash,
        status: 'scheduled',
        delivery_channel: 'email',
        recipient_email_snapshot: recipientEmail,
        scheduled_for: now.toISOString(),
        expires_at: expiresAt,
        next_reminder_at: new Date(now.getTime() + 3 * DAY_MS).toISOString(),
        created_by: ctx.userId,
    })
    assertDb(requestError, 'Nie udało się utworzyć ankiety')

    const { error: deliveryError } = await db.from('contractor_success_deliveries').insert({
        dedupe_key: `survey:${requestId}:invitation`,
        contractor_id: parsed.contractorId,
        entity_id: requestId,
        delivery_kind: 'pulse_invitation',
        channel: 'email',
        recipient_email: recipientEmail,
        payload: { request_id: requestId, contractor_name: text(contractor.full_name) ?? 'Konsultant' },
        status: 'pending',
        available_at: now.toISOString(),
    })
    if (deliveryError) {
        await db.from('contractor_pulse_requests').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), cancelled_by: ctx.userId }).eq('id', requestId)
        throw new Error(`Nie udało się zaplanować wysyłki ankiety: ${deliveryError.message}`)
    }
    await logAudit(ctx.userId, 'CONSULTANT_SUCCESS_PULSE_SENT', {
        contractor_id: parsed.contractorId,
        request_id: requestId,
        check_in_id: parsed.checkInId || null,
        expires_at: expiresAt,
    })
    revalidateSuccess(parsed.contractorId)
}
