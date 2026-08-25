-- Audyt 2026-08-25 · KROK A1 — odciąć anonimowy odczyt `profiles`
--
-- Polityka "Public profiles are viewable by everyone." (20240502000000_initial_schema.sql:16)
-- ma roles=PUBLIC i USING(true), a rola `anon` ma GRANT SELECT. Klucz anonimowy jest
-- z definicji publiczny — siedzi w bundlu strony logowania (lib/supabase/client.ts:17-19).
-- Skutek: GET /rest/v1/profiles?select=* zwracał BEZ LOGOWANIA 69 kolumn × 46 osób:
-- 46 adresów e-mail, 40 numerów telefonu, daty zatrudnienia i zwolnienia, manager_id,
-- oczekiwane stawki oraz previous_clients (lista klientów każdego konsultanta).
--
-- Dlaczego ALTER, a NIE DROP: jedyne dwie polityki SELECT na tej tabeli to ta publiczna
-- i `profiles_select_team_for_internal_admin` (wyłącznie role HR-zone). NIE ISTNIEJE
-- polityka „właściciel widzi swój wiersz", więc DROP odciąłby konsultantom odczyt
-- własnego profilu i wywalił aplikację.
--
-- Zweryfikowano, że aplikacja nigdy nie czyta `profiles` jako anon:
--   app/login/actions.ts       — odczyt profilu PO signInWithPassword
--   app/auth/callback/route.ts — odczyt profilu PO exchangeCodeForSession
--   publiczna ankieta pulse    — createServiceClient(), omija RLS
-- Dlatego ryzyko wdrożenia tego kroku jest zerowe i nie zależy od żadnego innego.

ALTER POLICY "Public profiles are viewable by everyone."
    ON public.profiles
    TO authenticated;

-- Obrona w głąb: nawet gdyby ktoś w przyszłości poluzował politykę, brak grantu
-- tabelowego trzyma rolę anon poza tabelą.
REVOKE ALL ON public.profiles FROM anon;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'profiles'
          AND p.polname = 'Public profiles are viewable by everyone.'
          AND 0 = ANY(p.polroles)          -- 0 = PUBLIC
    ) THEN
        RAISE EXCEPTION 'A1 nie zadziałał: polityka nadal obowiązuje rolę PUBLIC';
    END IF;
END $$;
