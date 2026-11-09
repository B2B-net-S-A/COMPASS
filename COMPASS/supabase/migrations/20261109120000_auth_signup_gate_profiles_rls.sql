-- Bramka zakładania kont i `profiles` według roli (audyt 2026-11-09).
--
-- Stan przed: Supabase Auth ma publiczną rejestrację, a domena @b2bnetwork.pl jest
-- sprawdzana tylko w kodzie aplikacji (`app/login/actions.ts`, `lib/actions/user-admin.ts`),
-- czyli bezpośrednie POST /auth/v1/signup ją omija. Polityka SELECT na `profiles` miała
-- USING(true), więc każde konto czytało wszystkie kolumny wszystkich osób.
--
-- Co robi ta migracja:
--   1. `academy_learner_accounts` — lista kont Akademii spoza domeny (na razie pusta).
--      Bez polityk i bez uprawnień klienta: czyta i pisze tylko service_role.
--   2. Wyzwalacz BEFORE INSERT na `auth.users` przepuszcza @b2bnetwork.pl i adresy
--      z tej listy (bez `ended_at`). SSO nowych pracowników zakłada konto tą samą ścieżką.
--      Warunek celowo nie czyta `raw_user_meta_data`: te pola ustawia klient przy signup.
--   3. `profiles`: własny wiersz albo rola biurowa wołającego (`is_internal_or_admin()`,
--      SECURITY DEFINER właściciela tabeli, bez rekursji). Poprzednia polityka zespołowa
--      ograniczała wiersze do ról biurowych, więc nowa ją zastępuje i rozszerza dla biura.
--   4. `people_display_names` — samo imię i awatar osób, które konto ma prawo widzieć
--      jako autorów, prowadzących, opiekunów zgłoszeń i uczestników dyskusji.
--   5. Tanie domknięcia z przeglądu (sekcja 5 niżej).
--
-- KOLEJNOŚĆ WDROŻENIA: (1) kod z tego PR-a, bo przed migracją korzysta z zapasowego
-- odczytu `profiles`, (2) ta migracja przez `apply_migration`, (3) ponowne włączenie
-- rejestracji w panelu. Odwrotnie: konsultanci stracą nazwiska do czasu wdrożenia kodu,
-- a powiadomienia adminów o ich zgłoszeniach przestaną wychodzić.
--
-- Poza zakresem wyzwalacza: `createExternalEmployee` zakłada konta z adresem spoza domeny,
-- ale od przeniesienia modułu `people` do NEXUSA odmawia wcześniej (`assertHrModuleWritable`).
-- Cofnięcie tego przełącznika wymaga decyzji o tej ścieżce, bo wyzwalacz ją odrzuci.

BEGIN;

-- ─── 1. Lista kont Akademii spoza domeny ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_learner_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE CHECK (email = lower(email) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
    full_name text,
    source text,
    source_ref text,
    -- SET NULL: twarde usunięcie konta (RODO) nie może się potknąć o ten wpis.
    user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    info_accepted_at timestamptz,
    first_login_at timestamptz,
    ended_at timestamptz
);

ALTER TABLE public.academy_learner_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_learner_accounts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.academy_learner_accounts TO service_role;

