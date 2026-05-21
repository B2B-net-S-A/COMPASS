-- ============================================================
-- Phase 28b — Placement support: inbox_onboarding category + notification type
-- Date: 2026-05-28
--
-- Depends on:
--   - 20260504200001_phase3_support_center.sql (support_categories: slug/name_pl/name_en/icon/sort_order)
--   - 20260506100001_phase10_inbox_kanban.sql (is_inbox_category(): slug LIKE 'inbox_%')
--   - 20260522000001_phase27c_user_rates_and_payroll.sql (latest notifications_type_check)
--
-- What:
--   1. Seed support category 'inbox_onboarding' so new-placement tickets land on the
--      TCM Kanban board (/admin/inbox). Board shows only slugs LIKE 'inbox_%'.
--   2. Rebuild notifications_type_check = phase27c list + 'placement_reminder'
--      (168h-reminder pushed to the manager when a placement becomes eligible).
-- ============================================================

BEGIN;

-- ─── 1. inbox_onboarding category (placement onboarding tickets for TCM) ─────
INSERT INTO support_categories (slug, name_pl, name_en, icon, sort_order) VALUES
    ('inbox_onboarding', 'Onboarding (placement)', 'Onboarding (placement)', 'UserPlus', 106)
ON CONFLICT (slug) DO NOTHING;

-- ─── 2. notifications type CHECK — add 'placement_reminder' ──────────────────
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'contract_ending', 'health_score_low', 'new_project_match',
        'loyalty_tier_up', 'referral_update', 'document_uploaded',
        'system_announcement', 'payment_received',
        'course_completed', 'course_approved', 'course_rejected',
        'support_ticket_assigned', 'support_ticket_replied', 'support_ticket_resolved',
        'news_published',
        'incubator_pitch_status_changed', 'incubator_application_received',
        'incubator_application_status_changed',
        'inbox_ticket_assigned', 'inbox_sla_breach',
        -- Phase 23/26 bonuses
        'bonus_proposed', 'bonus_cancelled', 'bonus_linked',
        'bonus_assigned', 'bonus_updated',
        -- Phase 25e/26b inbox email ingest
        'inbox_email_arrived', 'inbox_email_reopened',
        -- Phase 27c rates
        'rate_changed',
        -- Phase 28 placements
        'placement_reminder'
    ));

COMMIT;
