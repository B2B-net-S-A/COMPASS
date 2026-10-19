-- „Ludzie w NEXUSIE” — archiwum przeniesionych modułów HR także w bazie (audyt 19.10.2026).
--
-- Przełącznik HR_MOVED_TO_NEXUS (env runtime) zatrzymuje zapis w server actions
-- (`assertHrModuleWritable`, lib/hr/moved-to-nexus.ts). RLS go nie zna, więc zalogowany
-- użytkownik z kluczem anon i własnym JWT dalej pisał przez Data API
-- (POST/PATCH/DELETE /rest/v1/…) m.in. urlopy, timesheety, obecność, stawki, premie,
-- placementy i sprawy skrzynki administracja@.
--
-- Co robi ta migracja:
--   1. `system_settings['hr_moved_to_nexus']` — lustro HR_MOVED_TO_NEXUS w bazie
--      (ten sam słownik i ta sama składnia: przecinki/średniki/spacje, wielkość liter
--      bez znaczenia, cudzysłowy wokół wpisów zdejmowane). Wiersz powstaje PUSTY,
--      więc sama migracja niczego nie blokuje.
--   2. `public.hr_module_list_contains(lista, moduł)` — czysty parser (IMMUTABLE),
--      `public.hr_module_moved(moduł)` — czyta ustawienie (SECURITY DEFINER, bo
--      `system_settings` widzi tylko admin).
--   3. Polityki RESTRICTIVE dla `authenticated` na INSERT/UPDATE/DELETE tabel modułów
--      leave, time, payroll, cases. Odczyt zostaje (archiwum jest jedynym odczytem).
--      Skrzynka (`cases`) dzieli tabele z helpdeskiem i rozmowami kontraktorów, więc tam
--      blokada dotyczy wyłącznie kategorii `inbox_%`.
--   4. Klucz `hr_moved_to_nexus` nie jest zapisywalny przez Data API (także dla admina):
--      zmienia go tylko SQL właściciela razem z env, bo inaczej jedno PATCH na
--      /rest/v1/system_settings zdejmowałoby całą blokadę.
--
-- Czego NIE robi:
--   * service_role omija RLS — akcje serwera na service kliencie działają jak dziś
--     (i odmawiają w kodzie). Funkcje SECURITY DEFINER właściciela `postgres`
--     (np. `sync_task_ticket`, `sync_conversation_ticket` — rozmowy kontraktorów)
--     też omijają RLS; żadna tabela nie ma FORCE ROW LEVEL SECURITY.
--   * `people` i `lifecycle` nie mają tu polityk: `profiles` pilnuje trigger
--     `pin_profile_privilege_columns` (pola kadrowe zmienia tylko admin / service).
--
-- Ścieżki modułów, które zostają w Compassie (Akademia, lifecycle, care, helpdesk),
-- sprawdzone w kodzie — żadna nie pisze klientem z ciasteczka do tabel zablokowanych
-- poniżej, poza helpdeskiem na `support_tickets`/`support_ticket_comments` w kategoriach
-- innych niż `inbox_%` (tych polityka nie dotyka). Lista w opisie PR.
--
-- KOLEJNOŚĆ: wartość w bazie ma być PODZBIOREM HR_MOVED_TO_NEXUS. Moduł w bazie bez
-- modułu w env = akcje na kliencie z ciasteczka (np. addEntry, createLeaveRequest)
-- dostają 42501 zamiast komunikatu „działa teraz w NEXUSIE”.
--
-- Ustawienie zgodne z produkcją (HR_MOVED_TO_NEXUS=people,leave,time,payroll,cases):
--   UPDATE public.system_settings SET value = 'people,leave,time,payroll,cases',
--          updated_at = now() WHERE key = 'hr_moved_to_nexus';

BEGIN;

-- ─── 1. Ustawienie ─────────────────────────────────────────────────────────
INSERT INTO public.system_settings (key, value, description)
VALUES (
    'hr_moved_to_nexus',
    '',
    'Moduły HR przeniesione do NEXUSA (lustro env HR_MOVED_TO_NEXUS): people, leave, time, payroll, lifecycle, care, cases. '
    || 'Pusta wartość = nic nie zablokowane. Zmieniaj tylko SQL-em razem z env; Data API tego klucza nie zapisze.'
)
ON CONFLICT (key) DO NOTHING;

