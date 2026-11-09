-- Smoke B1.2 na lokalnym postgres:17. Każda niezgodność kończy się RAISE EXCEPTION.
DO $$
DECLARE
    v_learner uuid := '10000000-0000-0000-0000-000000000001';
    v_string uuid := '10000000-0000-0000-0000-000000000002';
    v_plain uuid := '10000000-0000-0000-0000-000000000003';
    v_only boolean;
BEGIN
    -- Znacznik tylko z app_metadata i tylko jako wartość logiczna.
    INSERT INTO auth.users(id, email, raw_app_meta_data) VALUES (v_learner, 'nauka@example.test', '{"academy_only":true}');
    INSERT INTO auth.users(id, email, raw_app_meta_data) VALUES (v_string, 'napis@example.test', '{"academy_only":"true"}');
    INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES (v_plain, 'meta@example.test', '{"academy_only":true}');
    SELECT academy_only INTO v_only FROM public.profiles WHERE id = v_learner;
    IF v_only IS NOT TRUE THEN RAISE EXCEPTION 'learner flag not set'; END IF;
    SELECT academy_only INTO v_only FROM public.profiles WHERE id = v_string;
    IF v_only IS NOT FALSE THEN RAISE EXCEPTION 'string flag accepted'; END IF;
    SELECT academy_only INTO v_only FROM public.profiles WHERE id = v_plain;
    IF v_only IS NOT FALSE THEN RAISE EXCEPTION 'user_metadata accepted'; END IF;

    -- Adres firmowy nie może być kontem nauki.
    BEGIN
        INSERT INTO public.academy_learner_accounts(email, source) VALUES ('ktos@b2bnetwork.pl', 'reczne');
        RAISE EXCEPTION 'company address accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.academy_learner_accounts(email, source) VALUES ('x@example.test', 'dowolne');
        RAISE EXCEPTION 'unknown source accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- Adres z listy dostaje znacznik niezależnie od drogi założenia konta.
INSERT INTO public.academy_learner_accounts(email, source) VALUES ('lista@example.test', 'reczne');
INSERT INTO public.academy_learner_accounts(email, source, ended_at) VALUES ('koniec@example.test', 'reczne', now());
DO $$
DECLARE
    v_listed uuid := '10000000-0000-0000-0000-000000000011';
    v_ended uuid := '10000000-0000-0000-0000-000000000012';
    v_other uuid := '10000000-0000-0000-0000-000000000013';
    v_only boolean;
    v_meta jsonb;
BEGIN
    INSERT INTO auth.users(id, email) VALUES (v_listed, 'Lista@example.test');
    SELECT academy_only INTO v_only FROM public.profiles WHERE id = v_listed;
    IF v_only IS NOT TRUE THEN RAISE EXCEPTION 'listed signup not marked in profile'; END IF;
    SELECT raw_app_meta_data INTO v_meta FROM auth.users WHERE id = v_listed;
    IF v_meta->'academy_only' <> 'true'::jsonb THEN RAISE EXCEPTION 'listed signup missing app marker'; END IF;

    -- Zapis metadanych bez znacznika, jak późniejszy UPDATE z pamięci serwera Auth, go nie gubi.
    UPDATE auth.users SET raw_app_meta_data = '{"provider":"email"}' WHERE id = v_listed;
    SELECT raw_app_meta_data INTO v_meta FROM auth.users WHERE id = v_listed;
    IF v_meta->'academy_only' <> 'true'::jsonb OR v_meta->>'provider' <> 'email' THEN RAISE EXCEPTION 'marker lost on update: %', v_meta; END IF;

    INSERT INTO auth.users(id, email) VALUES (v_ended, 'koniec@example.test');
    INSERT INTO auth.users(id, email) VALUES (v_other, 'obcy@example.test');
    IF (SELECT academy_only FROM public.profiles WHERE id = v_ended) OR (SELECT academy_only FROM public.profiles WHERE id = v_other) THEN
        RAISE EXCEPTION 'marker set for ended or unlisted address';
    END IF;
END $$;

-- source='proba' wolno nadać SQL-em, ale nie kluczem serwisowym.
INSERT INTO public.academy_learner_accounts(id, email, source, user_id)
    VALUES ('20000000-0000-0000-0000-000000000001', 'nauka@example.test', 'proba', '10000000-0000-0000-0000-000000000001');
INSERT INTO public.academy_learner_accounts(id, email, source)
    VALUES ('20000000-0000-0000-0000-000000000002', 'umowa@example.test', 'umowa');

SET ROLE service_role;
DO $$
BEGIN
    BEGIN
        INSERT INTO public.academy_learner_accounts(email, source) VALUES ('wstrzykniete@example.test', 'proba');
        RAISE EXCEPTION 'service role inserted trial account';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        UPDATE public.academy_learner_accounts SET source = 'proba' WHERE email = 'umowa@example.test';
        RAISE EXCEPTION 'service role promoted account to trial';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    -- Zwykłe zapisy klucza serwisowego dalej działają, także na koncie próbnym.
    UPDATE public.academy_learner_accounts SET last_entry_at = now() WHERE email = 'nauka@example.test';
END $$;
RESET ROLE;

-- Użytkownik nie zdejmie sobie znacznika.
DO $$
DECLARE v_only boolean;
BEGIN
    PERFORM set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001"}', true);
    UPDATE public.profiles SET academy_only = false WHERE id = '10000000-0000-0000-0000-000000000001';
    SELECT academy_only INTO v_only FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000001';
    IF v_only IS NOT TRUE THEN RAISE EXCEPTION 'user removed own flag'; END IF;
END $$;

-- Rollout: zakończone i przeterminowane konto traci dostęp, reszta bez zmian.
DO $$
DECLARE v_learner uuid := '10000000-0000-0000-0000-000000000001';
BEGIN
    UPDATE public.academy_rollout_settings SET mode='pilot', pilot_user_ids=ARRAY[v_learner];
    IF NOT academy_private.rollout_allows_user(v_learner) THEN RAISE EXCEPTION 'active learner denied'; END IF;
    UPDATE public.academy_learner_accounts SET access_until = now() - interval '1 minute' WHERE user_id = v_learner;
    IF academy_private.rollout_allows_user(v_learner) THEN RAISE EXCEPTION 'expired learner admitted'; END IF;
    UPDATE public.academy_learner_accounts SET access_until = now() + interval '1 day', ended_at = now() WHERE user_id = v_learner;
    IF academy_private.rollout_allows_user(v_learner) THEN RAISE EXCEPTION 'ended learner admitted'; END IF;
    UPDATE public.academy_rollout_settings SET mode='closed', pilot_user_ids='{}';
END $$;
SELECT 'b1_2_smoke_ok' AS result;
