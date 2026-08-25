-- Audyt 2026-08-25 · KROK C6.1 — auth.uid() w politykach RLS liczone raz na zapytanie
--
-- 145 polityk w schemacie `public` (66 tabel, 203 wystąpienia auth.uid() + 1 auth.role())
-- woła funkcję auth.* BEZ opakowania w podzapytanie skalarne. Planista traktuje takie
-- wywołanie jak wyrażenie zależne od wiersza i wykonuje je RAZ NA KAŻDY SKANOWANY WIERSZ.
-- Opakowanie w `(select auth.uid())` zamienia je w InitPlan liczony raz na całe zapytanie.
-- Warunek pozostaje ten sam: auth.uid() jest STABLE i czyta wyłącznie GUC sesji, więc
-- podniesienie go przed skan NIE MOŻE zmienić wyniku. To rekomendacja advisora Supabase
-- `auth_rls_initplan` — 145 z 453 wszystkich trafień advisora wydajności.
--
-- DLACZEGO DYNAMICZNIE, A NIE 145 SZTYWNYCH `ALTER POLICY`:
-- ta migracja wjeżdża w paczce z krokami A1/A3.2, które przepisują treść polityk
-- (`Public profiles are viewable by everyone.`, `Authenticated users can insert audit logs`).
-- Gdyby C6.1 niosła treść polityk odczytaną z produkcji DZIŚ — czyli sprzed A1/A3.2 —
-- zastosowana PO nich cofnęłaby tamte poprawki bezpieczeństwa i nikt by tego nie zauważył,
-- bo `ALTER POLICY` nie zgłasza konfliktu. Blok poniżej czyta pg_policies w momencie
-- APLIKACJI, więc opakowuje to, co realnie jest w bazie, i jest odporny na kolejność
-- migracji oraz na każdą zmianę polityk wprowadzoną w międzyczasie.
--
-- Idempotentna: wzorzec ma negatywne wsteczne spojrzenie `(?<!SELECT )`, więc powtórne
-- uruchomienie nie zawija już zawiniętych wywołań (brak `(select (select auth.uid()))`).
--
-- Z tego samego powodu ta migracja ma NAJPÓŹNIEJSZY znacznik czasu w całej paczce audytu:
-- przejeżdża na końcu, więc zawija auth.uid() także w politykach, które po drodze utworzyły
-- lub przepisały kroki A1/A3.2/C2/C3/C6.3. Kolejność względem C6.3 i tak jest obojętna —
-- obie migracje podmieniają rozłączne zbiory wywołań i każda zachowuje wynik drugiej.
--
-- Zakres to WYŁĄCZNIE schemat `public`. Polityki na `storage.objects` są własnością
-- kroku A4 i celowo nie są tu ruszane.

DROP TABLE IF EXISTS _c6_plan;

CREATE TEMP TABLE _c6_plan AS
SELECT
    p.schemaname,
    p.tablename,
    p.policyname,
    p.qual       AS old_using,
    p.with_check AS old_check,
    regexp_replace(p.qual,
        '(?<!SELECT )auth\.(uid|jwt|role|email)\(\)', '(select auth.\1())', 'g') AS new_using,
    regexp_replace(p.with_check,
        '(?<!SELECT )auth\.(uid|jwt|role|email)\(\)', '(select auth.\1())', 'g') AS new_check
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND (coalesce(p.qual, '')       ~ '(?<!SELECT )auth\.(uid|jwt|role|email)\(\)'
    OR coalesce(p.with_check, '') ~ '(?<!SELECT )auth\.(uid|jwt|role|email)\(\)');

-- Odcisk tożsamości polityk sprzed zmiany. Sam licznik nie wystarczy: `ALTER POLICY`
-- potrafi też podmienić listę ról, a to byłaby zmiana uprawnień przemycona pod pozorem
-- optymalizacji. Odcisk obejmuje tabelę, nazwę, komendę, permissive i role.
DROP TABLE IF EXISTS _c6_identity;

CREATE TEMP TABLE _c6_identity AS
SELECT tablename || '§' || policyname || '§' || cmd || '§' || permissive || '§' || roles::text AS sig
FROM pg_policies
WHERE schemaname = 'public';

