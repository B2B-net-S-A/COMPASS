-- ============================================================
-- Phase 33d — Client movements: entries archive + departures
-- Date: 2026-06-06
--
-- Depends on:
--   - contractors (Phase 33a), placements (Phase 28a), profiles
--   - has_lifecycle_access() [phase22a], update_updated_at_column()
--
-- What:
--   1. client_entries    — ARCHIVE of "Wejścia do klientów" 2024 (pre-Phase-28 placements).
--      Read-only analytics. Recruiter/DL stored as raw text + optional profile (many are
--      not current employees). Does NOT drive bonuses (unlike placements). Live go-forward
--      entries continue to use placements; the "Wejścia" view UNIONs both.
--   2. client_departures — "Zejścia od klientów" (historical + go-forward). No live-placement
--      requirement (placement_id nullable). Structured: who_resigned, transferred (przepięcie),
--      replacement, dates, margin lost.
--
-- Visibility: TCM-only (has_lifecycle_access = admin OR talent_community).
-- ============================================================

BEGIN;

-- ─── 1. client_entries (Wejścia 2024 archive) ──────────────────────────────
CREATE TABLE IF NOT EXISTS client_entries (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id        UUID REFERENCES contractors(id) ON DELETE SET NULL,
    consultant_name      TEXT NOT NULL,
    client_name          TEXT NOT NULL,
    position             TEXT,
    recruiter_raw        TEXT,
    recruiter_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
    delivery_lead_raw    TEXT,
    delivery_lead_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    signing_date         DATE,
    start_date           DATE,
    order_term           TEXT,
    order_number         TEXT,
    guarantee            TEXT,
    cost_rate            NUMERIC(10, 2),
    revenue_rate         NUMERIC(10, 2),
    monthly_margin       NUMERIC(12, 2),   -- "Marża *168 = zysk"
    note_am              TEXT,
    note_billing         TEXT,
    note_hr              TEXT,
    -- import audit
    source               TEXT NOT NULL DEFAULT 'import' CHECK (source IN ('manual', 'import')),
    external_key         TEXT UNIQUE,       -- hash(name+client+start) → idempotent
    imported_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
    last_import_batch_id UUID,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE client_entries IS
    'Phase 33. Archive of "Wejścia do klientów 2024" (pre-Phase-28). Read-only analytics; does NOT drive bonuses. Live entries use placements.';

CREATE INDEX IF NOT EXISTS idx_client_entries_contractor ON client_entries(contractor_id);
CREATE INDEX IF NOT EXISTS idx_client_entries_client ON client_entries(lower(client_name));
CREATE INDEX IF NOT EXISTS idx_client_entries_start ON client_entries(start_date);

DROP TRIGGER IF EXISTS client_entries_updated_at ON client_entries;
CREATE TRIGGER client_entries_updated_at BEFORE UPDATE ON client_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE client_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_entries_all_lifecycle" ON client_entries;
CREATE POLICY "client_entries_all_lifecycle" ON client_entries
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

-- ─── 2. client_departures (Zejścia — historical + go-forward) ───────────────
CREATE TABLE IF NOT EXISTS client_departures (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id        UUID REFERENCES contractors(id) ON DELETE SET NULL,
    placement_id         UUID REFERENCES placements(id) ON DELETE SET NULL,
    consultant_name      TEXT NOT NULL,
    client_name          TEXT NOT NULL,
    position             TEXT,
    recruiter_raw        TEXT,
    recruiter_id         UUID REFERENCES profiles(id) ON DELETE SET NULL,
    manager_raw          TEXT,
    start_date           DATE,
    departure_date       DATE,
    last_notice_day      DATE,           -- "Ostatni dzień wypowiedzenia"
    guarantee_ratio      NUMERIC(6, 4),  -- fraction in the sheet's "Gwarancja" column
    who_resigned         TEXT CHECK (who_resigned IS NULL OR who_resigned IN (
        'klient', 'kandydat', 'koniec_zamowienia', 'internalizacja', 'kandydat_klient', 'nieznany'
    )),
    reason               TEXT,           -- "Powód"
    transferred          BOOLEAN NOT NULL DEFAULT FALSE,  -- "Przepięcie"
    replacement          BOOLEAN NOT NULL DEFAULT FALSE,  -- "Replacement"
    comment              TEXT,           -- "Komentarz"
    order_term           TEXT,
    order_number         TEXT,
    cost_rate            NUMERIC(10, 2),
    revenue_rate         NUMERIC(10, 2),
    monthly_margin       NUMERIC(12, 2), -- "Marża *168 = strata"
    note_am              TEXT,
    note_hr              TEXT,
    -- import audit
    source               TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import')),
    external_key         TEXT UNIQUE,    -- hash(name+client+departure_date)
    imported_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
    last_import_batch_id UUID,
    created_by           UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE client_departures IS
    'Phase 33. "Zejścia od klientów" — contractor departures (historical + go-forward). placement_id optional. Replaces the departures Excel sheet.';

CREATE INDEX IF NOT EXISTS idx_client_departures_contractor ON client_departures(contractor_id);
CREATE INDEX IF NOT EXISTS idx_client_departures_client ON client_departures(lower(client_name));
CREATE INDEX IF NOT EXISTS idx_client_departures_date ON client_departures(departure_date);
CREATE INDEX IF NOT EXISTS idx_client_departures_who ON client_departures(who_resigned);

DROP TRIGGER IF EXISTS client_departures_updated_at ON client_departures;
CREATE TRIGGER client_departures_updated_at BEFORE UPDATE ON client_departures
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE client_departures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_departures_all_lifecycle" ON client_departures;
CREATE POLICY "client_departures_all_lifecycle" ON client_departures
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

COMMIT;
