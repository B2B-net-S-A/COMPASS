-- ============================================================
-- Phase 28a — Placementy (signed-contract import + auto-bonus source of truth)
-- Date: 2026-05-28
--
-- Depends on:
--   - profiles (id, full_name, role, manager_id)
--   - bonuses (Phase 23/27b/27d) — placements link generated bonus rows
--   - support_tickets (Phase 3/10) — placements link a TCM onboarding ticket
--   - RLS helpers: is_admin() [phase15], is_manager()/is_internal_or_admin() [phase20b/19d],
--                  is_finanse_or_admin() [phase19b]
--
-- What:
--   1. placements — one row per signed contract (= Excel row). Source of truth for
--      DL/recruiter bonus amounts + 168h eligibility projection. Consultant is EXTERNAL
--      (works at client site, not a Compass user) → stored as free text; only DL & recruiter
--      link to profiles. Natural key (consultant+client+start) makes monthly re-upload idempotent.
--   2. placement_person_aliases — remembers raw-name → profile mappings so future uploads
--      auto-resolve known DL/recruiter names (Excel uses free-text names).
--
-- Note: the per-month unique bonus index was already dropped in phase27e
--       (recruiter may place several candidates in one month) — no constraint work here.
-- ============================================================

BEGIN;

-- ─── 1. placements ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placements (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- natural key (idempotent monthly re-upload)
    consultant_name        TEXT NOT NULL CHECK (length(trim(consultant_name)) >= 2),
    client_name            TEXT NOT NULL CHECK (length(trim(client_name)) >= 1),
    start_date             DATE NOT NULL,

    -- details
    position               TEXT,

    -- people (resolved profiles; NOT NULL — rows without a match are blocked at import)
    delivery_lead_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    recruiter_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    delivery_lead_raw      TEXT NOT NULL,   -- original Excel name (audit)
    recruiter_raw          TEXT NOT NULL,

    -- finance (PLN/h)
    cost_rate              NUMERIC(10, 2) NOT NULL CHECK (cost_rate >= 0),
    revenue_rate           NUMERIC(10, 2) NOT NULL CHECK (revenue_rate >= 0),
    margin_per_hour        NUMERIC(10, 2) NOT NULL,                 -- revenue - cost
    monthly_margin         NUMERIC(12, 2) NOT NULL,                 -- margin_per_hour * 168

    -- dates
    signing_date           DATE,
    bonus_eligible_date    DATE NOT NULL,                           -- start + 21 business days (computed in TS)

    -- computed bonuses (snapshot at import; recomputed on update)
    dl_bonus_amount        NUMERIC(12, 2) NOT NULL CHECK (dl_bonus_amount >= 0),  -- monthly_margin * 10%
    recruiter_tier         SMALLINT NOT NULL CHECK (recruiter_tier IN (1, 2, 3)),
    recruiter_bonus_amount NUMERIC(12, 2) NOT NULL CHECK (recruiter_bonus_amount >= 0),

    -- lifecycle
    status                 TEXT NOT NULL DEFAULT 'upcoming'
                             CHECK (status IN ('upcoming', 'started', 'bonus_confirmed', 'cancelled')),
    hours_confirmed_at     TIMESTAMPTZ,
    hours_confirmed_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    cancelled_at           TIMESTAMPTZ,
    cancelled_by           UUID REFERENCES profiles(id) ON DELETE SET NULL,
    cancel_reason          TEXT,

    -- generated bonus links (idempotency guard — never double-generate)
    dl_bonus_id            UUID REFERENCES bonuses(id) ON DELETE SET NULL,
    recruiter_bonus_id     UUID REFERENCES bonuses(id) ON DELETE SET NULL,

    -- TCM onboarding ticket
    tcm_ticket_id          UUID REFERENCES support_tickets(id) ON DELETE SET NULL,

    -- import audit
    imported_by            UUID REFERENCES profiles(id) ON DELETE SET NULL,
    last_import_batch_id   UUID,

    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE placements IS
    'Phase 28a. One row per signed placement (Excel import). Source of truth for DL/recruiter bonus + 168h eligibility. Consultant is external (free text); DL & recruiter link to profiles.';

-- Natural key: case-insensitive consultant + client + start_date. Idempotent re-upload.
CREATE UNIQUE INDEX IF NOT EXISTS idx_placements_natural_key
    ON placements (lower(consultant_name), lower(client_name), start_date);

CREATE INDEX IF NOT EXISTS idx_placements_dl        ON placements(delivery_lead_id);
CREATE INDEX IF NOT EXISTS idx_placements_recruiter ON placements(recruiter_id);
CREATE INDEX IF NOT EXISTS idx_placements_status_eligible
    ON placements(status, bonus_eligible_date);

-- ─── 2. placement_person_aliases ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS placement_person_aliases (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_name_norm TEXT NOT NULL UNIQUE,                 -- lower(trim(raw_name from Excel))
    profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    created_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE placement_person_aliases IS
    'Phase 28a. Remembers Excel raw-name → profile mappings so monthly re-uploads auto-resolve DL/recruiter names.';

-- ─── 3. RLS: placements ──────────────────────────────────────────────────────
ALTER TABLE placements ENABLE ROW LEVEL SECURITY;

-- SELECT: admin/finanse/manager see all; a DL or recruiter sees only their own placements.
DROP POLICY IF EXISTS "placements_select_scoped" ON placements;
CREATE POLICY "placements_select_scoped" ON placements
    FOR SELECT TO authenticated
    USING (
        is_admin()
        OR is_finanse_or_admin()
        OR is_manager()
        OR delivery_lead_id = auth.uid()
        OR recruiter_id = auth.uid()
    );

-- INSERT/UPDATE/DELETE: admin + manager only (import + lifecycle owner).
DROP POLICY IF EXISTS "placements_insert_admin_manager" ON placements;
CREATE POLICY "placements_insert_admin_manager" ON placements
    FOR INSERT TO authenticated
    WITH CHECK (is_admin() OR is_manager());

DROP POLICY IF EXISTS "placements_update_admin_manager" ON placements;
CREATE POLICY "placements_update_admin_manager" ON placements
    FOR UPDATE TO authenticated
    USING (is_admin() OR is_manager())
    WITH CHECK (is_admin() OR is_manager());

DROP POLICY IF EXISTS "placements_delete_admin_manager" ON placements;
CREATE POLICY "placements_delete_admin_manager" ON placements
    FOR DELETE TO authenticated
    USING (is_admin() OR is_manager());

-- ─── 4. RLS: placement_person_aliases ────────────────────────────────────────
ALTER TABLE placement_person_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "placement_aliases_select_hr_zone" ON placement_person_aliases;
CREATE POLICY "placement_aliases_select_hr_zone" ON placement_person_aliases
    FOR SELECT TO authenticated
    USING (is_internal_or_admin());

DROP POLICY IF EXISTS "placement_aliases_write_admin_manager" ON placement_person_aliases;
CREATE POLICY "placement_aliases_write_admin_manager" ON placement_person_aliases
    FOR ALL TO authenticated
    USING (is_admin() OR is_manager())
    WITH CHECK (is_admin() OR is_manager());

COMMIT;
