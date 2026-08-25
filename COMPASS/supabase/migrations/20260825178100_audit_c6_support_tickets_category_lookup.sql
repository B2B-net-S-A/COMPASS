-- Audyt 2026-08-25 · KROK C6.3 — koniec 1,33 mln skanów sekwencyjnych support_categories
--
-- OBJAW (pg_stat_user_tables, statystyki zbierane od 2026-04-08, czyli 139 dni):
--   support_categories: 13 żywych wierszy, 1 333 124 skany sekwencyjne, 12 782 734
--   odczytane krotki. Tabela słownikowa czytana ponad milion razy.
--
-- PRZYCZYNA: polityki RLS na `support_tickets` wołają per wiersz funkcje przyjmujące
-- argument Z WIERSZA:
--     is_inbox_category(category_id)      -- SELECT EXISTS (... FROM support_categories ...)
--     is_contractor_category(category_id) -- j.w.  (jeśli krok C2 jej jeszcze nie skasował)
-- Obie są SQL/STABLE, ale mają klauzulę `SET search_path`, a funkcji z klauzulą SET
-- Postgres NIE WSTAWIA W MIEJSCE WYWOŁANIA (inlining). Każde wywołanie to osobne
-- uruchomienie funkcji, czyli osobny skan słownika. Przy 546 ticketach to ponad tysiąc
-- skanów na jedno wyświetlenie listy zgłoszeń — a listę odpytuje kanban Spraw, helpdesk
-- i kolejki People Ops. Mnożnik jest jeszcze większy w politykach support_ticket_comments,
-- które w podzapytaniu sięgają do support_tickets i po drodze uruchamiają całą tę RLS-kę.
--
-- NAPRAWA: zamiana wywołania funkcji na NIESKORELOWANE `IN (podzapytanie)`. Planista
-- wykonuje je jako zahaszowany SubPlan — słownik czytany RAZ na zapytanie, potem tanie
-- wyszukiwanie w tablicy haszującej per wiersz.
--
-- SEMANTYKA JEST TA SAMA, punkt po punkcie:
--   * `slug LIKE 'inbox_%'` przenosimy ZNAK W ZNAK. Podkreślnik jest w LIKE wieloznacznikiem
--     na jeden znak i tu nim pozostaje — „naprawienie" tego byłoby zmianą zachowania,
--     a nie optymalizacją, więc świadomie tego nie robimy.
--   * `support_categories` ma politykę SELECT `USING (true)` dla roli authenticated, a stare
--     funkcje NIE są SECURITY DEFINER — czyli już wcześniej czytały słownik jako pytający
--     użytkownik. Widoczność wierszy słownika się nie zmienia.
--   * category_id IS NULL: stare `is_inbox_category(NULL)` zwracało FALSE (EXISTS na pustym
--     zbiorze), nowe `NULL IN (niepusty zbiór)` zwraca NULL. W `CASE WHEN` oba znaczą
--     „nie-prawda", więc sterowanie schodzi do dokładnie tej samej gałęzi.
--
-- PRZY OKAZJI, TA SAMA KLASA BŁĘDU: bezargumentowe is_inbox_handler() / has_lifecycle_access()
-- / is_admin() też liczyły się per wiersz, a każde z nich to zapytanie do `profiles`.
-- Opakowane w `(SELECT ...)` stają się InitPlanem liczonym raz na zapytanie. Jedyna różnica
-- w zachowaniu jest nieszkodliwa: InitPlan wykona się nawet wtedy, gdy dawniej gałąź CASE
-- zostałaby pominięta — koszt to jedno wyszukiwanie `profiles` po kluczu głównym.
--
-- DLACZEGO PRZEPISUJEMY TEKSTOWO, A NIE PODAJEMY GOTOWEJ TREŚCI POLITYK:
-- te same cztery polityki przepisuje krok C2 (usuwa gałąź kontraktorską i kasuje
-- `is_contractor_category`), a krok C6.1 zawija w nich auth.uid(). Gdyby ta migracja niosła
-- treść polityki przepisaną z pamięci, jej wynik zależałby od tego, czy i w jakiej kolejności
-- tamte dwie wjadą — a `ALTER POLICY` nie zgłasza konfliktu, więc cofnięcie cudzej zmiany
-- przeszłoby niezauważone. Poniższy blok czyta polityki w momencie APLIKACJI i podmienia
-- w nich WYŁĄCZNIE wywołania funkcji, zachowując każdą gałąź, jaką tam zastanie.

DROP TABLE IF EXISTS _c63_before;

CREATE TEMP TABLE _c63_before AS
SELECT policyname, cmd, permissive, roles::text AS roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'support_tickets';

DO $do$
DECLARE
    r       record;
    v_using text;
    v_check text;
    v_sql   text;
    v_n     int := 0;
