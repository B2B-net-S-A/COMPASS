-- ============================================================
-- Tożsamość NEXUS: rozdzielenie „brak w NEXUS" od odrzucenia, kotwica osoby,
-- migawka eksportu NEXUSA (audyt integracji 2026-09-14: INT-02, INT-06)
-- Data: 2026-09-15
-- Depends on: 20260906205803_nexus_contractor_identity.sql
--
-- PO CO (INT-02):
--   `not_found` znaczył dwie różne rzeczy: „automat nikogo nie znalazł w tym
--   biegu" oraz „człowiek stwierdził, że tej osoby nie ma w NEXUSIE". Reguła
--   chroniła KAŻDY `not_found` przed ponowną oceną, więc pierwszy bieg bez
--   trafienia stawał się trwałym odrzuceniem. Na produkcji 388 osób, a w
--   audit_logs nie było ani jednego ręcznego odrzucenia.
--   Teraz: `auto_not_found` (automat, oceniany od nowa przy każdym biegu)
--   i `dismissed` (człowiek, z autorem, datą i powodem — chroniony).
--
-- PO CO (INT-06):
--   Kotwicą był KONTRAKT. Jedna osoba z dwiema umowami dawała `ambiguous`,
--   a nowa umowa zrywała powiązanie. `nexus_candidate_id` to trwała tożsamość
--   osoby; `nexus_contract_id` zostaje jako „bieżący kontrakt" odświeżany
--   przez cron. `nexus_contract_snapshot` to ostatni KOMPLETNY eksport NEXUSA:
--   z niego kolejka liczy podpowiedzi, a ręczne powiązanie weryfikuje ID.
--
-- DANE: `not_found` → `dismissed` WYŁĄCZNIE tam, gdzie audit_logs dowodzi
--   ręcznego odrzucenia (autor i data z logu); reszta → `auto_not_found`.
--   Powiązań jest dziś 0, więc kotwica osoby nie wymaga przepisywania danych
--   — cron uzupełni `nexus_candidate_id` przy pierwszym biegu.
--
-- APLIKACJA: przez MCP `apply_migration` PRZED merge kodu (kod zapisuje nowe
--   stany, których stary CHECK nie przepuści). Nigdy `supabase db push`.
-- ============================================================

BEGIN;

-- ── 1. Zdjęcie starego CHECK (inline, nazwany automatycznie) ────────────────
DO $$
DECLARE
    con record;
BEGIN
    FOR con IN
        SELECT c.conname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'contractors'
          AND c.contype = 'c'
          AND pg_get_constraintdef(c.oid) ILIKE '%nexus_match_status%'
    LOOP
        EXECUTE format('ALTER TABLE public.contractors DROP CONSTRAINT %I', con.conname);
    END LOOP;
END $$;

-- ── 2. Kolumny decyzji i kotwica osoby ─────────────────────────────────────
ALTER TABLE contractors
    ADD COLUMN IF NOT EXISTS nexus_candidate_id BIGINT;
ALTER TABLE contractors
    ADD COLUMN IF NOT EXISTS nexus_match_decided_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE contractors
    ADD COLUMN IF NOT EXISTS nexus_match_decided_at TIMESTAMPTZ;
ALTER TABLE contractors
    ADD COLUMN IF NOT EXISTS nexus_match_reason TEXT;

-- Jedna osoba NEXUSA = najwyżej jeden kontraktor COMPASSA.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contractors_nexus_candidate_id
    ON contractors (nexus_candidate_id)
    WHERE nexus_candidate_id IS NOT NULL;

-- ── 3. Dane: rozdzielenie istniejących `not_found` ─────────────────────────
WITH manual AS (
    SELECT DISTINCT ON (al.details->>'contractor_id')
        al.details->>'contractor_id' AS contractor_id,
        al.user_id,
        al.created_at
    FROM audit_logs al
    WHERE al.action = 'CONTRACTOR_UPDATED'
      AND al.details->>'nexus_match' = 'not_found'
      AND al.details ? 'contractor_id'
    ORDER BY al.details->>'contractor_id', al.created_at DESC
)
UPDATE contractors c
SET nexus_match_status     = 'dismissed',
    -- Autor tylko, gdy profil nadal istnieje (FK) — inaczej NULL, data i powód zostają.
    nexus_match_decided_by = (SELECT p.id FROM profiles p WHERE p.id = m.user_id),
    nexus_match_decided_at = m.created_at,
    nexus_match_reason     = 'Odrzucone ręcznie przed rozdzieleniem stanów (odtworzone z audytu)'
