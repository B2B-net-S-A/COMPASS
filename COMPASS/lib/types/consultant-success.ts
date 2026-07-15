/**
 * Stable UI contract for the private Consultant Success workspace.
 *
 * All timestamps are serialized ISO strings so the same shapes can cross the
 * Server Component boundary without custom serialization.
 */

export type SuccessMonitoringState = 'inactive' | 'active' | 'paused'
export type SuccessHealthStatus = 'unknown' | 'green' | 'amber' | 'red'
export type SuccessPriority = 'low' | 'medium' | 'high' | 'critical'
export type SuccessCheckInStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'rescheduled'
export type SuccessCheckInType = 'regular' | 'ad_hoc' | 'emergency' | 'feedback' | 'risk' | 'onboarding' | 'offboarding'
export type SuccessContactChannel = 'phone' | 'video' | 'in_person' | 'email' | 'other'
export type SuccessTaskStatus = 'todo' | 'in_progress' | 'done' | 'cancelled'
export type SuccessTimelineEventType =
    | 'conversation'
    | 'check_in'
    | 'client_feedback'
    | 'pulse'
    | 'task'
    | 'onboarding'
    | 'exit'
    | 'placement'
    | 'health'

export interface SuccessHealth {
    status: SuccessHealthStatus
    reason: string | null
    reviewOn: string | null
    setAt: string | null
    setByName: string | null
}

export interface SuccessMonitoringSettings {
    state: SuccessMonitoringState
    cadenceDays: number
    ownerTcmId: string | null
    ownerTcmName: string | null
    nextCheckInAt: string | null
    monitoringStartedAt: string | null
    pausedAt: string | null
    surveysEnabled: boolean
}

export interface SuccessConsultantListItem {
    contractorId: string
    fullName: string
    email: string | null
    phone: string | null
    currentClient: string | null
    currentPosition: string | null
    contractorStatus: 'prospect' | 'onboarding' | 'active' | 'offboarding' | 'exited'
    statusVerifiedAt: string | null
    ownerTcmId: string | null
    ownerTcmName: string | null
    monitoringState: SuccessMonitoringState
    cadenceDays: number | null
    health: SuccessHealth
    lastContactAt: string | null
    nextCheckInAt: string | null
    openTaskCount: number
    overdueTaskCount: number
}

export interface SuccessTimelineEvent {
    id: string
    type: SuccessTimelineEventType
    occurredAt: string
    title: string
    description: string | null
    actorName: string | null
    clientName: string | null
    statusLabel: string | null
    priority: SuccessPriority | null
    href: string | null
}

export interface SuccessCheckInListItem {
    id: string
    contractorId: string
    contractorName: string
    clientName: string | null
    ownerTcmId: string | null
    ownerTcmName: string | null
    scheduledAt: string
    actualAt: string | null
    status: SuccessCheckInStatus
    type: SuccessCheckInType
    channel: SuccessContactChannel | null
    priority: SuccessPriority
    agenda: string | null
    notes: string | null
    durationMinutes: number | null
    tags: string[]
    openTaskCount: number
    pulseStatus: 'not_requested' | 'pending' | 'completed'
}

export interface SuccessClientFeedback {
    id: string
    contractorId: string
    checkInId: string | null
    placementId: string | null
    feedbackDate: string
    clientName: string
    sourceName: string | null
    technicalScore: number
    communicationScore: number
    reliabilityScore: number
    engagementScore: number
    averageScore: number
    strengths: string | null
    improvementAreas: string | null
    recommendations: string | null
    willingToContinue: 'definitely_yes' | 'yes' | 'neutral' | 'no' | 'definitely_no' | 'not_asked' | null
    priority: SuccessPriority
    createdByName: string | null
    createdAt: string
}

export interface SuccessPulseResponse {
    id: string
    contractorId: string
    checkInId: string | null
    satisfactionScore: number
    engagementScore: number
    recommendationScore: number
    overallScore: number
    note: string | null
    source: 'recorded_by_tcm' | 'token'
    recordedAt: string
}

export interface SuccessTask {
    id: string
    contractorId: string | null
    checkInId: string | null
    title: string
    description: string | null
    status: SuccessTaskStatus
    priority: SuccessPriority
    assignedTcmId: string | null
    assignedTcmName: string | null
    dueDate: string | null
    originalDueDate: string | null
    snoozedUntil: string | null
    completedAt: string | null
    outcome: string | null
    createdAt: string
}

export interface SuccessPlacement {
    id: string
    clientName: string
    position: string | null
    startDate: string
    status: string
}

export interface SuccessTcmOption {
    id: string
    name: string
}

