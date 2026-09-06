-- ============================================================
-- Sygnały sprzedażowe od konsultantów + eksport dla ATLASA
-- Data: 2026-09-06
-- Depends on: 20260517000006_phase22f_cancellation_notes_external.sql
--             (lifecycle_notes, has_lifecycle_access)
--
-- PO CO: Talent Community Managerowie pytają konsultantów podczas
-- onboardingu i rozmów lifecycle, czy wiedzą o potrzebach u swojego
-- klienta. Do tej pory odpowiedzi lądowały w `lifecycle_notes`
-- (is_private domyślnie TRUE) i nie docierały do handlu — a to jest
-- najtańszy lead, jaki firma ma: pochodzi od kogoś, kto siedzi
-- u klienta i wie, czego ten klient szuka.
--
-- DLACZEGO OSOBNA TABELA, A NIE FLAGA NA `lifecycle_notes`: notatka
-- kadrowa i sygnał sprzedażowy mają inny cel przetwarzania, inny krąg
-- odbiorców i inną retencję. Gdyby sygnał był flagą, eksport musiałby
-- sięgać po `content` notatki — czyli prywatny zapis kadrowy dostałby
-- fizyczną drogę na zewnątrz. Tu tej drogi nie ma: treść notatki nie
-- występuje w sygnaturze funkcji eksportowej.
--
-- CO ŚWIADOMIE ODDAJE, A CZEGO NIE:
--   oddaje: nazwę firmy, potrzebę, wskazówkę kontaktową, kontekst,
--   e-mail zgłaszającego TCM-a oraz IMIĘ I E-MAIL KONSULTANTA, od
--   którego pochodzi cynk — świadoma decyzja, żeby handel mógł
--   podziękować i rozliczyć bonus za polecenie.
--   NIE oddaje: żadnego innego pola z `profiles` — ani stawek
--   (`user_rates`), ani roli, ani managera, ani statusu zatrudnienia,
--   ani dat. `profiles` to pełna kartoteka kadrowa. Kontrakt wymusza
--   sygnatura `public.atlas_sales_signals_export`, nie dyscyplina
--   wołającego.
--
-- CZEGO TU NIE MA I DLACZEGO: kolumn `status` / `exported_at`. Stanem
-- sygnału (nowy / skonwertowany do deala / odrzucony) zarządza ATLAS,
-- bo to on go kwalifikuje. Trzymanie tego po obu stronach tworzy stany
-- rozjechane przy częściowej awarii. Trasa eksportowa jest wyłącznie
-- GET-owa, a znacznik postępu trzyma konsument.
-- ============================================================

BEGIN;

