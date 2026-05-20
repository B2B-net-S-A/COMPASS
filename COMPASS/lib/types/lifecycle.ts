// Phase 22 (2026-05-17) — Onboarding & Exit Interview module types.
// Backed by tables in 20260517*_phase22*.sql migrations.

import type { DbRole } from '@/lib/types/role'

// ─── Employment lifecycle ────────────────────────────────────────────────
export const EMPLOYMENT_STATUSES = ['pending', 'onboarding', 'active', 'offboarding', 'exited'] as const
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number]

// ─── Onboarding ──────────────────────────────────────────────────────────
export const ONBOARDING_CATEGORIES = ['docs', 'access', 'training', 'meeting', 'equipment', 'other'] as const
export type OnboardingCategory = (typeof ONBOARDING_CATEGORIES)[number]

export const RESPONSIBLE_ROLES = ['employee', 'manager', 'buddy', 'tcm', 'admin'] as const
export type ResponsibleRole = (typeof RESPONSIBLE_ROLES)[number]

export interface OnboardingTemplate {
    id: string
    name: string
    target_role: DbRole
    description: string | null
    is_default: boolean
    is_archived: boolean
    created_by: string | null
    created_at: string
    updated_at: string
}

export interface OnboardingTemplateItem {
    id: string
    template_id: string
    position: number
    category: OnboardingCategory
    title: string
    description: string | null
    due_offset_days: number
    requires_file: boolean
    course_slug: string | null
    responsible_role: ResponsibleRole
    is_required: boolean
    created_at: string
}

export interface OnboardingProgress {
    id: string
    user_id: string
    template_id: string
    started_at: string
    completed_at: string | null
    checkin_day1_at: string | null
    checkin_day1_score: number | null
    checkin_day1_note: string | null
    checkin_day7_at: string | null
    checkin_day7_score: number | null
    checkin_day7_note: string | null
    checkin_day30_at: string | null
    checkin_day30_score: number | null
    checkin_day30_note: string | null
    // Phase 25c: welcome email opt-in tracking
    welcome_email_sent_at: string | null
    welcome_email_sent_by: string | null
    // Phase 22.3 (migration 22f): cancellation
    cancelled_at: string | null
    cancelled_by: string | null
    cancellation_reason: string | null
    created_at: string
    updated_at: string
}

export interface OnboardingTask {
    id: string
    progress_id: string
    template_item_id: string | null
    title: string
    description: string | null
    category: OnboardingCategory
    course_slug: string | null
    responsible_role: ResponsibleRole
    is_required: boolean
    requires_file: boolean
    due_date: string | null
    completed_at: string | null
    completed_by: string | null
    file_path: string | null
    file_hash: string | null
    notes: string | null
    position: number
    created_at: string
    updated_at: string
}

// Composite type for `/internal/lifecycle/onboarding/[progressId]/page.tsx`
export interface OnboardingDetail {
    progress: OnboardingProgress
    template: OnboardingTemplate
    tasks: OnboardingTask[]
    employee: {
        id: string
        full_name: string | null
        email: string
        role: DbRole
        hired_at: string | null
        buddy_id: string | null
        manager_id: string | null
        employment_status: EmploymentStatus
    }
    buddy: { id: string; full_name: string | null } | null
    manager: { id: string; full_name: string | null } | null
}

export type CheckinDay = 1 | 7 | 30

// ─── Exit Interview ──────────────────────────────────────────────────────
export const EXIT_REASONS = [
    'new_opportunity',
    'compensation',
    'role_misfit',
    'management',
    'work_life_balance',
    'career_growth',
    'personal',
    'other',
] as const
export type ExitReason = (typeof EXIT_REASONS)[number]

export const EXIT_INTERVIEW_STATUSES = ['scheduled', 'submitted', 'reviewed', 'archived'] as const
export type ExitInterviewStatus = (typeof EXIT_INTERVIEW_STATUSES)[number]

