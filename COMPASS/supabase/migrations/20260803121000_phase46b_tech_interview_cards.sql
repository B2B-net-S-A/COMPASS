-- ============================================================================
-- Phase 46b — Mapa technologiczna: karty wywiadów + przydziały bloków B/C/D
-- Date: 2026-08-03
-- Depends on:
--   - phase46a (technologies, vendors, client_areas)
--   - contractors (phase33a), placements (phase28a), clients (phase27d), profiles
--   - has_lifecycle_access() (phase22a/45b), update_updated_at_column()
-- What:
--   - tech_interview_cards: strukturalna karta rozmowy TCM wg skryptu (blok A zawsze
--     + rotacyjny B/C/D). Draft (is_draft=TRUE, status nullable) → finalizacja
--     (matryca kompletności w lib/tech-map/validation.ts — świadomie APP-LAYER,
--     nie trigger; pojedyncze testowalne źródło reguł). Kolumny *_alerted_at to
--     dedup alertów Etapu 3 (dodane teraz, żeby nie ALTER-ować po danych).
--   - tech_interview_card_technologies / _vendors: junctions M2M (agregacja mapy
--     klienta liczy wskazania per słownik). Słownik ON DELETE RESTRICT — usunięcie
--     użytej pozycji łapane w akcji (23503 → polski komunikat).
--   - tech_interview_card_initiatives: inicjatywy/projekty klienta per karta.
--   - tech_block_assignments: przydział bloku per kontraktor per kwartał (cykl
--     B→C→D). Historia = wiersze; UNIQUE(contractor, rok, kwartał); source=manual
--     (override admina / finalizacja z innym blokiem) jest lepki — cron nie nadpisuje.
-- Visibility: RLS = has_lifecycle_access(), split SELECT/INSERT/UPDATE bez DELETE
--   (standard po audycie 2026-07-16 P1.15). Zapisy service-rolem po guardzie.
--   Nazwiska kontraktorów są widoczne TYLKO na poziomie kart (RLS lifecycle);
--   zagregowana karta klienta (Etap 2) nie zwraca nazwisk.
-- ============================================================================

BEGIN;

