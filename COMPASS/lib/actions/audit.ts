'use server'

import { logCompat } from '@/lib/logger'

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'

export type AuditAction =
    | 'LOGIN'
    | 'LOGIN_FAILED'
    | 'LOGOUT'
    | 'REGISTER'
    | 'INVITE_USER'
    | 'PASSWORD_RESET'
    | 'ROLE_CHANGE'
    | 'BLOCK_USER'
    | 'UNBLOCK_USER'
    | 'DELETE_USER'
    | 'MFA_VERIFY'
    | 'MFA_SENT'
    // Phase 11 — HR Internal
    | 'EMPLOYEE_PROFILE_UPDATE'
    | 'ATTENDANCE_UPDATE'
    | 'LEAVE_APPROVED'
    | 'LEAVE_REJECTED'
    | 'LEAVE_CANCELLED'
    | 'TIMESHEET_SUBMITTED'
    | 'TIMESHEET_APPROVED'
    | 'TIMESHEET_REJECTED'
    | 'TIMESHEET_UNLOCKED'
    // Phase 27f — approver (admin/manager) in-place entry edits
    | 'TIMESHEET_ENTRY_ADDED_BY_APPROVER'
    | 'TIMESHEET_ENTRY_EDITED_BY_APPROVER'
    | 'TIMESHEET_ENTRY_DELETED_BY_APPROVER'
    // Phase 27g — approver creates a team member's timesheet to fill on-behalf
    | 'TIMESHEET_CREATED_BY_APPROVER'
    // H2.8 — tamper-evidence dla PDF approved timesheet
    | 'TIMESHEET_HASH_MISMATCH'
    // Phase 17 — Smart Work Clock
    | 'WORK_CLOCK_CONSENT_ACCEPTED'
    | 'WORK_CLOCK_CONSENT_REVOKED'
    | 'WORK_CLOCK_STARTED'
    | 'WORK_CLOCK_STOPPED'
    | 'WORK_CLOCK_AUTO_STOPPED'
    | 'WORK_CLOCK_TRANSFERRED'
    | 'WORK_CLOCK_TAMPERED'
    | 'TIMESHEET_CORRECTION_APPROVED'
    | 'TIMESHEET_CORRECTION_REJECTED'
    // Phase 17b — R2 (resume modal) + R3 (pause)
    | 'WORK_CLOCK_RESUME_MERGED'
    | 'WORK_CLOCK_RESUME_DISCARDED'
    | 'WORK_CLOCK_PAUSED'
    | 'WORK_CLOCK_RESUMED'
    // Phase 19 — Invoices (finanse role)
    | 'INVOICE_SUBMITTED'
    | 'INVOICE_APPROVED'
    | 'INVOICE_REJECTED'
    | 'INVOICE_RESUBMITTED'
    // Phase 20 — Manager (2-stage invoice + team timesheet) + TCM
    | 'INVOICE_MANAGER_APPROVED'
    | 'INVOICE_MANAGER_REJECTED'
    | 'MANAGER_ASSIGNED'
    // Phase 22 — Onboarding & Exit Interview (TCM module)
    | 'ONBOARDING_STARTED'
    | 'ONBOARDING_TASK_COMPLETED'
    | 'ONBOARDING_TASK_ADDED'
    | 'ONBOARDING_CHECKIN_SUBMITTED'
    | 'ONBOARDING_COMPLETED'
    | 'TEMPLATE_CREATED'
    | 'TEMPLATE_UPDATED'
    | 'TEMPLATE_DELETED'
    | 'TEMPLATE_DEFAULT_CHANGED'
    | 'BUDDY_ASSIGNED'
    | 'BUDDY_UNASSIGNED'
    | 'OFFBOARDING_STARTED'
    | 'OFFBOARDING_TICKET_CREATED'
    | 'EXIT_INTERVIEW_SCHEDULED'
    | 'EXIT_INTERVIEW_SUBMITTED'
    | 'EXIT_INTERVIEW_REVIEWED'
    | 'EXIT_INTERVIEW_ANONYMIZED'
    | 'OFFBOARDING_TASK_COMPLETED'
    | 'EMPLOYEE_EXITED'
    // Phase 22f — Cancellation + notes + external + duplicates
    | 'ONBOARDING_CANCELLED'
    | 'ONBOARDING_RESTARTED'
    | 'EXIT_INTERVIEW_CANCELLED'
    | 'LIFECYCLE_PROFILE_UPDATED'
    | 'EXTERNAL_EMPLOYEE_CREATED'
    | 'LIFECYCLE_NOTE_ADDED'
    | 'LIFECYCLE_NOTE_DELETED'
    | 'TEMPLATE_DUPLICATED'
    // Phase 23 — Premie (Bonuses)
    | 'BONUS_PROPOSED'
    | 'BONUS_CANCELLED'
    | 'BONUS_LINKED_TO_INVOICE'
    | 'BONUS_UNLINKED'
    // Phase 26 — Bonus assigned workflow (auto-approved, no invoice link)
    | 'BONUS_ASSIGNED'
    | 'BONUS_UPDATED'
    // Phase 24 — Timesheet UX (templates, role defaults, CSV export, preview, archive)
    | 'TIMESHEET_COPIED_FROM_PREVIOUS'
    | 'TIMESHEET_APPLIED_DEFAULT'
    | 'TIMESHEET_TEMPLATE_CREATED'
    | 'TIMESHEET_TEMPLATE_UPDATED'
    | 'TIMESHEET_TEMPLATE_DELETED'
    | 'TIMESHEET_TEMPLATE_APPLIED'
    | 'TIMESHEET_EXPORTED_CSV'
    | 'ROLE_DEFAULT_CREATED'
    | 'ROLE_DEFAULT_UPDATED'
    | 'ROLE_DEFAULT_DELETED'
    // Phase 25 — Leave substitute + Outlook OOF integration
    | 'LEAVE_SUBSTITUTE_ASSIGNED'
    | 'LEAVE_OOF_SET'
    | 'LEAVE_OOF_FAILED'
    | 'LEAVE_OOF_DISABLED'
    // Phase 25b — Manager/admin wpisuje urlop w imieniu pracownika
    | 'LEAVE_CREATED_ON_BEHALF'
    // Phase 25c — Lifecycle emails są opt-in (welcome / exit invitation / manager checklist)
    | 'ONBOARDING_WELCOME_EMAIL_SENT'
    | 'EXIT_INVITATION_EMAIL_SENT'
    | 'OFFBOARDING_CHECKLIST_EMAIL_SENT'
    // Phase 26b — Inbox email ingest from administracja@b2bnetwork.pl
    | 'INBOX_EMAIL_INGESTED'
    | 'INBOX_EMAIL_THREAD_APPENDED'
    | 'INBOX_EMAIL_REOPENED'
    | 'INBOX_EMAIL_SKIPPED'
    // Phase 27a — Timesheet 8h hard block + admin overtime override
    | 'TIMESHEET_OVERTIME_OVERRIDE'
    | 'TIMESHEET_OVERTIME_OVERRIDE_CLEARED'
    // Phase 27b — Bonus categories + attachments
    | 'BONUS_ATTACHMENT_UPLOADED'
    | 'BONUS_ATTACHMENT_REMOVED'
    // Phase 27c — User rates + payroll
    | 'USER_RATE_CHANGED'
    | 'PAYROLL_EXPORTED_CSV'
    // Phase 27d — Clients (bonus dropdown)
    | 'CLIENT_CREATED'
    | 'CLIENT_UPDATED'
    | 'CLIENT_DELETED'

export async function logAudit(
    userId: string | null,
    action: AuditAction,
    details?: Record<string, any>
) {
    try {
        const supabase = createClient()
        const headerStore = headers()
        const ip = headerStore.get('x-forwarded-for') || 'unknown'

        const { error } = await supabase.from('audit_logs').insert({
            user_id: userId,
            action,
            details,
            ip_address: ip
        })

        if (error) {
            logCompat.error('Failed to write audit log:', error)
        }
    } catch (e) {
        logCompat.error('Error logging audit:', e)
    }
}
