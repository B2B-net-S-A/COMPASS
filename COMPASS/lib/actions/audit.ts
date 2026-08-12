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
    // Phase 30b — auto-wpis płatnego urlopu (z puli) do timesheet
    | 'TIMESHEET_PAID_LEAVE_AUTOFILL'
    // Phase 30c — usunięcie godzin pracy kolidujących z zatwierdzonym urlopem
    | 'TIMESHEET_LEAVE_CONFLICT_REMOVED'
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
    // Phase 31 — Champions League (kwartalna premia rekrutacyjna)
    | 'CHAMPIONS_LEAGUE_ASSIGNED'
    | 'CHAMPIONS_LEAGUE_UPDATED'
    | 'CHAMPIONS_LEAGUE_CANCELLED'
    // Phase 28 — Placementy (Excel import, eligibility, auto-bonus, TCM tickets)
    | 'PLACEMENTS_IMPORTED'
    | 'PLACEMENT_CANCELLED'
    | 'PLACEMENT_HOURS_CONFIRMED'
    | 'PLACEMENT_BONUSES_GENERATED'
    | 'PLACEMENT_BONUS_CANCELLED'
    | 'PLACEMENT_BONUS_DELETED'
    | 'PLACEMENT_PERSON_ALIAS_SET'
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
    // Phase 25d — Compass detected user-set OOF and did NOT overwrite it
    | 'LEAVE_OOF_SKIPPED_USER_CUSTOM'
    // Phase 41 — Outlook inbox rule forwarding mail to the substitute during leave
    | 'LEAVE_FORWARD_SET'
    | 'LEAVE_FORWARD_FAILED'
    | 'LEAVE_FORWARD_DISABLED'
    // Phase 41 — sweep removed a rule with no live leave behind it (an inbox rule
    // never expires by itself, so this is the backstop against forwarding forever)
    | 'LEAVE_FORWARD_ORPHAN_REMOVED'
    // Phase 41c — somebody changed the INTENT to forward (opt-in at request time, or
    // the manual on/off switch). Deliberately separate from LEAVE_FORWARD_SET /
    // _DISABLED, which record what Graph actually did to the mailbox: the two diverge
    // whenever Graph refuses, and telling "who asked" from "what happened" is the
    // whole point of keeping both.
    | 'LEAVE_FORWARD_PREFERENCE_SET'
    // Phase 41b — heartbeat for the forwarding reconcile cron. Emitted once at the
    // start and once at the end of every run. The forward half's outcome otherwise
    // lives only in the HTTP response, invisible in the DB; these rows are the sole
    // durable proof of whether it ran and what it did. 'start' with no matching 'done'
    // = the run was killed mid-flight (e.g. maxDuration); no 'start' at all = the cron
    // never reached the forward half.
    | 'FORWARD_RECONCILE_RUN'
    // Phase 25b — Manager/admin wpisuje urlop w imieniu pracownika
    | 'LEAVE_CREATED_ON_BEHALF'
    // Phase 27j — Manager/admin zarządza urlopem zespołu (edycja / anulowanie)
    | 'LEAVE_UPDATED_BY_MANAGER'
    | 'LEAVE_CANCELLED_BY_MANAGER'
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
    // Phase 27h — Contract type + rate progression
    | 'EMPLOYMENT_TYPE_CHANGED'
    | 'USER_RATE_PROGRESSION_SET'
    | 'USER_RATE_PROGRESSION_COPIED'
    // Phase 27i — Contract documents (umowa + aneksy)
    | 'CONTRACT_DOCUMENT_UPLOADED'
    | 'CONTRACT_DOCUMENT_DELETED'
    // Phase 30b — Vacation pool edit from Rates panel (finanse + admin)
    | 'USER_VACATION_POOL_UPDATED'
    // Phase 33 — Kontraktorzy (TCM contractor care: log, interviews, client movements)
    | 'CONTRACTOR_CREATED'
    | 'CONTRACTOR_UPDATED'
    | 'CONTRACTOR_CONVERSATION_ADDED'
    | 'CONTRACTOR_CONVERSATION_UPDATED'
    | 'CONTRACTOR_ONBOARDING_INTERVIEW_CREATED'
    | 'CONTRACTOR_ONBOARDING_INTERVIEW_SAVED'
    | 'CONTRACTOR_ONBOARDING_INTERVIEW_SUBMITTED'
    | 'CONTRACTOR_ONBOARDING_INTERVIEW_REVIEWED'
    | 'CONTRACTOR_EXIT_INTERVIEW_CREATED'
    | 'CONTRACTOR_EXIT_INTERVIEW_SAVED'
    | 'CONTRACTOR_EXIT_INTERVIEW_SUBMITTED'
    | 'CONTRACTOR_EXIT_INTERVIEW_REVIEWED'
    | 'CLIENT_DEPARTURE_RECORDED'
    | 'CONTRACTORS_IMPORTED'
    // Phase 34 — Talent Community department task list
    | 'CONTRACTOR_TASK_CREATED'
    | 'CONTRACTOR_TASK_UPDATED'
    | 'CONTRACTOR_TASK_DELETED'
    // Consultant Success — private TCM/admin workspace
    | 'CONSULTANT_SUCCESS_MONITORING_ACTIVATED'
    | 'CONSULTANT_SUCCESS_MONITORING_PAUSED'
    | 'CONSULTANT_SUCCESS_CHECK_IN_SCHEDULED'
    | 'CONSULTANT_SUCCESS_CHECK_IN_RESCHEDULED'
    | 'CONSULTANT_SUCCESS_CHECK_IN_COMPLETED'
    | 'CONSULTANT_SUCCESS_CLIENT_FEEDBACK_ADDED'
    | 'CONSULTANT_SUCCESS_HEALTH_STATUS_CHANGED'
    | 'CONSULTANT_SUCCESS_PULSE_SENT'
    | 'CONSULTANT_SUCCESS_PULSE_RESPONDED'
    | 'CONSULTANT_SUCCESS_DELIVERY_RETRIED'
    // Phase 38 — interview file uploads (Onboarding / Exit elements)
    | 'CONTRACTOR_ONBOARDING_INTERVIEW_FILE_UPLOADED'
    | 'CONTRACTOR_EXIT_INTERVIEW_FILE_UPLOADED'
    | 'CONTRACTOR_INTERVIEW_FILE_REMOVED'
    // Phase 39 — bench (consultants between projects)
    | 'BENCH_ENTRY_ADDED'
    | 'BENCH_ENTRY_UPDATED'
    | 'BENCH_ENTRY_DISMISSED'
    // Phase 46 — Mapa technologiczna (karty wywiadów + słowniki + rotacja bloków)
    | 'TECH_CARD_CREATED'
    | 'TECH_CARD_UPDATED'
    | 'TECH_CARD_FINALIZED'
    | 'TECH_DICT_CREATED'
    | 'TECH_DICT_UPDATED'
    | 'TECH_DICT_DELETED'
    | 'TECH_AREA_CREATED'
    | 'TECH_BLOCK_OVERRIDDEN'
    | 'TECH_MAP_ROTATION_RUN'
    | 'CLIENT_CREATED_FROM_TECH_MAP'
    // Phase 46c — alerty mapy technologicznej
    | 'TECH_MAP_DEMAND_ALERTED'
    | 'TECH_MAP_PROJECT_END_ALERTED'
    | 'TECH_MAP_PROJECT_END_RUN'
    // Phase 48 — Monitoring prawny (przegląd wpisów przez finanse/admin)
    | 'LEGAL_MONITOR_ITEM_REVIEWED'
    // Phase 50 — alerty + follow-up monitoringu prawnego
    | 'LEGAL_MONITOR_ITEMS_BULK_REVIEWED'
    | 'LEGAL_MONITOR_FOLLOWUP_SET'
    | 'LEGAL_MONITOR_EXPORTED_CSV'
    // Heartbeat crona alertów: 'start' bez 'done' = przebieg ubity w locie;
    // brak 'start' = cron w ogóle nie odpalił.
    | 'LEGAL_MONITOR_ALERTS_RUN'
    // Phase 49 — edytowalne tytuły (zgłoszenia w People Ops; karta rozmowy ma
    // własny ślad w TECH_CARD_UPDATED)
    | 'INBOX_TICKET_RENAMED'
    // Phase 51 — heartbeat crona przypomnień o timesheecie. Przypomnienie idzie teraz
    // raz w miesiącu, więc cichy brak przebiegu = cały miesiąc bez sygnału do ludzi;
    // ten wpis jest jedynym czytelnym z bazy dowodem, że okno 1.–5. zostało obsłużone.
    | 'TIMESHEET_REMINDER_RUN'

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
