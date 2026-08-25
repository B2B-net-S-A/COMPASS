export type Project = {
    id: string
    title: string
    description: string
    required_skills: string[]
    budget_range: string
    created_at: string
    file_url?: string
    position?: string
    max_rate?: string
    location?: string
    work_type?: string
    required_languages?: string[]
    start_date?: string
    recommendation_deadline?: string
    manager_name?: string
    description_pl?: string
    // Embedding is huge, no need to include in frontend type unless needed
}

export interface ProjectMatch {
    id: string
    full_name: string
    avatar_url: string
    job_title: string
    similarity: number
    ai_recommendation?: string
    ai_reasoning?: string
}

export type FavoriteProject = {
    id: string
    user_id: string
    project_id: string
    created_at: string
    note: string | null
}

export interface ProjectWithFavorite extends ProjectMatch {
    isFavorite?: boolean
}

// Rekomendacje projektowe
export type ReferralType = 'external_person' | 'self_referral'
export type ReferralStatus = 'new' | 'in_review' | 'accepted' | 'rejected' | 'hired' | 'withdrawn'

export interface ProjectReferral {
    id: string
    project_id: string
    referrer_user_id: string
    referral_type: ReferralType
    status: ReferralStatus

    // Scieżka A: Rekomendacja innej osoby
    candidate_name?: string
    candidate_email?: string
    candidate_phone?: string
    candidate_linkedin?: string
    cv_file_url?: string
    cv_file_name?: string
    relationship_type?: 'coworker' | 'industry_contact' | 'former_project' | 'linkedin' | 'other'
    recommendation_note?: string
    candidate_interested?: 'yes' | 'no' | 'not_asked'
    expected_rate?: number
    gdpr_consent?: boolean

    // Scieżka B: Self-referral
    desired_rate_min?: number
    desired_rate_max?: number
    available_from?: string
    engagement_type?: 'full_time' | 'half_time' | '3_4_days' | 'to_be_discussed'
    cv_is_current?: boolean
    self_referral_note?: string

    rejection_reason?: string
    created_at: string
    updated_at: string

    // Joined fields
    project?: any
    referrer?: any
}

// Notifications System
//
// Audyt 2026-08-25: unia była o 26 wartości za bazą i zawierała `role_change`,
// którego CHECK nigdy nie dopuszczał — typ obiecywał wartość, po której insert
// odbiłby się od bazy, a jednocześnie milczał o 25 realnie zapisywanych typach.
// Lista poniżej jest 1:1 z `notifications_type_check` na prodzie (38 wartości,
// kolejność jak w CHECK-u). Dodając nowy typ powiadomienia: najpierw migracja
// rozszerzająca CHECK, potem ta unia — inaczej insert padnie w runtime.
export type NotificationType =
    | 'contract_ending'
    | 'health_score_low'
    | 'new_project_match'
    | 'loyalty_tier_up'
    | 'referral_update'
    | 'document_uploaded'
    | 'system_announcement'
    | 'payment_received'
    | 'course_completed'
    | 'course_approved'
    | 'course_rejected'
    | 'support_ticket_assigned'
    | 'support_ticket_replied'
    | 'support_ticket_resolved'
    | 'news_published'
    | 'incubator_pitch_status_changed'
    | 'incubator_application_received'
    | 'incubator_application_status_changed'
    | 'inbox_ticket_assigned'
    | 'inbox_sla_breach'
    // Phase 22/26 — Premie
    | 'bonus_proposed'
    | 'bonus_cancelled'
    | 'bonus_linked'
    | 'bonus_assigned'
    | 'bonus_updated'
    // Phase 44 — auto-import maili usunięty; wartości zostają dla wierszy historycznych
    | 'inbox_email_arrived'
    | 'inbox_email_reopened'
    | 'rate_changed'
    | 'placement_reminder'
    | 'champions_league_assigned'
    | 'contractor_followup'
    // Phase 46c — mapa technologiczna
    | 'tech_map_demand'
    | 'tech_map_project_end'
    // Phase 47 — anulowanie urlopu (approver + zastępca)
    | 'leave_cancelled'
    // Phase 50 — monitoring prawny
    | 'legal_monitor_red'
    | 'legal_monitor_silent'
    | 'legal_monitor_due'
    | 'legal_monitor_digest'

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface Notification {
    id: string
    user_id: string
    type: NotificationType
    title_pl: string
    title_en: string
    body_pl?: string
    body_en?: string
    action_url?: string
    is_read: boolean
    priority: NotificationPriority
    created_at: string
    read_at?: string
    expires_at?: string
}

// M1 Dashboard Types
export interface Contract {
    id: string
    consultant_id: string
    contract_number: string
    client_name: string
    project_name: string
    position: string
    start_date: string
    end_date: string
    status: 'active' | 'ending_soon' | 'completed' | 'extended' | 'terminated' | 'draft' | 'cancelled'
    health_score?: number
    hourly_rate?: number
    currency?: string
    work_mode?: 'remote' | 'hybrid' | 'onsite'
}

export interface DashboardStats {
    profile: {
        full_name: string
        role: string
        avatar_url?: string
        loyalty_points?: number
        loyalty_tier?: string
    }
    activeContract: Contract | null
    endingSoonCount: number
    favoritesCount: number
    unreadNotificationsCount: number
    referralsCount: number
    loyaltyPoints: number
    loyaltyTier: string
}

export interface QuickAction {
    id: string
    title_pl: string
    title_en: string
    description_pl: string
    description_en: string
    icon: string
    url: string
    priority: 'high' | 'normal' | 'low'
}
