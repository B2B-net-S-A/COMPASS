-- ============================================================
-- Przepięcie eksportu sygnałów sprzedażowych dla ATLASA na WŁAŚCIWE źródło
-- Data: 2026-09-07
-- Depends on: 20260906220000_sales_signals_schema.sql (którą to cofa),
--             20260606000002_phase33b_contractor_conversations.sql,
--             tech_interview_cards (mapa/tech-map, Etap 3 — alert popytu)
--
-- PO CO: sygnał „klient szuka ludzi" JUŻ istnieje w Compassie. TCM w wywiadzie
-- (tech_interview_cards) zaznacza hiring=true + hiring_roles, co odpala alert
-- popytu do sprzedaży (fireDemandAlert). Pierwotny eksport (poprzednia migracja)
-- czytał osobną tabelę sales_signals wypełnianą przez panel w module lifecycle,
-- kluczowany na profiles (wewnętrzny personel), a nie contractors (konsultanci)
-- — martwy kąt aplikacji. Efekt: do Atlasa nic nie docierało.
--
-- CO ROBI: przepina funkcję eksportową na tech_interview_cards z hiring=true
-- (sfinalizowane) i USUWA osieroconą tabelę sales_signals. Kształt zwracany
-- funkcji BEZ ZMIAN — puller/`/leads`/konwersja w Atlasie zostają nietknięte.
--
-- CO ŚWIADOMIE ODDAJE: klienta (firmę z potrzebą), role, kontekst wywiadu oraz
-- imię/e-mail konsultanta i e-mail zgłaszającego TCM-a. Nic więcej z kartoteki.
-- ============================================================

BEGIN;

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
    created_at        timestamptz
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
        COALESCE(c.finalized_at, c.created_at) AS created_at
    FROM tech_interview_cards c
    JOIN clients cl            ON cl.id = c.client_id
    JOIN contractors ct        ON ct.id = c.contractor_id
    LEFT JOIN client_areas ca  ON ca.id = c.client_area_id
    LEFT JOIN profiles rep     ON rep.id = COALESCE(c.tcm_id, c.created_by)
    WHERE c.hiring IS TRUE
      AND c.is_draft IS FALSE
      AND (p_since IS NULL OR COALESCE(c.finalized_at, c.created_at) > p_since)
    ORDER BY COALESCE(c.finalized_at, c.created_at);
$$;

COMMENT ON FUNCTION public.atlas_sales_signals_export(timestamptz) IS
    'Eksport sygnałów sprzedażowych dla ATLASA. Źródło: tech_interview_cards '
    'z hiring=true (sfinalizowane). Zwraca klienta, role, kontekst oraz '
    'imię/e-mail konsultanta i e-mail zgłaszającego — nic więcej z kartoteki. '
    'Kontrakt wymusza sygnatura, nie dyscyplina wołającego.';

REVOKE ALL ON FUNCTION public.atlas_sales_signals_export(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atlas_sales_signals_export(timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.atlas_sales_signals_export(timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_sales_signals_export(timestamptz) TO service_role;

DROP TABLE IF EXISTS public.sales_signals;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name='sales_signals') THEN
        RAISE EXCEPTION 'Samosprawdzenie: sales_signals nadal istnieje';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='atlas_sales_signals_export' AND p.pronargs=1
    ) THEN
        RAISE EXCEPTION 'Samosprawdzenie: brak funkcji atlas_sales_signals_export(timestamptz)';
    END IF;
END $$;

COMMIT;
