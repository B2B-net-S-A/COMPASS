-- Smoke test migracji 20261109120000_auth_signup_gate_profiles_rls.sql.
-- TYLKO lokalny `postgres:17` po stubie (auth_signup_gate_stub.sql) i migracji.
-- Na produkcji nie uruchamiać: tworzy konta w auth.users. Całość kończy ROLLBACK.
\set ON_ERROR_STOP on
BEGIN;

-- ─── Zakładanie kont: tak jak GoTrue, przez rolę supabase_auth_admin ───────
SET LOCAL ROLE supabase_auth_admin;
DO $$
DECLARE
    v_rejected boolean;
    v_email text;
BEGIN
    -- SSO / zaproszenie nowego pracownika przechodzi, także z wielkimi literami.
    INSERT INTO auth.users (id, email) VALUES
        ('00000000-0000-0000-0000-00000000000a', 'admin@b2bnetwork.pl'),
        ('00000000-0000-0000-0000-00000000000b', 'biuro@b2bnetwork.pl'),
        ('00000000-0000-0000-0000-00000000000c', 'konsultant@b2bnetwork.pl'),
        ('00000000-0000-0000-0000-00000000000d', 'drugi.konsultant@b2bnetwork.pl'),
        ('00000000-0000-0000-0000-00000000000e', 'Autor.SSO@B2BNETWORK.PL');

    FOREACH v_email IN ARRAY ARRAY[
        'obcy@example.com',
        'obcy@b2bnetwork.pl.example.com',
        'obcy@xb2bnetwork.pl',
        'obcy@example.com@b2bnetwork.pl',
        E'obcy@b2bnetworK.pl',
        E'obcy@b2bnetwork.pl\n',
        ' obcy@b2bnetwork.pl'
    ] LOOP
        v_rejected := false;
        BEGIN
            INSERT INTO auth.users (email) VALUES (v_email);
        EXCEPTION WHEN raise_exception THEN v_rejected := true;
        END;
        IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: przyjęty adres spoza listy: %', v_email; END IF;
    END LOOP;

    -- Konto bez adresu (anonimowe, telefon) też odpada.
    v_rejected := false;
    BEGIN
        INSERT INTO auth.users (email) VALUES (NULL);
    EXCEPTION WHEN raise_exception THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: przyjęte konto bez adresu'; END IF;

    -- Metadane ustawia klient przy signup, więc nie mogą otwierać bramki.
    v_rejected := false;
    BEGIN
        INSERT INTO auth.users (email, raw_user_meta_data)
        VALUES ('obcy@example.com', '{"is_external": true, "role": "admin"}');
    EXCEPTION WHEN raise_exception THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: metadane otworzyły bramkę'; END IF;
END $$;
RESET ROLE;

-- Lista Akademii: aktywny wpis przepuszcza, zakończony nie.
INSERT INTO public.academy_learner_accounts (email, source) VALUES ('uczestnik@example.com', 'smoke');
INSERT INTO public.academy_learner_accounts (email, source, ended_at) VALUES ('byly@example.com', 'smoke', now());
SET LOCAL ROLE supabase_auth_admin;
DO $$
DECLARE v_rejected boolean := false;
BEGIN
    INSERT INTO auth.users (id, email) VALUES ('00000000-0000-0000-0000-00000000000f', 'Uczestnik@Example.com');
    BEGIN
        INSERT INTO auth.users (email) VALUES ('byly@example.com');
    EXCEPTION WHEN raise_exception THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: zakończony wpis przepuszczony'; END IF;
END $$;
RESET ROLE;

-- ─── Dane: role, jeden autor, jedno zgłoszenie ─────────────────────────────
UPDATE public.profiles SET role = 'admin', full_name = 'Admin' WHERE id = '00000000-0000-0000-0000-00000000000a';
UPDATE public.profiles SET role = 'internal', full_name = 'Biuro', phone = '500600700' WHERE id = '00000000-0000-0000-0000-00000000000b';
UPDATE public.profiles SET full_name = 'Konsultant' WHERE id = '00000000-0000-0000-0000-00000000000c';
UPDATE public.profiles SET full_name = 'Drugi' WHERE id = '00000000-0000-0000-0000-00000000000d';
UPDATE public.profiles SET full_name = 'Autor', role = 'talent_community' WHERE id = '00000000-0000-0000-0000-00000000000e';
INSERT INTO public.courses (author_id, status) VALUES ('00000000-0000-0000-0000-00000000000e', 'published');
INSERT INTO public.support_tickets (id, user_id, assignee_id)
    VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000b');