-- ─── 2. Funkcje ────────────────────────────────────────────────────────────
-- Ta sama reguła co parseHrModuleList (lib/hr/moved-to-nexus.ts).
CREATE OR REPLACE FUNCTION public.hr_module_list_contains(p_list text, p_module text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $$
    SELECT COALESCE(btrim(p_module), '') <> ''
       AND EXISTS (
            SELECT 1
            FROM regexp_split_to_table(COALESCE(p_list, ''), '[[:space:],;]+') AS t(token)
            WHERE lower(btrim(t.token, '"''')) = lower(btrim(p_module))
       );
$$;

CREATE OR REPLACE FUNCTION public.hr_module_moved(p_module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT COALESCE((
        SELECT public.hr_module_list_contains(s.value, p_module)
        FROM public.system_settings s
        WHERE s.key = 'hr_moved_to_nexus'
    ), false);
$$;

REVOKE ALL ON FUNCTION public.hr_module_list_contains(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hr_module_moved(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hr_module_list_contains(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_module_moved(text) TO authenticated, service_role;

-- ─── 3. Tabele w całości należące do przeniesionego modułu ─────────────────
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT * FROM (VALUES
            ('leave_requests',     'leave'),
            ('timesheets',         'time'),
            ('timesheet_entries',  'time'),
            ('attendance_records', 'time'),
            ('user_rates',         'payroll'),
            ('bonuses',            'payroll'),
            ('placements',         'payroll'),
            ('support_inbox_meta', 'cases')
        ) AS v(tbl, module)
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'hr_archive_' || r.tbl || '_insert', r.tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'hr_archive_' || r.tbl || '_update', r.tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'hr_archive_' || r.tbl || '_delete', r.tbl);

        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated '
            || 'WITH CHECK (NOT (SELECT public.hr_module_moved(%L)))',
            'hr_archive_' || r.tbl || '_insert', r.tbl, r.module);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated '
            || 'USING (NOT (SELECT public.hr_module_moved(%L))) '
            || 'WITH CHECK (NOT (SELECT public.hr_module_moved(%L)))',
            'hr_archive_' || r.tbl || '_update', r.tbl, r.module, r.module);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated '
            || 'USING (NOT (SELECT public.hr_module_moved(%L)))',
            'hr_archive_' || r.tbl || '_delete', r.tbl, r.module);
    END LOOP;
END $$;

-- ─── 4. Skrzynka administracja@ w tabelach wspólnych z helpdeskiem ─────────
-- UPDATE sprawdza stary (USING) i nowy wiersz (WITH CHECK): nie da się ani edytować
-- sprawy skrzynki, ani przenieść zgłoszenia helpdesku do kategorii `inbox_%`.
DROP POLICY IF EXISTS hr_archive_support_tickets_insert ON public.support_tickets;
DROP POLICY IF EXISTS hr_archive_support_tickets_update ON public.support_tickets;
DROP POLICY IF EXISTS hr_archive_support_tickets_delete ON public.support_tickets;

CREATE POLICY hr_archive_support_tickets_insert ON public.support_tickets
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (NOT public.is_inbox_category(category_id) OR NOT (SELECT public.hr_module_moved('cases')));
CREATE POLICY hr_archive_support_tickets_update ON public.support_tickets
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (NOT public.is_inbox_category(category_id) OR NOT (SELECT public.hr_module_moved('cases')))
    WITH CHECK (NOT public.is_inbox_category(category_id) OR NOT (SELECT public.hr_module_moved('cases')));
CREATE POLICY hr_archive_support_tickets_delete ON public.support_tickets
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (NOT public.is_inbox_category(category_id) OR NOT (SELECT public.hr_module_moved('cases')));

DROP POLICY IF EXISTS hr_archive_support_ticket_comments_insert ON public.support_ticket_comments;
DROP POLICY IF EXISTS hr_archive_support_ticket_comments_update ON public.support_ticket_comments;
DROP POLICY IF EXISTS hr_archive_support_ticket_comments_delete ON public.support_ticket_comments;

CREATE POLICY hr_archive_support_ticket_comments_insert ON public.support_ticket_comments
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (
        NOT (SELECT public.hr_module_moved('cases'))
        OR NOT EXISTS (
            SELECT 1 FROM public.support_tickets t
            WHERE t.id = support_ticket_comments.ticket_id AND public.is_inbox_category(t.category_id)
        )
    );
CREATE POLICY hr_archive_support_ticket_comments_update ON public.support_ticket_comments
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (
        NOT (SELECT public.hr_module_moved('cases'))
        OR NOT EXISTS (
            SELECT 1 FROM public.support_tickets t
            WHERE t.id = support_ticket_comments.ticket_id AND public.is_inbox_category(t.category_id)
        )
    )
    WITH CHECK (
        NOT (SELECT public.hr_module_moved('cases'))
        OR NOT EXISTS (
            SELECT 1 FROM public.support_tickets t
            WHERE t.id = support_ticket_comments.ticket_id AND public.is_inbox_category(t.category_id)
        )
    );
CREATE POLICY hr_archive_support_ticket_comments_delete ON public.support_ticket_comments
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (
        NOT (SELECT public.hr_module_moved('cases'))
        OR NOT EXISTS (
            SELECT 1 FROM public.support_tickets t
            WHERE t.id = support_ticket_comments.ticket_id AND public.is_inbox_category(t.category_id)
        )
    );

-- ─── 5. Przełącznik nie do zdjęcia przez Data API ──────────────────────────
DROP POLICY IF EXISTS hr_archive_switch_insert ON public.system_settings;
DROP POLICY IF EXISTS hr_archive_switch_update ON public.system_settings;
DROP POLICY IF EXISTS hr_archive_switch_delete ON public.system_settings;

CREATE POLICY hr_archive_switch_insert ON public.system_settings
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (key <> 'hr_moved_to_nexus');
CREATE POLICY hr_archive_switch_update ON public.system_settings
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (key <> 'hr_moved_to_nexus')
    WITH CHECK (key <> 'hr_moved_to_nexus');
CREATE POLICY hr_archive_switch_delete ON public.system_settings
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (key <> 'hr_moved_to_nexus');

-- ─── Samosprawdzenie ───────────────────────────────────────────────────────
DO $$
DECLARE
    v_expected text[] := ARRAY[
        'leave_requests', 'timesheets', 'timesheet_entries', 'attendance_records',
        'user_rates', 'bonuses', 'placements', 'support_inbox_meta',
        'support_tickets', 'support_ticket_comments'
    ];
    v_tbl text;
    v_cmd text;
    v_missing text[] := '{}';
BEGIN
    -- Funkcje: istnieją, hr_module_moved jest SECURITY DEFINER (inaczej non-admin nie
    -- przeczyta system_settings i dostanie zawsze „nie przeniesione”).
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'hr_module_moved' AND p.prosecdef
    ) THEN
        RAISE EXCEPTION 'hr_moved_to_nexus: brak public.hr_module_moved(text) SECURITY DEFINER';
    END IF;
    IF NOT has_function_privilege('authenticated', 'public.hr_module_moved(text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'hr_moved_to_nexus: authenticated nie może wykonać hr_module_moved';
    END IF;

    -- Parser: te same przypadki co lib/hr/__tests__/moved-to-nexus.test.ts.
    IF NOT public.hr_module_list_contains('"people,leave"', 'people')
       OR NOT public.hr_module_list_contains('"people,leave"', 'leave')
       OR NOT public.hr_module_list_contains(' Leave, time ;payroll' || chr(10) || 'CARE ', 'care')
       OR NOT public.hr_module_list_contains('''time'' , "payroll"', 'payroll')
       OR public.hr_module_list_contains('leaves,time', 'leave')
       OR public.hr_module_list_contains('', 'leave')
       OR public.hr_module_list_contains(' , ', '')
       OR public.hr_module_list_contains(NULL, 'leave')
    THEN
        RAISE EXCEPTION 'hr_moved_to_nexus: parser listy modułów odbiega od parseHrModuleList';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'hr_moved_to_nexus') THEN
        RAISE EXCEPTION 'hr_moved_to_nexus: brak wiersza w system_settings';
    END IF;

    -- Polityki: każda tabela × INSERT/UPDATE/DELETE, RESTRICTIVE, tylko authenticated.
    FOREACH v_tbl IN ARRAY v_expected LOOP
        FOREACH v_cmd IN ARRAY ARRAY['insert', 'update', 'delete'] LOOP
            IF NOT EXISTS (
                SELECT 1 FROM pg_policies
                WHERE schemaname = 'public' AND tablename = v_tbl
                  AND policyname = 'hr_archive_' || v_tbl || '_' || v_cmd
                  AND permissive = 'RESTRICTIVE'
                  AND cmd = upper(v_cmd)
                  AND roles = ARRAY['authenticated']::name[]
            ) THEN
                v_missing := v_missing || (v_tbl || '.' || v_cmd);
            END IF;
        END LOOP;
    END LOOP;
    FOREACH v_cmd IN ARRAY ARRAY['insert', 'update', 'delete'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'system_settings'
              AND policyname = 'hr_archive_switch_' || v_cmd AND permissive = 'RESTRICTIVE'
        ) THEN
            v_missing := v_missing || ('system_settings.' || v_cmd);
        END IF;
    END LOOP;
    IF array_length(v_missing, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'hr_moved_to_nexus: brak polityk RESTRICTIVE: %', array_to_string(v_missing, ', ');
    END IF;

    -- RLS musi być włączone, inaczej polityki są dekoracją.
    IF EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY (v_expected || ARRAY['system_settings'])
          AND NOT c.relrowsecurity
    ) THEN
        RAISE EXCEPTION 'hr_moved_to_nexus: któraś z tabel nie ma włączonego RLS';
    END IF;
END $$;

COMMIT;
