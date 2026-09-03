import type { SupabaseClient } from '@supabase/supabase-js'

// Generated database types are refreshed after migrations are applied. This
// local untyped alias keeps the automation implementation deployable in the
// same commit as its migration without weakening any browser-side client.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SuccessAdminClient = SupabaseClient<any>

export type DeliveryChannel = 'in_app' | 'email' | 'push'
export type DeliveryKind =
    | 'check_in_due'
    | 'task_due'
    | 'conversation_follow_up'
    | 'pulse_invitation'
    | 'pulse_reminder'
    | 'pulse_low_alert'
    | 'health_review'

export type DeliveryStatus =
    | 'pending'
    | 'processing'
    | 'retry'
    | 'sent'
    | 'dead'
    | 'skipped_no_subscription'
    | 'cancelled'

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface SuccessDeliveryPayload {
    milestone?: string
    title_pl?: string
    title_en?: string
    body_pl?: string
    body_en?: string
    action_url?: string
    priority?: NotificationPriority
    due_on?: string
}

export interface SuccessDeliveryRow {
    id: string
    delivery_kind: DeliveryKind
    entity_id: string
    contractor_id: string | null
    recipient_user_id: string | null
    recipient_email: string | null
    channel: DeliveryChannel
    dedupe_key: string
    available_at: string
    status: DeliveryStatus
    attempt_count: number
    max_attempts: number
    lease_expires_at: string | null
    payload: SuccessDeliveryPayload | null
}

export interface PlannerStats {
    programCandidates: number
    programEnrolled: number
    programGraduated: number
    settingsScanned: number
    checkInsMaterialized: number
    checkInsAlreadyPlanned: number
    checkInsScanned: number
    tasksScanned: number
    conversationsScanned: number
    healthReviewsScanned: number
    pulseRequestsScanned: number
    pulseRequestsExpired: number
    lowPulseResponses: number
    deliveriesPlanned: number
    deliveriesInserted: number
    unassigned: number
    missingRecipientEmail: number
    shadowMode: boolean
    durationMs: number
}

export interface DispatcherStats {
    claimed: number
    sent: number
    retried: number
    dead: number
    skippedNoSubscription: number
    cancelled: number
    deferredQuietHours: number
    errors: number
    durationMs: number
}

export interface PlannedDelivery {
    delivery_kind: DeliveryKind
    entity_id: string
    contractor_id: string | null
    recipient_user_id: string | null
    recipient_email: string | null
    channel: DeliveryChannel
    dedupe_key: string
    available_at: string
    status: 'pending'
    payload: SuccessDeliveryPayload
}
