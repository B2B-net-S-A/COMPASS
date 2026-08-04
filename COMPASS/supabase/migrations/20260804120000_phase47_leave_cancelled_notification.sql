-- Phase 47 — powiadomienie o anulowaniu urlopu.
--
-- Do tej pory anulowanie urlopu było słabo sygnalizowane: pending → nikt nie
-- dostawał powiadomienia, approved → tylko admini (email + push). Manager
-- akceptujący wniosek ani wybrany zastępca nie wiedzieli, gdy urlop znikał.
-- Case Artura (2026-08-04): rozliczał timesheet w oparciu o zapisany urlop,
-- który okazał się anulowany — bez żadnego sygnału.
--
-- Ta migracja dodaje nowy typ powiadomienia in-app 'leave_cancelled' do
-- constraintu. Cała logika (kto dostaje in-app + push + email) jest w
-- lib/actions/internal-leave.ts (notifyLeaveCancelled). Zmiana jest addytywna —
-- pełna lista istniejących typów + nowy (superset), więc nie łamie istniejących
-- powiadomień.
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
    type = ANY (ARRAY[
        'contract_ending'::text,
        'health_score_low'::text,
        'new_project_match'::text,
        'loyalty_tier_up'::text,
        'referral_update'::text,
        'document_uploaded'::text,
        'system_announcement'::text,
        'payment_received'::text,
        'course_completed'::text,
        'course_approved'::text,
        'course_rejected'::text,
        'support_ticket_assigned'::text,
        'support_ticket_replied'::text,
        'support_ticket_resolved'::text,
        'news_published'::text,
        'incubator_pitch_status_changed'::text,
        'incubator_application_received'::text,
        'incubator_application_status_changed'::text,
        'inbox_ticket_assigned'::text,
        'inbox_sla_breach'::text,
        'bonus_proposed'::text,
        'bonus_cancelled'::text,
        'bonus_linked'::text,
        'bonus_assigned'::text,
        'bonus_updated'::text,
        'inbox_email_arrived'::text,
        'inbox_email_reopened'::text,
        'rate_changed'::text,
        'placement_reminder'::text,
        'champions_league_assigned'::text,
        'contractor_followup'::text,
        'tech_map_demand'::text,
        'tech_map_project_end'::text,
        'leave_cancelled'::text
    ])
);