-- ─── Część 1: tabela sygnałów ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sales_signals (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Oba FK są SET NULL + nullable: sygnał przeżywa odejście zarówno
    -- TCM-a, który go zapisał, jak i konsultanta, który dał cynk.
    -- Wzorem `lifecycle_notes.author_id`; skasowanie leada w ATLASIE
    -- przez czyjeś offboardowanie byłoby cichą utratą pracy handlu.
    reported_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
    consultant_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    company_name      TEXT NOT NULL CHECK (length(trim(company_name)) > 0),
    -- Pole pisane wprost do formularza sygnału, NIE kopiowane z notatki
    -- kadrowej. To rozróżnienie jest całą podstawą rozdziału tabel.
    need              TEXT NOT NULL CHECK (length(trim(need)) > 0),
    contact_hint      TEXT,
    context           TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Po tym indeksie idzie odpytywanie inkrementalne (`?since=`).
CREATE INDEX IF NOT EXISTS idx_sales_signals_created
    ON sales_signals(created_at DESC);

DROP TRIGGER IF EXISTS sales_signals_updated_at ON sales_signals;
CREATE TRIGGER sales_signals_updated_at BEFORE UPDATE ON sales_signals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE sales_signals IS
    'Sygnały zakupowe zgłaszane przez TCM-ów po rozmowach z konsultantami. '
    'Eksportowane do ATLASA (CRM) funkcją atlas_sales_signals_export. '
    'Świadomie ODDZIELONE od lifecycle_notes: inny cel przetwarzania, '
    'inny krąg odbiorców, inna retencja. Treść notatek kadrowych nie ma '
    'stąd drogi na zewnątrz.';

ALTER TABLE sales_signals ENABLE ROW LEVEL SECURITY;

-- Wyłącznie TCM/admin — ta sama funkcja, która w SQL-u odzwierciedla
-- `requireLifecycleManagerAction` z TypeScriptu. W odróżnieniu od
-- `lifecycle_notes` NIE MA tu wariantu publicznego: konsultant nie ma
-- powodu widzieć, że ktoś zamienił jego uwagę w lead, a manager liniowy
-- nie ma powodu widzieć cudzych.
DROP POLICY IF EXISTS "sales_signals_all_tcm_admin" ON sales_signals;
CREATE POLICY "sales_signals_all_tcm_admin" ON sales_signals
    FOR ALL TO authenticated
    USING (has_lifecycle_access())
    WITH CHECK (has_lifecycle_access());

-- ─── Część 2: eksport dla ATLASA ─────────────────────────────────────

-- DROP przed CREATE OR REPLACE, bo zmiana typu zwracanego nie przechodzi
-- przez samo REPLACE (tak samo robi nexus_workdays_export).
DROP FUNCTION IF EXISTS public.atlas_sales_signals_export(TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION public.atlas_sales_signals_export(
    p_since TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    id                UUID,
    company_name      TEXT,
    need              TEXT,
    contact_hint      TEXT,
    context           TEXT,
    reported_by_email TEXT,
    consultant_name   TEXT,
    consultant_email  TEXT,
    created_at        TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
-- `pg_catalog` obok `public` — wymóg supabase/migrations/README.md
-- (linter flaguje search-path hijack). Starsze funkcje eksportowe mają
-- samo `public`; idziemy za README i za hardeningiem has_lifecycle_access.
SET search_path = public, pg_catalog
AS $$
    SELECT
        s.id,
        s.company_name::TEXT,
        s.need::TEXT,
        s.contact_hint::TEXT,
        s.context::TEXT,
        lower(trim(r.email))::TEXT AS reported_by_email,
        c.full_name::TEXT          AS consultant_name,
        lower(trim(c.email))::TEXT AS consultant_email,
        s.created_at
    FROM sales_signals s
    LEFT JOIN profiles r ON r.id = s.reported_by
    LEFT JOIN profiles c ON c.id = s.consultant_id
    WHERE p_since IS NULL OR s.created_at > p_since
    ORDER BY s.created_at;
$$;

COMMENT ON FUNCTION public.atlas_sales_signals_export(TIMESTAMPTZ) IS
    'Eksport sygnałów sprzedażowych dla ATLASA. Zwraca WYŁĄCZNIE treść '
    'sygnału, e-mail zgłaszającego oraz imię i e-mail konsultanta — '
    'nigdy stawek, roli, managera, statusu zatrudnienia ani dat '
    'zatrudnienia. Kontrakt wymusza sygnatura, nie dyscyplina wołającego.';

REVOKE ALL ON FUNCTION public.atlas_sales_signals_export(TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.atlas_sales_signals_export(TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.atlas_sales_signals_export(TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.atlas_sales_signals_export(TIMESTAMPTZ) TO service_role;

-- ─── Samosprawdzenie ─────────────────────────────────────────────────
-- Migracja, która cicho nic nie zmieniła, jest gorsza niż taka, która
-- padła — bo wygląda na wdrożoną.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'sales_signals'
    ) THEN
        RAISE EXCEPTION 'Samosprawdzenie: brak tabeli public.sales_signals';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'sales_signals'
          AND policyname = 'sales_signals_all_tcm_admin'
    ) THEN
        RAISE EXCEPTION 'Samosprawdzenie: brak polityki RLS na sales_signals';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_class
        WHERE relname = 'sales_signals' AND relrowsecurity = TRUE
    ) THEN
        RAISE EXCEPTION 'Samosprawdzenie: RLS nie jest włączone na sales_signals';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'atlas_sales_signals_export'
          AND p.pronargs = 1
    ) THEN
        RAISE EXCEPTION 'Samosprawdzenie: brak funkcji atlas_sales_signals_export(timestamptz)';
    END IF;
END $$;

COMMIT;