-- ─── 1. tech_interview_cards ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tech_interview_cards (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id          UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    placement_id           UUID REFERENCES placements(id) ON DELETE SET NULL,
    -- Prowadzący: nullable w DB (hard-delete userów istnieje — wzorzec
    -- contractor_conversations), wymagany przez akcję przy tworzeniu.
    tcm_id                 UUID REFERENCES profiles(id) ON DELETE SET NULL,
    client_id              UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    client_area_id         UUID REFERENCES client_areas(id) ON DELETE SET NULL,
    interview_date         DATE NOT NULL,
    block                  TEXT NOT NULL CHECK (block IN ('B', 'C', 'D')),
    -- Status rozmowy: nullable dopóki draft; wymagany przy finalizacji.
    status                 TEXT CHECK (status IN ('ok', 'odmowa', 'brak_czasu', 'niechetny')),
    is_draft               BOOLEAN NOT NULL DEFAULT TRUE,
    finalized_at           TIMESTAMPTZ,
    -- Blok A
    satisfaction           SMALLINT CHECK (satisfaction BETWEEN 1 AND 5),
    satisfaction_comment   TEXT,
    project_end_month      SMALLINT CHECK (project_end_month BETWEEN 1 AND 12),
    project_end_year       SMALLINT CHECK (project_end_year BETWEEN 2020 AND 2100),
    project_end_unknown    BOOLEAN NOT NULL DEFAULT FALSE,
    hiring                 BOOLEAN,
    hiring_roles           TEXT[] NOT NULL DEFAULT '{}',
    hiring_source          TEXT CHECK (hiring_source IN ('widzial', 'slyszal', 'plotka')),
    memorable_quote        TEXT,
    -- Blok B
    tech_old_new           TEXT,
    team_size              SMALLINT CHECK (team_size >= 0),
    team_externals         SMALLINT CHECK (team_externals >= 0),
    -- Blok D
    vendors_note           TEXT,
    -- Dedup alertów (Etap 3)
    project_end_alerted_at TIMESTAMPTZ,
    demand_alerted_at      TIMESTAMPTZ,
    created_by             UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tech_cards_project_end_pair
        CHECK ((project_end_month IS NULL) = (project_end_year IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_tech_cards_contractor_date
    ON tech_interview_cards (contractor_id, interview_date DESC);
CREATE INDEX IF NOT EXISTS idx_tech_cards_client
    ON tech_interview_cards (client_id) WHERE is_draft = FALSE;
CREATE INDEX IF NOT EXISTS idx_tech_cards_client_hiring
    ON tech_interview_cards (client_id) WHERE hiring = TRUE AND is_draft = FALSE;
CREATE INDEX IF NOT EXISTS idx_tech_cards_area
    ON tech_interview_cards (client_area_id);

DROP TRIGGER IF EXISTS trg_tech_cards_updated_at ON tech_interview_cards;
CREATE TRIGGER trg_tech_cards_updated_at
    BEFORE UPDATE ON tech_interview_cards
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE tech_interview_cards IS
    'Phase 46 — karta rozmowy mapy technologicznej (blok A + rotacyjny B/C/D). Draft → finalizacja; walidacja kompletności w app-layer.';

-- ─── 2. Junctions: technologie / vendorzy ───────────────────────────────────

CREATE TABLE IF NOT EXISTS tech_interview_card_technologies (
    card_id       UUID NOT NULL REFERENCES tech_interview_cards(id) ON DELETE CASCADE,
    technology_id UUID NOT NULL REFERENCES technologies(id) ON DELETE RESTRICT,
    PRIMARY KEY (card_id, technology_id)
);

CREATE INDEX IF NOT EXISTS idx_tech_card_tech_by_technology
    ON tech_interview_card_technologies (technology_id);

CREATE TABLE IF NOT EXISTS tech_interview_card_vendors (
    card_id   UUID NOT NULL REFERENCES tech_interview_cards(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    PRIMARY KEY (card_id, vendor_id)
);

CREATE INDEX IF NOT EXISTS idx_tech_card_vendors_by_vendor
    ON tech_interview_card_vendors (vendor_id);

-- ─── 3. Inicjatywy / projekty ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tech_interview_card_initiatives (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    card_id  UUID NOT NULL REFERENCES tech_interview_cards(id) ON DELETE CASCADE,
    name     TEXT NOT NULL CHECK (length(trim(name)) >= 2),
    kind     TEXT NOT NULL DEFAULT 'inne' CHECK (kind IN (
        'migracja', 'nowy_system', 'ai', 'regulacje', 'inne'
    )),
    priority TEXT NOT NULL DEFAULT 'normalny' CHECK (priority IN ('wysoki', 'normalny'))
);

CREATE INDEX IF NOT EXISTS idx_tech_card_initiatives_card
    ON tech_interview_card_initiatives (card_id);

-- ─── 4. tech_block_assignments (rotacja B→C→D per kwartał) ──────────────────

CREATE TABLE IF NOT EXISTS tech_block_assignments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contractor_id  UUID NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
    period_year    SMALLINT NOT NULL CHECK (period_year BETWEEN 2020 AND 2100),
    period_quarter SMALLINT NOT NULL CHECK (period_quarter BETWEEN 1 AND 4),
    block          TEXT NOT NULL CHECK (block IN ('B', 'C', 'D')),
    source         TEXT NOT NULL DEFAULT 'auto' CHECK (source IN ('auto', 'manual')),
    assigned_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tech_block_assignments_one_per_quarter
        UNIQUE (contractor_id, period_year, period_quarter)
);

CREATE INDEX IF NOT EXISTS idx_tech_block_assignments_period
    ON tech_block_assignments (period_year, period_quarter);

DROP TRIGGER IF EXISTS trg_tech_block_assignments_updated_at ON tech_block_assignments;
CREATE TRIGGER trg_tech_block_assignments_updated_at
    BEFORE UPDATE ON tech_block_assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE tech_block_assignments IS
    'Phase 46 — przydział bloku wywiadu (B/C/D) per kontraktor per kwartał. source=manual jest lepki, cron nie nadpisuje.';

-- ─── 5. RLS (split, bez DELETE) ─────────────────────────────────────────────

ALTER TABLE tech_interview_cards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_interview_card_technologies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_interview_card_vendors     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_interview_card_initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE tech_block_assignments          ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tech_cards_select_lifecycle" ON tech_interview_cards;
CREATE POLICY "tech_cards_select_lifecycle" ON tech_interview_cards
    FOR SELECT TO authenticated USING (has_lifecycle_access());
DROP POLICY IF EXISTS "tech_cards_insert_lifecycle" ON tech_interview_cards;
CREATE POLICY "tech_cards_insert_lifecycle" ON tech_interview_cards
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());
DROP POLICY IF EXISTS "tech_cards_update_lifecycle" ON tech_interview_cards;
CREATE POLICY "tech_cards_update_lifecycle" ON tech_interview_cards
    FOR UPDATE TO authenticated USING (has_lifecycle_access()) WITH CHECK (has_lifecycle_access());

DROP POLICY IF EXISTS "tech_card_tech_select_lifecycle" ON tech_interview_card_technologies;
CREATE POLICY "tech_card_tech_select_lifecycle" ON tech_interview_card_technologies
    FOR SELECT TO authenticated USING (has_lifecycle_access());
DROP POLICY IF EXISTS "tech_card_tech_insert_lifecycle" ON tech_interview_card_technologies;
CREATE POLICY "tech_card_tech_insert_lifecycle" ON tech_interview_card_technologies
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());

DROP POLICY IF EXISTS "tech_card_vendors_select_lifecycle" ON tech_interview_card_vendors;
CREATE POLICY "tech_card_vendors_select_lifecycle" ON tech_interview_card_vendors
    FOR SELECT TO authenticated USING (has_lifecycle_access());
DROP POLICY IF EXISTS "tech_card_vendors_insert_lifecycle" ON tech_interview_card_vendors;
CREATE POLICY "tech_card_vendors_insert_lifecycle" ON tech_interview_card_vendors
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());