export interface ExitInterview {
    id: string
    user_id: string | null // nullable after anonymization
    is_anonymous: boolean
    role_snapshot: string
    manager_snapshot: string | null
    department_snapshot: string | null
    tenure_months: number | null
    exit_reason: ExitReason | null
    exit_reason_detail: string | null
    nps_score: number | null
    satisfaction_team: number | null
    satisfaction_manager: number | null
    satisfaction_projects: number | null
    would_recommend: boolean | null
    what_worked: string | null
    what_to_improve: string | null
    knowledge_transfer_notes: string | null
    status: ExitInterviewStatus
    scheduled_for: string | null
    submitted_at: string | null
    reviewed_by: string | null
    reviewed_at: string | null
    reviewer_note: string | null
    // Phase 25c: email opt-in tracking
    invitation_sent_at: string | null
    invitation_sent_by: string | null
    manager_checklist_sent_at: string | null
    manager_checklist_sent_by: string | null
    created_at: string
    updated_at: string
}

export interface ExitInterviewAttachment {
    id: string
    interview_id: string
    file_path: string
    file_name: string
    file_size: number
    file_hash: string | null
    uploaded_by: string | null
    uploaded_at: string
}

// ─── Offboarding ─────────────────────────────────────────────────────────
export const OFFBOARDING_CATEGORIES = [
    'access_revoke',
    'equipment_return',
    'final_settlement',
    'docs_archive',
    'knowledge_transfer',
    'other',
] as const
export type OffboardingCategory = (typeof OFFBOARDING_CATEGORIES)[number]

export const OFFBOARDING_RESPONSIBLE_ROLES = ['employee', 'manager', 'tcm', 'admin', 'finanse'] as const
export type OffboardingResponsibleRole = (typeof OFFBOARDING_RESPONSIBLE_ROLES)[number]

export interface OffboardingTask {
    id: string
    user_id: string
    category: OffboardingCategory
    title: string
    description: string | null
    responsible_role: OffboardingResponsibleRole
    is_required: boolean
    due_date: string | null
    completed_at: string | null
    completed_by: string | null
    notes: string | null
    position: number
    created_at: string
    updated_at: string
}

// ─── Lifecycle Events (timeline) ─────────────────────────────────────────
export const LIFECYCLE_EVENT_TYPES = [
    'hired',
    'onboarding_started',
    'onboarding_completed',
    'role_changed',
    'manager_changed',
    'buddy_assigned',
    'offboarding_started',
    'exit_interview_completed',
    'exited',
] as const
export type LifecycleEventType = (typeof LIFECYCLE_EVENT_TYPES)[number]

export interface LifecycleEvent {
    id: string
    user_id: string
    event_type: LifecycleEventType
    metadata: Record<string, unknown>
    created_by: string | null
    created_at: string
}

// ─── Analytics ───────────────────────────────────────────────────────────
export interface LifecycleAnalytics {
    period: { from: string; to: string }
    activeOnboardings: number
    completedOnboardings: number
    avgOnboardingDays: number | null
    onTimeCompletionRate: number | null // 0..1
    pendingExitInterviews: number
    completedExitInterviews: number
    avgExitNps: number | null
    topExitReasons: Array<{ reason: ExitReason; count: number }>
    retentionByRole: Array<{ role: string; retention_rate: number; total: number }>
    openTasksByResponsible: Array<{ role: ResponsibleRole; count: number }>
    overdueTasks: number
}

// ─── Form payloads (Zod-friendly) ────────────────────────────────────────
export interface ScheduleExitInterviewInput {
    userId: string
    terminationDate: string // ISO date
    scheduledFor?: string | null
}

export interface SubmitExitInterviewInput {
    interviewId: string
    isAnonymous: boolean
    exitReason: ExitReason
    exitReasonDetail?: string | null
    npsScore: number // 0..10
    satisfactionTeam?: number | null
    satisfactionManager?: number | null
    satisfactionProjects?: number | null
    wouldRecommend?: boolean | null
    whatWorked?: string | null
    whatToImprove?: string | null
    knowledgeTransferNotes?: string | null
}

export interface CompleteOnboardingTaskInput {
    taskId: string
    notes?: string | null
    file?: File | null
}

export interface SubmitCheckinInput {
    progressId: string
    day: CheckinDay
    score: number // 1..5
    note?: string | null
}

export interface CreateTemplateInput {
    name: string
    targetRole: DbRole
    description?: string | null
    isDefault?: boolean
    items: Array<Omit<OnboardingTemplateItem, 'id' | 'template_id' | 'created_at'>>
}

// ─── Sidebar badge ───────────────────────────────────────────────────────
export interface LifecycleSidebarCount {
    overdueTasks: number
    pendingCheckins: number
    pendingExitInterviewsToReview: number
    activeOwnOnboarding: boolean
    activeOwnExitInterview: boolean
    total: number
}
