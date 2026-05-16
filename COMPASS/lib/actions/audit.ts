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
    | 'EXIT_INTERVIEW_SCHEDULED'
    | 'EXIT_INTERVIEW_SUBMITTED'
    | 'EXIT_INTERVIEW_REVIEWED'
    | 'EXIT_INTERVIEW_ANONYMIZED'
    | 'OFFBOARDING_TASK_COMPLETED'
    | 'EMPLOYEE_EXITED'

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
