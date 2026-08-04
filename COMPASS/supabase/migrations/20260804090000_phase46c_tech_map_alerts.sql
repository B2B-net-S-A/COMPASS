-- ============================================================================
-- Phase 46c — Mapa technologiczna: alerty + flaga read-only dla sprzedaży
-- Date: 2026-08-04
-- Depends on:
--   - notifications (20260213) — CHECK na `type` przepisywany z PEŁNĄ żywą listą
--   - profiles
-- What:
--   - notifications_type_check: dodaje 'tech_map_demand' (klient szuka ludzi) i
--     'tech_map_project_end' (koniec projektu <60 dni). Lista przepisana 1:1
--     z produkcyjnego constraintu (zweryfikowana 2026-08-04, 31 wartości) +2.
--   - profiles.can_view_tech_map: grant read-only na ZAGREGOWANĄ kartę klienta
--     dla roli „sprzedaż" (bez dostępu do pojedynczych kart i nazwisk). Egzekwuje
--     go akcja requireTechMapViewerAction; RLS pojedynczych kart NIE jest luzowany.
-- Visibility: flaga jest addytywna (jak has_tcm_access z Phase 45).
-- ============================================================================

BEGIN;

-- ─── 1. notifications.type — przepisanie z żywej listy + 2 nowe ─────────────
-- Wzorzec: DROP + re-state FULL array (jak phase33b). Kolejność zachowana z prod.

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    'contract_ending', 'health_score_low', 'new_project_match', 'loyalty_tier_up',
    'referral_update', 'document_uploaded', 'system_announcement', 'payment_received',
    'course_completed', 'course_approved', 'course_rejected', 'support_ticket_assigned',
    'support_ticket_replied', 'support_ticket_resolved', 'news_published',
    'incubator_pitch_status_changed', 'incubator_application_received',
    'incubator_application_status_changed', 'inbox_ticket_assigned', 'inbox_sla_breach',
    'bonus_proposed', 'bonus_cancelled', 'bonus_linked', 'bonus_assigned', 'bonus_updated',
    'inbox_email_arrived', 'inbox_email_reopened', 'rate_changed', 'placement_reminder',
    'champions_league_assigned', 'contractor_followup',
    -- Phase 46c:
    'tech_map_demand', 'tech_map_project_end'
]::text[]));

-- ─── 2. profiles.can_view_tech_map (grant read-only dla sprzedaży) ──────────

ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS can_view_tech_map BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN profiles.can_view_tech_map IS
    'Phase 46c — grant read-only na zagregowaną kartę klienta (rola sprzedaż). Bez dostępu do pojedynczych kart/nazwisk. Egzekwuje requireTechMapViewerAction.';

COMMIT;