INSERT INTO public.news_posts (id, author_id, published_at, audience_role)
    VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000a', now(), ARRAY['internal']);
INSERT INTO public.news_reactions (post_id, user_id) VALUES ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-00000000000b');

-- ─── Konto consultant: widzi tylko siebie ──────────────────────────────────
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
    v_count integer;
    v_rejected boolean := false;
BEGIN
    SELECT count(*) INTO v_count FROM public.profiles;
    IF v_count <> 1 THEN RAISE EXCEPTION 'SMOKE: consultant czyta % wierszy zamiast 1', v_count; END IF;

    SELECT count(*) INTO v_count FROM public.people_display_names(ARRAY[
        '00000000-0000-0000-0000-00000000000e'::uuid,   -- autor kursu
        '00000000-0000-0000-0000-00000000000b'::uuid,   -- opiekun własnego zgłoszenia
        '00000000-0000-0000-0000-00000000000d'::uuid    -- inny konsultant, bez związku
    ]);
    IF v_count <> 2 THEN RAISE EXCEPTION 'SMOKE: RPC zwróciło % osób zamiast 2', v_count; END IF;
    IF EXISTS (SELECT 1 FROM public.people_display_names(ARRAY['00000000-0000-0000-0000-00000000000d'::uuid])) THEN
        RAISE EXCEPTION 'SMOKE: RPC ujawniło osobę bez związku';
    END IF;

    SELECT count(*) INTO v_count FROM public.news_reactions;
    IF v_count <> 0 THEN RAISE EXCEPTION 'SMOKE: widać reakcje pod wpisem spoza odbiorców'; END IF;

    BEGIN
        PERFORM 1 FROM public.academy_learner_accounts;
    EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: klient czyta academy_learner_accounts'; END IF;

    v_rejected := false;
    BEGIN
        PERFORM public.account_email_allowed('x@example.com');
    EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: klient woła account_email_allowed'; END IF;

    v_rejected := false;
    BEGIN
        INSERT INTO storage.objects (bucket_id, name)
        VALUES ('avatars', 'profiles/00000000-0000-0000-0000-00000000000d-1.png');
    EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: awatar pod cudzą ścieżką'; END IF;
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('avatars', 'profiles/00000000-0000-0000-0000-00000000000c-1.png');
END $$;
RESET ROLE;

-- ─── Role biurowe: wszystkie wiersze, bez zmian ────────────────────────────
SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_count integer;
BEGIN
    SELECT count(*) INTO v_count FROM public.profiles;
    IF v_count <> 6 THEN RAISE EXCEPTION 'SMOKE: biuro czyta % wierszy zamiast 6', v_count; END IF;
    SELECT count(*) INTO v_count FROM public.people_display_names(ARRAY['00000000-0000-0000-0000-00000000000d'::uuid]);
    IF v_count <> 1 THEN RAISE EXCEPTION 'SMOKE: biuro bez nazwiska z RPC'; END IF;
    SELECT count(*) INTO v_count FROM public.news_reactions;
    IF v_count <> 1 THEN RAISE EXCEPTION 'SMOKE: odbiorca nie widzi reakcji'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_count integer;
BEGIN
    SELECT count(*) INTO v_count FROM public.profiles;
    IF v_count <> 6 THEN RAISE EXCEPTION 'SMOKE: admin czyta % wierszy zamiast 6', v_count; END IF;
    -- adminUploadCV zapisuje zdjęcie pod identyfikatorem kandydata.
    INSERT INTO storage.objects (bucket_id, name)
    VALUES ('avatars', 'profiles/00000000-0000-0000-0000-00000000000d-extracted-1.png');
END $$;
RESET ROLE;

-- ─── Bez sesji i anon ──────────────────────────────────────────────────────
SELECT set_config('request.jwt.claim.sub', '', true);
SET LOCAL ROLE anon;
DO $$
DECLARE v_rejected boolean := false;
BEGIN
    BEGIN
        PERFORM 1 FROM public.people_display_names(ARRAY['00000000-0000-0000-0000-00000000000e'::uuid]);
    EXCEPTION WHEN insufficient_privilege THEN v_rejected := true;
    END;
    IF NOT v_rejected THEN RAISE EXCEPTION 'SMOKE: anon woła people_display_names'; END IF;
    RAISE NOTICE 'auth_signup_gate smoke: OK';
END $$;
RESET ROLE;

ROLLBACK;
