-- ============================================================
-- Sygnały sprzedażowe dla ATLASA: wersja i klient w eksporcie + zwrot statusu
-- (audyt integracji 2026-09-14: INT-04 strona źródła, INT-05, INT-10 zwrot statusu)
-- Data: 2026-09-15
-- Depends on: 20260907170000_atlas_export_from_tech_cards.sql,
--             20260803121000_phase46b_tech_interview_cards.sql
--
-- PO CO (eksport):
--   Filtr `p_since` patrzył na COALESCE(finalized_at, created_at). Edycja już
--   sfinalizowanej karty nie zmienia żadnego z nich, więc poprawka ról albo
--   kontekstu nie docierała do ATLASA. Teraz:
--     - `source_updated_at` = GREATEST(updated_at, finalized_at) — wersja wiersza,
--     - `p_since` porównuje GREATEST(COALESCE(finalized_at, created_at), updated_at),
--     - `client_id` — stabilny identyfikator klienta COMPASSA, po którym ATLAS
--       prowadzi zatwierdzaną ręcznie mapę klient → firma (nazwy „Nordea",
--       „Alior", „e-zdrowie" nie są równoważne kartom firm).
--   ATLAS i tak uzgadnia pełny zbiór, więc `hiring=false` (zniknięcie wiersza)
--   dociera jako wycofanie niezależnie od znaczników.
--   Zakres (hiring=true, nie szkic), ACL i kolumny dotychczasowe BEZ ZMIAN.
--
-- PO CO (tabela statusu):
--   TCM nie wiedział, czy sprzedaż cokolwiek zrobiła z sygnałem. ATLAS odsyła
--   status przez POST /api/internal/sales-signals/status (osobny sekret,
--   service_role). Jeden wiersz na kartę, zapis wygrywa tylko nowszym handled_at.
--
-- APLIKACJA: przez MCP `apply_migration` PRZED merge kodu. Nigdy `supabase db push`.
-- ============================================================

BEGIN;

-- ── 1. Eksport z wersją i klientem ─────────────────────────────────────────
-- DROP, bo zmienia się zwracany typ (CREATE OR REPLACE tego nie przepuści).
DROP FUNCTION IF EXISTS public.atlas_sales_signals_export(timestamptz);

CREATE OR REPLACE FUNCTION public.atlas_sales_signals_export(p_since timestamptz DEFAULT NULL)
RETURNS TABLE (
    id                uuid,
    company_name      text,
    need              text,
    contact_hint      text,
    context           text,
    reported_by_email text,
    consultant_name   text,
    consultant_email  text,
    created_at        timestamptz,
    client_id         uuid,
    source_updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT
        c.id,
        cl.name::text AS company_name,
        CASE
            WHEN array_length(c.hiring_roles, 1) > 0
                THEN 'Klient rekrutuje: ' || array_to_string(c.hiring_roles, ', ')
            ELSE 'Zgłoszona potrzeba rekrutacyjna u klienta'
        END::text AS need,
        ('Sygnał od konsultanta: ' || ct.full_name)::text AS contact_hint,
        (
            COALESCE('źródło: ' || nullif(c.hiring_source, '') || '; ', '')
            || 'wywiad ' || COALESCE(c.interview_date::text, '—')
            || COALESCE('; obszar: ' || ca.name, '')
        )::text AS context,
        lower(trim(rep.email))::text AS reported_by_email,
        ct.full_name::text           AS consultant_name,
        lower(trim(ct.email))::text  AS consultant_email,
        COALESCE(c.finalized_at, c.created_at) AS created_at,
        c.client_id                  AS client_id,
        GREATEST(c.updated_at, c.finalized_at) AS source_updated_at
    FROM tech_interview_cards c
    JOIN clients cl            ON cl.id = c.client_id
    JOIN contractors ct        ON ct.id = c.contractor_id
    LEFT JOIN client_areas ca  ON ca.id = c.client_area_id
    LEFT JOIN profiles rep     ON rep.id = COALESCE(c.tcm_id, c.created_by)
    WHERE c.hiring IS TRUE
      AND c.is_draft IS FALSE
      AND (
          p_since IS NULL
          OR GREATEST(COALESCE(c.finalized_at, c.created_at), c.updated_at) > p_since
      )
    ORDER BY COALESCE(c.finalized_at, c.created_at), c.id;
$$;

COMMENT ON FUNCTION public.atlas_sales_signals_export(timestamptz) IS
    'Eksport sygnałów sprzedażowych dla ATLASA. Źródło: tech_interview_cards '
    'z hiring=true (sfinalizowane). Zwraca klienta (nazwa + id), role, kontekst, '
    'imię/e-mail konsultanta, e-mail zgłaszającego i wersję wiersza '
    '(source_updated_at) — nic więcej z kartoteki. p_since patrzy także na updated_at.';

REVOKE ALL ON FUNCTION public.atlas_sales_signals_export(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atlas_sales_signals_export(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.atlas_sales_signals_export(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_sales_signals_export(timestamptz) TO service_role;

-- ── 2. Status obsługi sygnału po stronie sprzedaży ─────────────────────────
CREATE TABLE IF NOT EXISTS tech_card_sales_status (
    card_id          UUID PRIMARY KEY REFERENCES tech_interview_cards(id) ON DELETE CASCADE,
    status           TEXT NOT NULL CHECK (status IN ('converted', 'archived')),
    atlas_deal_id    TEXT,
    atlas_deal_title TEXT,
    handled_by_name  TEXT,
    handled_by_email TEXT,
    reason           TEXT,
    handled_at       TIMESTAMPTZ NOT NULL,
    received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tech_card_sales_status IS
    'Zwrot statusu z ATLASA: converted = sprzedaż utworzyła szansę, archived = „nie dla nas". '
    'Zapis wyłącznie service_role (POST /api/internal/sales-signals/status); '
    'nowszy handled_at wygrywa.';

ALTER TABLE tech_card_sales_status ENABLE ROW LEVEL SECURITY;

-- Odczyt jak same karty mapy technologicznej.
DROP POLICY IF EXISTS "tech_card_sales_status_select_lifecycle" ON tech_card_sales_status;
CREATE POLICY "tech_card_sales_status_select_lifecycle" ON tech_card_sales_status
    FOR SELECT TO authenticated USING (has_lifecycle_access());

REVOKE ALL ON tech_card_sales_status FROM anon;
REVOKE INSERT, UPDATE, DELETE ON tech_card_sales_status FROM authenticated;

-- ── Samosprawdzenie ─────────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'atlas_sales_signals_export'
          AND p.pronargs = 1
          AND pg_get_function_result(p.oid) ILIKE '%source_updated_at%'
          AND pg_get_function_result(p.oid) ILIKE '%client_id%'
    ) THEN
        RAISE EXCEPTION 'Samosprawdzenie: atlas_sales_signals_export nie zwraca client_id/source_updated_at';
    END IF;

    IF has_function_privilege('authenticated', 'public.atlas_sales_signals_export(timestamptz)', 'EXECUTE') THEN
        RAISE EXCEPTION 'Samosprawdzenie: authenticated nadal może wykonać atlas_sales_signals_export';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relname = 'tech_card_sales_status' AND t.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'Samosprawdzenie: tech_card_sales_status nie istnieje albo nie ma RLS';
    END IF;
END $$;

COMMIT;