BEGIN
    FOR r IN SELECT * FROM pg_temp._c63_before ORDER BY policyname
    LOOP
        v_using := r.qual;
        v_check := r.with_check;

        -- 1. funkcje słownikowe z argumentem z wiersza → nieskorelowane podzapytanie
        v_using := regexp_replace(v_using,
            $q$is_inbox_category\(\s*category_id\s*\)$q$,
            $q$(category_id IN (SELECT c.id FROM public.support_categories c WHERE c.slug LIKE 'inbox_%'))$q$, 'g');
        v_check := regexp_replace(v_check,
            $q$is_inbox_category\(\s*category_id\s*\)$q$,
            $q$(category_id IN (SELECT c.id FROM public.support_categories c WHERE c.slug LIKE 'inbox_%'))$q$, 'g');

        v_using := regexp_replace(v_using,
            $q$is_contractor_category\(\s*category_id\s*\)$q$,
            $q$(category_id IN (SELECT c.id FROM public.support_categories c WHERE c.slug LIKE 'contractor_%'))$q$, 'g');
        v_check := regexp_replace(v_check,
            $q$is_contractor_category\(\s*category_id\s*\)$q$,
            $q$(category_id IN (SELECT c.id FROM public.support_categories c WHERE c.slug LIKE 'contractor_%'))$q$, 'g');

        -- 2. bezargumentowe funkcje pomocnicze → InitPlan. `(?<!SELECT )` czyni to
        --    idempotentnym, `(?<!\.)` chroni przed drugim opakowaniem `public.is_admin()`.
        v_using := regexp_replace(v_using,
            $q$(?<!SELECT )(?<!\.)\m(is_inbox_handler|has_lifecycle_access|is_admin)\(\)$q$,
            $q$(SELECT public.\1())$q$, 'g');
        v_check := regexp_replace(v_check,
            $q$(?<!SELECT )(?<!\.)\m(is_inbox_handler|has_lifecycle_access|is_admin)\(\)$q$,
            $q$(SELECT public.\1())$q$, 'g');

        CONTINUE WHEN v_using IS NOT DISTINCT FROM r.qual
                  AND v_check IS NOT DISTINCT FROM r.with_check;

        v_sql := format('ALTER POLICY %I ON public.support_tickets', r.policyname);
        IF v_using IS NOT NULL THEN
            v_sql := v_sql || format(' USING (%s)', v_using);
        END IF;
        IF v_check IS NOT NULL THEN
            v_sql := v_sql || format(' WITH CHECK (%s)', v_check);
        END IF;

        EXECUTE v_sql;
        v_n := v_n + 1;
    END LOOP;

    RAISE NOTICE 'C6.3: przepisano % polityk na support_tickets', v_n;
END $do$;

DO $do$
DECLARE
    v_drift text;
    v_left  text;
    r       record;
    v_tok   text;
    v_old_n int;
    v_new_n int;
BEGIN
    -- 1. Tożsamość polityk: żadna nie zniknęła, nie przybyła, nie zmieniła komendy ani ról.
    SELECT string_agg(sig, ', ') INTO v_drift FROM (
        (SELECT policyname || '§' || cmd || '§' || permissive || '§' || roles AS sig FROM pg_temp._c63_before
         EXCEPT
         SELECT policyname || '§' || cmd || '§' || permissive || '§' || roles::text
         FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_tickets')
        UNION ALL
        (SELECT policyname || '§' || cmd || '§' || permissive || '§' || roles::text
         FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_tickets'
         EXCEPT
         SELECT policyname || '§' || cmd || '§' || permissive || '§' || roles FROM pg_temp._c63_before)
    ) d;

    IF v_drift IS NOT NULL THEN
        RAISE EXCEPTION 'C6.3: zmieniła się tożsamość polityk support_tickets: %', v_drift;
    END IF;

    -- 2. Nie została ani jedna funkcja słownikowa wołana per wiersz.
    SELECT string_agg(policyname, ', ') INTO v_left
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'support_tickets'
      AND coalesce(qual, '') || coalesce(with_check, '') ~ 'is_(inbox|contractor)_category\(';

    IF v_left IS NOT NULL THEN
        RAISE EXCEPTION 'C6.3: polityki nadal wołają funkcję słownikową per wiersz: %', v_left;
    END IF;

    -- 3. Nic nie zostało opakowane dwa razy.
    SELECT string_agg(policyname, ', ') INTO v_left
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'support_tickets'
      AND coalesce(qual, '') || coalesce(with_check, '') ~ '\(\s*SELECT\s+\(\s*SELECT';

    IF v_left IS NOT NULL THEN
        RAISE EXCEPTION 'C6.3: podwójne opakowanie w politykach: %', v_left;
    END IF;

    -- 4. Struktura warunku nietknięta: tyle samo gałęzi CASE i tyle samo odwołań do
    --    każdego składnika decyzyjnego, co przed migracją. To dowód, że podmieniliśmy
    --    wyłącznie sposób WYLICZANIA warunku, a nie to, KOGO on wpuszcza.
    FOR r IN
        SELECT b.policyname,
               coalesce(b.qual, '') || ' ' || coalesce(b.with_check, '') AS old_txt,
               coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') AS new_txt
        FROM pg_temp._c63_before b
        JOIN pg_policies p
          ON p.schemaname = 'public' AND p.tablename = 'support_tickets'
         AND p.policyname = b.policyname
    LOOP
        FOREACH v_tok IN ARRAY ARRAY[
            'WHEN', 'ELSE', 'user_id', 'assignee_id', 'auth.uid',
            'is_admin', 'is_inbox_handler', 'has_lifecycle_access'
        ]
        LOOP
            v_old_n := (length(r.old_txt) - length(replace(r.old_txt, v_tok, ''))) / length(v_tok);
            v_new_n := (length(r.new_txt) - length(replace(r.new_txt, v_tok, ''))) / length(v_tok);
            IF v_old_n <> v_new_n THEN
                RAISE EXCEPTION
                    'C6.3: polityka % zmieniła strukturę — token "%" występował % razy, teraz %. PRZED: %  PO: %',
                    r.policyname, v_tok, v_old_n, v_new_n, r.old_txt, r.new_txt;
            END IF;
        END LOOP;
    END LOOP;
END $do$;

DROP TABLE IF EXISTS _c63_before;
