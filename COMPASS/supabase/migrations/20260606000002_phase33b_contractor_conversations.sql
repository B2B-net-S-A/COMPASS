-- ============================================================
-- Phase 33b — Contractor conversation log (replaces "Rozmowy z kontraktorami.xlsx")
-- Date: 2026-06-06
--
-- Depends on:
--   - contractors (Phase 33a), placements (Phase 28a)
--   - has_lifecycle_access() [phase22a], update_updated_at_column()
--   - notifications (type CHECK extended with 'contractor_followup')
--
-- What:
--   contractor_conversations — dated, categorized, status-tracked TCM call log.
--   category   ← Excel "Sprawa" (normalized to a clean enum in the importer)
--   status     ← Excel colour legend (w toku / rozwiązane / potrzebny kontakt / pilne)
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS contractor_conversations (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id        UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    placement_id         UUID REFERENCES placements(id) ON DELETE SET NULL,
    conversation_date    DATE NOT NULL,
    tcm_id               UUID REFERENCES profiles(id) ON DELETE SET NULL,
    tcm_raw              TEXT,                  -- original Excel "TCM" (Błażej/Paula/ND) for audit
    client_snapshot      TEXT,                  -- "Klient" at time of conversation
    category             TEXT NOT NULL DEFAULT 'inne' CHECK (category IN (
        'szkolenia', 'podwyzka', 'follow_up', 'zejscie', 'przedluzenie', 'informacyjnie',
        'konferencja', 'onboarding', 'exit', 'delegacja', 'internalizacja', 'zmiana_stawki', 'inne'
    )),
    status               TEXT NOT NULL DEFAULT 'w_toku' CHECK (status IN (
        'w_toku', 'rozwiazane', 'potrzebny_kontakt', 'pilne'
    )),
    note                 TEXT,
    follow_up_date       DATE,
    resolved_at          TIMESTAMPTZ,
    -- import audit
    source               TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import')),
    external_key         TEXT UNIQUE,           -- hash(name+date+note) → idempotent re-import
    imported_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
    last_import_batch_id UUID,
    created_by           UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE contractor_conversations IS
    'Phase 33. TCM contractor-care call log (replaces "Rozmowy z kontraktorami.xlsx"). category←Sprawa, status←colour legend.';

CREATE INDEX IF NOT EXISTS idx_contractor_conv_contractor
    ON contractor_conversations(contractor_id, conversation_date DESC);
CREATE INDEX IF NOT EXISTS idx_contractor_conv_open
    ON contractor_conversations(status) WHERE status IN ('potrzebny_kontakt', 'pilne');
CREATE INDEX IF NOT EXISTS idx_contractor_conv_followup
    ON contractor_conversations(follow_up_date)
    WHERE resolved_at IS NULL AND follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contractor_conv_tcm ON contractor_conversations(tcm_id);

DROP TRIGGER IF EXISTS contractor_conversations_updated_at ON contractor_conversations;
CREATE TRIGGER contractor_conversations_updated_at BEFORE UPDATE ON contractor_conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE contractor_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "contractor_conv_all_lifecycle" ON contractor_conversations;
CREATE POLICY "contractor_conv_all_lifecycle" ON contractor_conversations
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

-- ─── notifications: add 'contractor_followup' (full list re-stated to preserve existing) ──
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
    'champions_league_assigned',
    'contractor_followup'
]::text[]));

COMMIT;