FROM manual m
WHERE c.nexus_match_status = 'not_found'
  AND c.id::text = m.contractor_id;

UPDATE contractors
SET nexus_match_status = 'auto_not_found'
WHERE nexus_match_status = 'not_found';

ALTER TABLE contractors
    ADD CONSTRAINT contractors_nexus_match_status_check
    CHECK (nexus_match_status IN ('linked', 'pending', 'ambiguous', 'auto_not_found', 'dismissed'));

COMMENT ON COLUMN contractors.nexus_match_status IS
    'linked = powiązany (automat po unikalnym e-mailu albo człowiek) · pending = jedna '
    'podpowiedź po nazwisku, czeka na człowieka · ambiguous = wiele trafień albo konflikt '
    'unikalności · auto_not_found = automat nikogo nie znalazł w ostatnim biegu (oceniany '
    'od nowa) · dismissed = człowiek stwierdził brak w NEXUSIE (chroniony, z powodem).';
COMMENT ON COLUMN contractors.nexus_candidate_id IS
    'Trwała tożsamość osoby w NEXUSIE (candidate.id). nexus_contract_id to jej bieżący kontrakt.';
COMMENT ON COLUMN contractors.nexus_match_reason IS
    'Powód decyzji: tekst człowieka przy dismissed albo kod automatu przy ambiguous.';

-- ── 4. Migawka ostatniego kompletnego eksportu NEXUSA ──────────────────────
CREATE TABLE IF NOT EXISTS nexus_contract_snapshot (
    nexus_contract_id   BIGINT PRIMARY KEY,
    nexus_candidate_id  BIGINT NOT NULL,
    name                TEXT,
    lastname            TEXT,
    email               TEXT,
    client_name         TEXT,
    job_title           TEXT,
    status              TEXT,
    start_date          DATE,
    end_date            DATE,
    lacks_current_order BOOLEAN NOT NULL DEFAULT FALSE,
    source_updated_at   TIMESTAMPTZ,
    seen_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nexus_contract_snapshot_candidate
    ON nexus_contract_snapshot (nexus_candidate_id);

COMMENT ON TABLE nexus_contract_snapshot IS
    'Ostatni KOMPLETNY eksport kontraktorów z NEXUSA (cron nexus-contractors-sync). '
    'Źródło podpowiedzi kolejki i weryfikacji ręcznego powiązania. Zapis wyłącznie service_role.';

ALTER TABLE nexus_contract_snapshot ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nexus_contract_snapshot_select_lifecycle" ON nexus_contract_snapshot;
CREATE POLICY "nexus_contract_snapshot_select_lifecycle" ON nexus_contract_snapshot
    FOR SELECT TO authenticated USING (has_lifecycle_access());

REVOKE ALL ON nexus_contract_snapshot FROM anon;
REVOKE INSERT, UPDATE, DELETE ON nexus_contract_snapshot FROM authenticated;

-- ── Samosprawdzenie ─────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM contractors WHERE nexus_match_status = 'not_found') THEN
        RAISE EXCEPTION 'Samosprawdzenie: zostały wiersze ze starym statusem not_found';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'contractors'
          AND c.conname = 'contractors_nexus_match_status_check'
          AND pg_get_constraintdef(c.oid) ILIKE '%auto_not_found%'
          AND pg_get_constraintdef(c.oid) ILIKE '%dismissed%'
    ) THEN
        RAISE EXCEPTION 'Samosprawdzenie: brak nowego CHECK contractors_nexus_match_status_check';
    END IF;

    IF (
        SELECT count(*) FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'contractors'
          AND column_name IN ('nexus_candidate_id', 'nexus_match_decided_by',
                              'nexus_match_decided_at', 'nexus_match_reason')
    ) <> 4 THEN
        RAISE EXCEPTION 'Samosprawdzenie: brak kolumn decyzji/kotwicy na contractors';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'idx_contractors_nexus_candidate_id'
    ) THEN
        RAISE EXCEPTION 'Samosprawdzenie: brak indeksu idx_contractors_nexus_candidate_id';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relname = 'nexus_contract_snapshot' AND t.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'Samosprawdzenie: nexus_contract_snapshot nie istnieje albo nie ma RLS';
    END IF;
END $$;

COMMIT;