-- ─── 2. Bramka na auth.users ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.account_email_allowed(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(
        lower(p_email) ~ '^[^@[:space:]]+@b2bnetwork\.pl$'
        OR EXISTS (
            SELECT 1 FROM public.academy_learner_accounts a
            WHERE a.email = lower(p_email) AND a.ended_at IS NULL
        ),
        false
    );
$$;

CREATE OR REPLACE FUNCTION public.enforce_account_email_allowlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.account_email_allowed(NEW.email) THEN
        -- Bez adresu w treści: komunikat trafia do logów Auth.
        RAISE EXCEPTION 'account_email_not_allowed' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

-- Lista adresów nie może być wyrocznią dostępną z Data API. Wyzwalacz działa bez EXECUTE
-- po stronie supabase_auth_admin: uprawnienie sprawdzane jest tylko przy CREATE TRIGGER.
REVOKE ALL ON FUNCTION public.account_email_allowed(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_account_email_allowlist() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_account_email_allowlist ON auth.users;
CREATE TRIGGER enforce_account_email_allowlist
    BEFORE INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.enforce_account_email_allowlist();

-- ─── 3. profiles według roli ───────────────────────────────────────────────
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS profiles_select_team_for_internal_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_select_own_or_office ON public.profiles;

CREATE POLICY profiles_select_own_or_office ON public.profiles
    FOR SELECT TO authenticated
    USING (id = (SELECT auth.uid()) OR (SELECT public.is_internal_or_admin()));

-- ─── 4. Nazwiska dla konta bez roli biurowej ───────────────────────────────
-- Tylko imię i awatar, tylko osoby ze wskazanych źródeł. Rola biurowa czyta `profiles`
-- i tak, więc dostaje wszystkie wskazane identyfikatory.
CREATE OR REPLACE FUNCTION public.people_display_names(p_user_ids uuid[])
RETURNS TABLE (id uuid, full_name text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT p.id, p.full_name, p.avatar_url
    FROM public.profiles p
    WHERE auth.uid() IS NOT NULL
      AND p.id = ANY (p_user_ids)
      AND (
          p.id = auth.uid()
          OR public.is_internal_or_admin()
          OR EXISTS (SELECT 1 FROM public.news_posts n
                     WHERE n.author_id = p.id AND n.published_at IS NOT NULL)
          OR EXISTS (SELECT 1 FROM public.support_tickets t
                     WHERE t.user_id = auth.uid() AND t.assignee_id = p.id)
          OR EXISTS (SELECT 1 FROM public.support_ticket_comments c
                     JOIN public.support_tickets t ON t.id = c.ticket_id
                     WHERE t.user_id = auth.uid() AND c.author_id = p.id AND NOT c.is_internal)
          OR (public.academy_can_access() AND (
              EXISTS (SELECT 1 FROM public.courses c
                      WHERE c.author_id = p.id AND c.status IN ('published', 'archived'))
              OR EXISTS (SELECT 1 FROM public.course_staff s
                         WHERE s.user_id = p.id AND s.revoked_at IS NULL)
              OR EXISTS (SELECT 1 FROM public.course_run_staff s
                         WHERE s.user_id = p.id AND s.revoked_at IS NULL)
              OR EXISTS (SELECT 1 FROM public.course_questions q
                         WHERE q.user_id = p.id AND public.academy_can_read_discussion(q.id))
              OR EXISTS (SELECT 1 FROM public.course_answers a
                         WHERE a.user_id = p.id AND public.academy_can_read_discussion(a.question_id))
          ))
      );
$$;

REVOKE ALL ON FUNCTION public.people_display_names(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_display_names(uuid[]) TO authenticated, service_role;

-- ─── 5. Domknięcia z przeglądu ─────────────────────────────────────────────
-- Reakcje: polityka nazywa się „via_post_access”, ale miała USING(true). Podzapytanie
-- działa z RLS wołającego, więc dziedziczy widoczność wpisu (także `audience_role`).
DROP POLICY IF EXISTS news_reactions_select_via_post_access ON public.news_reactions;
CREATE POLICY news_reactions_select_via_post_access ON public.news_reactions
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.news_posts n WHERE n.id = news_reactions.post_id));

-- Awatar: ścieżka zapisu wiązana z właścicielem, tak jak już robi polityka UPDATE.
DROP POLICY IF EXISTS "Anyone can upload an avatar" ON storage.objects;
CREATE POLICY "Users can upload own avatar" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND name LIKE 'profiles/' || (SELECT auth.uid())::text || '-%');

-- Kubeł po usuniętym komunikatorze (audyt C4): publiczny, zapis dla każdego konta,
-- 0 obiektów, brak odwołań w kodzie.
DROP POLICY IF EXISTS "Users can upload chat attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view chat attachments" ON storage.objects;
UPDATE storage.buckets SET public = false WHERE id = 'chat-attachments';

-- Anon nie potrzebuje ani wyszukiwarki kursów, ani widoku po zegarze pracy.
-- PUBLIC też: domyślne EXECUTE dla PUBLIC zostawiałoby anonowi dostęp mimo REVOKE.
-- `match_courses` nie ma wywołań w kodzie, więc authenticated niczego tu nie traci.
REVOKE EXECUTE ON FUNCTION public.match_courses(public.vector, double precision, integer) FROM PUBLIC, anon;
REVOKE SELECT ON public.work_clock_daily FROM anon;

-- ─── Samosprawdzenie ───────────────────────────────────────────────────────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'auth.users'::regclass
          AND tgname = 'enforce_account_email_allowlist'
          AND tgenabled = 'O'
    ) THEN
        RAISE EXCEPTION 'auth gate: brak włączonego wyzwalacza na auth.users';
    END IF;

    IF NOT public.account_email_allowed('Nowy.Pracownik@b2bnetwork.pl') THEN
        RAISE EXCEPTION 'auth gate: odrzucony adres z domeny firmy';
    END IF;
    IF public.account_email_allowed('ktos@b2bnetwork.pl.example.com')
       OR public.account_email_allowed('ktos@xb2bnetwork.pl')
       OR public.account_email_allowed('ktos@example.com')
       OR public.account_email_allowed(NULL) THEN
        RAISE EXCEPTION 'auth gate: przepuszczony adres spoza listy';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'profiles' AND cmd = 'SELECT'
          AND qual IN ('true', '(true)')
    ) THEN
        RAISE EXCEPTION 'profiles: została polityka SELECT USING(true)';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'profiles'
          AND policyname = 'profiles_select_own_or_office'
    ) THEN
        RAISE EXCEPTION 'profiles: brak polityki profiles_select_own_or_office';
    END IF;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.academy_learner_accounts'::regclass) THEN
        RAISE EXCEPTION 'academy_learner_accounts: RLS wyłączone';
    END IF;
    IF has_table_privilege('authenticated', 'public.academy_learner_accounts', 'SELECT,INSERT,UPDATE,DELETE')
       OR has_table_privilege('anon', 'public.academy_learner_accounts', 'SELECT,INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'academy_learner_accounts: klient ma uprawnienia';
    END IF;

    IF has_function_privilege('authenticated', 'public.account_email_allowed(text)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.account_email_allowed(text)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.enforce_account_email_allowlist()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.enforce_account_email_allowlist()', 'EXECUTE') THEN
        RAISE EXCEPTION 'auth gate: funkcja wykonywalna przez klienta';
    END IF;

    IF NOT has_function_privilege('authenticated', 'public.people_display_names(uuid[])', 'EXECUTE')
       OR has_function_privilege('anon', 'public.people_display_names(uuid[])', 'EXECUTE') THEN
        RAISE EXCEPTION 'people_display_names: złe uprawnienia';
    END IF;

    IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'chat-attachments' AND public) THEN
        RAISE EXCEPTION 'chat-attachments: kubeł nadal publiczny';
    END IF;
    IF has_function_privilege('anon', 'public.match_courses(public.vector, double precision, integer)', 'EXECUTE')
       OR has_table_privilege('anon', 'public.work_clock_daily', 'SELECT') THEN
        RAISE EXCEPTION 'anon: nadal ma dostęp do match_courses albo work_clock_daily';
    END IF;
END $$;

COMMIT;