DO $$
DECLARE
    r     record;
    v_sql text;
    v_n   int := 0;
BEGIN
    FOR r IN SELECT * FROM pg_temp._c6_plan ORDER BY tablename, policyname
    LOOP
        v_sql := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
        IF r.new_using IS NOT NULL THEN
            v_sql := v_sql || format(' USING (%s)', r.new_using);
        END IF;
        IF r.new_check IS NOT NULL THEN
            v_sql := v_sql || format(' WITH CHECK (%s)', r.new_check);
        END IF;

        EXECUTE v_sql;
        v_n := v_n + 1;
    END LOOP;

    RAISE NOTICE 'C6.1: przepisano % polityk', v_n;
END $$;

DO $$
DECLARE
    v_before int;
    v_after  int;
    v_drift  text;
    v_left   text;
    v_bad    record;
BEGIN
    SELECT count(*) INTO v_before FROM pg_temp._c6_identity;
    SELECT count(*) INTO v_after  FROM pg_policies WHERE schemaname = 'public';

    IF v_before <> v_after THEN
        RAISE EXCEPTION 'C6.1: liczba polityk zmieniła się (przed %, po %)', v_before, v_after;
    END IF;

    -- Tożsamość co do sztuki: żadna polityka nie zniknęła, nie przybyła i nie zmieniła ról.
    SELECT string_agg(sig, ', ') INTO v_drift FROM (
        (SELECT sig FROM pg_temp._c6_identity
         EXCEPT
         SELECT tablename || '§' || policyname || '§' || cmd || '§' || permissive || '§' || roles::text
         FROM pg_policies WHERE schemaname = 'public')
        UNION ALL
        (SELECT tablename || '§' || policyname || '§' || cmd || '§' || permissive || '§' || roles::text
         FROM pg_policies WHERE schemaname = 'public'
         EXCEPT
         SELECT sig FROM pg_temp._c6_identity)
    ) d;

    IF v_drift IS NOT NULL THEN
        RAISE EXCEPTION 'C6.1: zmieniła się tożsamość polityk (tabela/nazwa/komenda/role): %', v_drift;
    END IF;

    -- Nic nie zostało niezawinięte.
    SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_left
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '')       ~ '(?<!SELECT )auth\.(uid|jwt|role|email)\(\)'
        OR coalesce(with_check, '') ~ '(?<!SELECT )auth\.(uid|jwt|role|email)\(\)');

    IF v_left IS NOT NULL THEN
        RAISE EXCEPTION 'C6.1: nadal niezawinięte auth.*(): %', v_left;
    END IF;

    -- Najmocniejszy test: po zdjęciu opakowań treść każdej polityki musi być ZNAKOWO
    -- identyczna ze stanem sprzed migracji. To dowód, że jedyną zmianą jest `(select ...)`.
    FOR v_bad IN
        SELECT pl.tablename, pl.policyname, pl.old_using, pl.old_check, p.qual, p.with_check
        FROM pg_temp._c6_plan pl
        JOIN pg_policies p
          ON p.schemaname = pl.schemaname
         AND p.tablename  = pl.tablename
         AND p.policyname = pl.policyname
        WHERE regexp_replace(p.qual,
                  '\(\s*SELECT\s+auth\.(uid|jwt|role|email)\(\)(\s+AS\s+"?[A-Za-z_]+"?)?\s*\)',
                  'auth.\1()', 'g') IS DISTINCT FROM pl.old_using
           OR regexp_replace(p.with_check,
                  '\(\s*SELECT\s+auth\.(uid|jwt|role|email)\(\)(\s+AS\s+"?[A-Za-z_]+"?)?\s*\)',
                  'auth.\1()', 'g') IS DISTINCT FROM pl.old_check
    LOOP
        RAISE EXCEPTION
            'C6.1: treść polityki %.% zmieniła się poza opakowaniem.  PRZED USING: %  PO USING: %  PRZED CHECK: %  PO CHECK: %',
            v_bad.tablename, v_bad.policyname, v_bad.old_using, v_bad.qual, v_bad.old_check, v_bad.with_check;
    END LOOP;
END $$;

DROP TABLE IF EXISTS _c6_plan;
DROP TABLE IF EXISTS _c6_identity;
