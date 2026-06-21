-- ============================================================
-- Phase 39a — Contractor bench (Talent Community: consultants between projects)
-- Date: 2026-06-08
--
-- Depends on:
--   - contractors (Phase 33a)
--   - client_departures (Phase 33d) — bench rows auto-seed from recent / upcoming departures
--   - profiles (id)
--   - has_lifecycle_access() [phase22a] — admin OR talent_community
--   - update_updated_at_column() [touch trigger fn]
--
-- What:
--   contractor_bench — worklist of consultants who left a project (or are leaving soon) and need a
--   new project. Hybrid population: auto-seeded from recent / upcoming client_departures (one bench
--   row per departure, idempotent via the unique departure_id index) + manual entries
--   (departure_id NULL). Editable workflow state: status (w_rekrutacji / przepiety /
--   zakonczenie_umowy) + benefits (aktywne / nieaktywne / do_wygaszenia). dismissed_at soft-removes
--   a row (and, because the row still exists, prevents the auto-seed from re-adding it).
--
-- Visibility: TCM-only (has_lifecycle_access = admin OR talent_community).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS contractor_bench (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- link to the contractor record (when known) and the source departure (when auto-seeded)
    contractor_id    UUID REFERENCES contractors(id) ON DELETE SET NULL,
    departure_id     UUID REFERENCES client_departures(id) ON DELETE SET NULL,
    -- snapshot fields (kept even if the source departure changes / is removed)
    consultant_name  TEXT NOT NULL CHECK (length(trim(consultant_name)) >= 2),
    client_name      TEXT,
    role             TEXT,
    departure_date   DATE,
    notice_date      DATE,
    -- editable workflow state
    status           TEXT NOT NULL DEFAULT 'w_rekrutacji'
                       CHECK (status IN ('w_rekrutacji', 'przepiety', 'zakonczenie_umowy')),
    benefits         TEXT NOT NULL DEFAULT 'aktywne'
                       CHECK (benefits IN ('aktywne', 'nieaktywne', 'do_wygaszenia')),
    source           TEXT NOT NULL DEFAULT 'manual'
                       CHECK (source IN ('auto', 'manual')),
    dismissed_at     TIMESTAMPTZ,
    created_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE contractor_bench IS
    'Phase 39. Talent Community bench: consultants between projects. Hybrid population (auto-seed from recent/upcoming client_departures + manual). status/benefits editable; dismissed_at soft-removes.';

-- One bench row per departure (idempotent auto-seed); manual rows (departure_id NULL) are excluded
-- from the constraint so several can coexist.
CREATE UNIQUE INDEX IF NOT EXISTS contractor_bench_departure_uniq
    ON contractor_bench(departure_id) WHERE departure_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contractor_bench_active
    ON contractor_bench(status) WHERE dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contractor_bench_contractor
    ON contractor_bench(contractor_id) WHERE contractor_id IS NOT NULL;

DROP TRIGGER IF EXISTS contractor_bench_updated_at ON contractor_bench;
CREATE TRIGGER contractor_bench_updated_at BEFORE UPDATE ON contractor_bench
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: TCM-only (admin OR talent_community) for all operations.
ALTER TABLE contractor_bench ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "contractor_bench_all_lifecycle" ON contractor_bench;
CREATE POLICY "contractor_bench_all_lifecycle" ON contractor_bench
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

COMMIT;
