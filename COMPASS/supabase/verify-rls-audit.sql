-- ════════════════════════════════════════════════════════════════════════════
-- B5 — testy pilnujące Etapu A audytu 2026-08-25
--
-- URUCHOM PO zastosowaniu migracji A1 → A2 → A3 → A3.2 → A4.
-- Cały skrypt działa w transakcji zakończonej ROLLBACK, więc NICZEGO nie zmienia.
--
-- Po co: bez tego pierwsza „porządkująca" migracja RLS cicho odtworzy dziurę,
-- a nikt tego nie zauważy — polityka permisywna nie generuje żadnego sygnału.
-- Advisor Supabase też nie pomoże: sprawdza BRAK RLS, nie permisywność `using(true)`.
--
-- Uruchomienie (MCP execute_sql albo psql). Sukces = same wiersze 'OK'.
-- Pierwsza asercja, która padnie, przerywa skrypt komunikatem RAISE EXCEPTION.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
    v_consultant uuid;
    v_admin      uuid;
    v_count      int;
    v_role       text;
    v_txt        text;
BEGIN
    SELECT id INTO v_consultant FROM public.profiles WHERE role = 'consultant'
      AND employment_status IS DISTINCT FROM 'exited' ORDER BY created_at LIMIT 1;
    SELECT id INTO v_admin FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1;

    IF v_consultant IS NULL OR v_admin IS NULL THEN
        RAISE EXCEPTION 'B5: brak konta konsultanta lub admina do testu — dopasuj zapytania do stanu bazy';
    END IF;

    -- ─── A1: anonimowy odczyt profiles ────────────────────────────────────
    -- Klucz anon jest publiczny (siedzi w bundlu przeglądarki), więc polityka
    -- `using(true)` dla PUBLIC = katalog pracowników dostępny bez logowania.
    SET LOCAL ROLE anon;
    SELECT count(*) INTO v_count FROM public.profiles;
    RESET ROLE;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'A1 ZŁAMANE: rola anon widzi % profili (ma widzieć 0)', v_count;
    END IF;
    RAISE NOTICE 'OK  A1 — anon nie czyta profiles';

    -- ─── A3: samodzielne nadanie sobie roli ───────────────────────────────
    -- RLS jest WIERSZOWA, a `authenticated` ma GRANT UPDATE na wszystkich
    -- kolumnach — pilnuje tego trigger, nie polityka.
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_consultant, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
        UPDATE public.profiles SET role = 'admin' WHERE id = v_consultant;
    EXCEPTION WHEN others THEN NULL;  -- odrzucenie też jest poprawnym wynikiem
    END;
    RESET ROLE;
    SELECT role::text INTO v_role FROM public.profiles WHERE id = v_consultant;
    IF v_role <> 'consultant' THEN
        RAISE EXCEPTION 'A3 ZŁAMANE: konsultant nadał sobie rolę % przez zwykły UPDATE', v_role;
    END IF;
    RAISE NOTICE 'OK  A3 — rola nie do podniesienia przez UPDATE';

    -- Ta sama ochrona dla flag grantów — nie są objęte sync_user_role przy
    -- logowaniu, więc ich podniesienie byłoby TRWAŁE.
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_consultant, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
        UPDATE public.profiles SET has_tcm_access = true, can_view_legal_monitor = true
        WHERE id = v_consultant;
    EXCEPTION WHEN others THEN NULL;
    END;
    RESET ROLE;
    IF EXISTS (SELECT 1 FROM public.profiles
               WHERE id = v_consultant AND (has_tcm_access OR can_view_legal_monitor)) THEN
        RAISE EXCEPTION 'A3 ZŁAMANE: konsultant nadał sobie flagi grantów';
    END IF;
    RAISE NOTICE 'OK  A3 — flagi grantów nie do podniesienia';

    -- ─── A2: RPC z EXECUTE dla authenticated ──────────────────────────────
    -- sync_user_role przyjmuje p_user_id i p_is_super_admin od wywołującego
    -- i nie sprawdza auth.uid() — dlatego uprawnienie musi być odebrane.
    IF has_function_privilege('authenticated',
        'public.sync_user_role(uuid, text, boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'A2 ZŁAMANE: authenticated może wykonać sync_user_role';
    END IF;
    RAISE NOTICE 'OK  A2 — sync_user_role niedostępne dla authenticated';

    FOR v_txt IN
        SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('start_offboarding_for_user', 'start_onboarding_for_user')
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    LOOP
        RAISE EXCEPTION 'A2 ZŁAMANE: authenticated może wykonać %', v_txt;
    END LOOP;
    RAISE NOTICE 'OK  A2 — funkcje lifecycle niedostępne dla authenticated';

    -- ─── A3.2: podrabianie dziennika audytu ───────────────────────────────
    -- Poza fałszowaniem dowodów HR to wektor sterujący: throttle samoleczenia
    -- reguł przekierowania poczty czyta wpis FORWARD_RECONCILE_RUN.
    PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_consultant, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
        INSERT INTO public.audit_logs (user_id, action, details)
        VALUES (v_admin, 'ROLE_CHANGE', '{"podrobione": true}'::jsonb);
        RESET ROLE;
        RAISE EXCEPTION 'A3.2 ZŁAMANE: konsultant dopisał wpis audytowy z cudzym user_id';
    EXCEPTION
        WHEN insufficient_privilege THEN RESET ROLE;
        WHEN others THEN
            RESET ROLE;
            IF SQLSTATE <> '42501' THEN RAISE; END IF;
    END;
    RAISE NOTICE 'OK  A3.2 — audytu nie da się podrobić';

    -- ─── A4: upload załącznika do wniosku urlopowego ──────────────────────
    -- Bucket `documents` nie miał polityki INSERT dla prefiksu leave-proofs,
    -- więc zwolnienia L4 nigdy nie dało się załączyć (0 obiektów w buckecie).
    IF NOT EXISTS (
        SELECT 1 FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'storage' AND c.relname = 'objects'
          AND p.polname = 'leave_proofs_insert_own'
    ) THEN
        RAISE EXCEPTION 'A4 ZŁAMANE: brak polityki INSERT dla prefiksu leave-proofs';
    END IF;
    RAISE NOTICE 'OK  A4 — upload zwolnienia L4 ma politykę';

    -- ─── A4.6: limity bucketów ────────────────────────────────────────────
    SELECT string_agg(id, ', ') INTO v_txt FROM storage.buckets
    WHERE file_size_limit IS NULL OR allowed_mime_types IS NULL;
    IF v_txt IS NOT NULL THEN
        RAISE EXCEPTION 'A4.6 ZŁAMANE: buckety bez limitu rozmiaru/MIME: %', v_txt;
    END IF;
    RAISE NOTICE 'OK  A4.6 — wszystkie buckety mają limity';

    RAISE NOTICE '───────────────────────────────────';
    RAISE NOTICE 'WSZYSTKIE ASERCJE B5 PRZESZŁY';
END $$;

ROLLBACK;