DROP POLICY IF EXISTS "tech_card_initiatives_select_lifecycle" ON tech_interview_card_initiatives;
CREATE POLICY "tech_card_initiatives_select_lifecycle" ON tech_interview_card_initiatives
    FOR SELECT TO authenticated USING (has_lifecycle_access());
DROP POLICY IF EXISTS "tech_card_initiatives_insert_lifecycle" ON tech_interview_card_initiatives;
CREATE POLICY "tech_card_initiatives_insert_lifecycle" ON tech_interview_card_initiatives
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());
DROP POLICY IF EXISTS "tech_card_initiatives_update_lifecycle" ON tech_interview_card_initiatives;
CREATE POLICY "tech_card_initiatives_update_lifecycle" ON tech_interview_card_initiatives
    FOR UPDATE TO authenticated USING (has_lifecycle_access()) WITH CHECK (has_lifecycle_access());

DROP POLICY IF EXISTS "tech_block_assignments_select_lifecycle" ON tech_block_assignments;
CREATE POLICY "tech_block_assignments_select_lifecycle" ON tech_block_assignments
    FOR SELECT TO authenticated USING (has_lifecycle_access());
DROP POLICY IF EXISTS "tech_block_assignments_insert_lifecycle" ON tech_block_assignments;
CREATE POLICY "tech_block_assignments_insert_lifecycle" ON tech_block_assignments
    FOR INSERT TO authenticated WITH CHECK (has_lifecycle_access());
DROP POLICY IF EXISTS "tech_block_assignments_update_lifecycle" ON tech_block_assignments;
CREATE POLICY "tech_block_assignments_update_lifecycle" ON tech_block_assignments
    FOR UPDATE TO authenticated USING (has_lifecycle_access()) WITH CHECK (has_lifecycle_access());

COMMIT;