export interface SuccessConsultantDetail {
    consultant: SuccessConsultantListItem
    monitoring: SuccessMonitoringSettings | null
    health: SuccessHealth
    timeline: SuccessTimelineEvent[]
    checkIns: SuccessCheckInListItem[]
    feedback: SuccessClientFeedback[]
    pulseResponses: SuccessPulseResponse[]
    tasks: SuccessTask[]
    placements: SuccessPlacement[]
    tcmOptions: SuccessTcmOption[]
}

export type SuccessPriorityItemKind = 'check_in' | 'task' | 'feedback' | 'health' | 'follow_up'

export interface SuccessPriorityItem {
    id: string
    kind: SuccessPriorityItemKind
    contractorId: string
    contractorName: string
    title: string
    subtitle: string | null
    dueAt: string | null
    priority: SuccessPriority
    href: string
}

export interface SuccessDashboard {
    generatedAt: string
    stats: {
        monitored: number
        dueToday: number
        overdue: number
        upcoming7Days: number
        openTasks: number
        atRisk: number
        awaitingPulse: number
    }
    priorityItems: SuccessPriorityItem[]
    upcomingCheckIns: SuccessCheckInListItem[]
    healthDistribution: Array<{ status: SuccessHealthStatus; count: number }>
    healthHistory: Array<{ period: string; green: number; amber: number; red: number; unknown: number }>
    deadDeliveries: SuccessDeadDelivery[]
}

export interface SuccessDeadDelivery {
    id: string
    contractorId: string | null
    contractorName: string | null
    deliveryKind: string
    channel: 'in_app' | 'email' | 'push'
    attemptCount: number
    lastError: string | null
    createdAt: string
}

export interface SuccessCheckInDetail {
    checkIn: SuccessCheckInListItem
    consultant: SuccessConsultantListItem
    health: SuccessHealth
    previousCheckIns: SuccessCheckInListItem[]
    openTasks: SuccessTask[]
    latestFeedback: SuccessClientFeedback | null
    tcmOptions: SuccessTcmOption[]
    placements: SuccessPlacement[]
}

export interface ActivateSuccessMonitoringInput {
    contractorId: string
    cadenceDays: number
    ownerTcmId: string
    nextCheckInOn: string
    contractorStatus: SuccessConsultantListItem['contractorStatus']
    surveysEnabled: boolean
}

export interface PauseSuccessMonitoringInput {
    contractorId: string
}

export interface ScheduleSuccessCheckInInput {
    contractorId: string
    scheduledAt: string
    type: SuccessCheckInType
    channel?: SuccessContactChannel | null
    priority: SuccessPriority
    agenda?: string | null
}

export interface RescheduleSuccessCheckInInput {
    checkInId: string
    scheduledAt: string
}

export interface CompleteSuccessCheckInInput {
    checkInId: string
    actualAt: string
    notes: string
    channel?: SuccessContactChannel | null
    durationMinutes?: number | null
    tags?: string[]
    actionSteps: SuccessActionStepInput[]
}

export interface SuccessActionStepInput {
    title: string
    description?: string | null
    dueDate: string
    priority: SuccessPriority
    assignedTcmId?: string | null
}

export interface AddSuccessClientFeedbackInput {
    contractorId: string
    checkInId?: string | null
    placementId?: string | null
    feedbackDate: string
    clientName: string
    sourceName?: string | null
    technicalScore: number
    communicationScore: number
    reliabilityScore: number
    engagementScore: number
    strengths?: string | null
    improvementAreas?: string | null
    recommendations?: string | null
    willingToContinue?: SuccessClientFeedback['willingToContinue']
    priority: SuccessPriority
}

export type SetSuccessHealthStatusInput =
    | {
        contractorId: string
        status: 'unknown' | 'green'
        reason?: string | null
        reviewOn?: null
    }
    | {
        contractorId: string
        status: 'amber' | 'red'
        reason: string
        reviewOn: string
    }

export interface CreateSuccessTaskInput {
    contractorId: string
    checkInId?: string | null
    title: string
    description?: string | null
    dueDate?: string | null
    priority: SuccessPriority
    assignedTcmId?: string | null
}

export interface UpdateSuccessTaskInput {
    taskId: string
    status?: SuccessTaskStatus
    title?: string
    description?: string | null
    dueDate?: string | null
    priority?: SuccessPriority
    assignedTcmId?: string | null
    snoozedUntil?: string | null
    outcome?: string | null
}

export interface DeleteSuccessTaskInput {
    taskId: string
}

export interface RetrySuccessDeliveryInput {
    deliveryId: string
}

export interface SendSuccessPulseSurveyInput {
    contractorId: string
    checkInId?: string | null
}
