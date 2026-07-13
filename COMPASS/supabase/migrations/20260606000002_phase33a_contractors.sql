-- ============================================================
-- Phase 33a — Contractors (TCM contractor-care identity) + placements enrichment
-- Date: 2026-06-06
--
-- Depends on:
--   - profiles (id, full_name, role)
--   - placements (Phase 28a) — link contractor_id + add Wejścia fields
--   - has_lifecycle_access() [phase22a] — admin OR talent_community
--   - update_updated_at_column() [touch trigger fn]
--
-- What:
--   1. contractors — lightweight identity for EXTERNAL IT contractors placed at clients.
--      NOT Compass users (no auth.users, no email required). Identity = normalized full_name.
--      profile_id only set when the contractor is also an internal employee (lazy link).
--      Anchors the conversation log + onboarding/exit interviews (Phase 33b/c) and the
--      client entries/departures archive (Phase 33d).
--   2. ALTER placements — add contractor_id + the "Wejścia" sheet fields missing from Phase 28
--      (order number/term, guarantee, AM/billing/HR notes). RLS of placements UNCHANGED.
--   3. Backfill contractors from existing placements + link placements.contractor_id.
--
-- Visibility: contractors are TCM-only (has_lifecycle_access = admin OR talent_community).
-- ============================================================

BEGIN;

-- ─── 1. contractors ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contractors (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name            TEXT NOT NULL CHECK (length(trim(full_name)) >= 2),
    phone                TEXT,
    email                TEXT,
    current_client       TEXT,
    current_position     TEXT,
    owner_tcm_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status               TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('prospect', 'onboarding', 'active', 'offboarding', 'exited')),
    -- lazy link: only when the contractor is also an internal Compass employee
    profile_id           UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notes                TEXT,
    -- import audit
    imported_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
    last_import_batch_id UUID,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE contractors IS
    'Phase 33. External IT contractors placed at clients (TCM care). Not Compass users — identity by normalized full_name. profile_id only when also an internal employee.';

-- Natural key: normalized full name → idempotent import (namesakes merge; flagged in import warnings).
CREATE UNIQUE INDEX IF NOT EXISTS idx_contractors_natural_key
    ON contractors (lower(trim(full_name)));

CREATE INDEX IF NOT EXISTS idx_contractors_owner_tcm ON contractors(owner_tcm_id);
CREATE INDEX IF NOT EXISTS idx_contractors_status    ON contractors(status);
CREATE INDEX IF NOT EXISTS idx_contractors_client    ON contractors(lower(current_client));

DROP TRIGGER IF EXISTS contractors_updated_at ON contractors;
CREATE TRIGGER contractors_updated_at BEFORE UPDATE ON contractors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── 2. ALTER placements — Wejścia fields + contractor link ─────────────────
ALTER TABLE placements
    ADD COLUMN IF NOT EXISTS contractor_id UUID REFERENCES contractors(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS order_number  TEXT,   -- "Numer Zamówienia"
    ADD COLUMN IF NOT EXISTS order_term    TEXT,   -- "Termin Zamówienia" (free text "27.02.2024 - 31.12.2024")
    ADD COLUMN IF NOT EXISTS guarantee     TEXT,   -- "Gwarancja" ("wg umowy")
    ADD COLUMN IF NOT EXISTS note_am       TEXT,   -- "Notatka AM"
    ADD COLUMN IF NOT EXISTS note_billing  TEXT,   -- "Notatka Rozliczenia"
    ADD COLUMN IF NOT EXISTS note_hr       TEXT;   -- "Notatka HR"

CREATE INDEX IF NOT EXISTS idx_placements_contractor
    ON placements(contractor_id) WHERE contractor_id IS NOT NULL;

-- ─── 3. Backfill contractors from existing placements + link ────────────────
INSERT INTO contractors (full_name, current_client, current_position)
SELECT DISTINCT ON (lower(trim(consultant_name)))
    trim(consultant_name), client_name, position
FROM placements
WHERE consultant_name IS NOT NULL AND length(trim(consultant_name)) >= 2
ORDER BY lower(trim(consultant_name)), start_date DESC
ON CONFLICT (lower(trim(full_name))) DO NOTHING;

UPDATE placements p
SET contractor_id = c.id
FROM contractors c
WHERE lower(trim(p.consultant_name)) = lower(trim(c.full_name))
  AND p.contractor_id IS NULL;

-- ─── 4. RLS: contractors (TCM-only = admin OR talent_community) ──────────────
ALTER TABLE contractors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contractors_all_lifecycle" ON contractors;
CREATE POLICY "contractors_all_lifecycle" ON contractors
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

COMMIT;
