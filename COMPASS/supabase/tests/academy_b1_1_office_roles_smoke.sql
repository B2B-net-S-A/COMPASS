-- Smoke B1.1: uruchamiany po stubie i migracji na lokalnym postgres:17.
-- Każda niezgodność kończy się RAISE EXCEPTION.
DO $$
DECLARE
    v_admin uuid := '00000000-0000-0000-0000-000000000001';
    v_tcm uuid := '00000000-0000-0000-0000-000000000002';
    v_consultant uuid := '00000000-0000-0000-0000-000000000003';
    v_internal uuid := '00000000-0000-0000-0000-000000000004';
    v_manager uuid := '00000000-0000-0000-0000-000000000005';
    v_finanse uuid := '00000000-0000-0000-0000-000000000006';
    v_exited uuid := '00000000-0000-0000-0000-000000000007';
    v_external uuid := '00000000-0000-0000-0000-000000000008';
    v_user uuid;
BEGIN
    -- Tryb closed: nic się nie zmienia, wchodzą tylko edytorzy.
    FOREACH v_user IN ARRAY ARRAY[v_consultant, v_internal, v_manager, v_finanse] LOOP
        IF academy_private.rollout_allows_user(v_user) THEN RAISE EXCEPTION 'closed admits %', v_user; END IF;
    END LOOP;
    IF NOT academy_private.rollout_allows_user(v_admin) OR NOT academy_private.rollout_allows_user(v_tcm) THEN
        RAISE EXCEPTION 'closed locks out editors';
    END IF;

    -- Pilot przyjmuje konto biurowe i wpuszcza wyłącznie wskazane.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);
    PERFORM public.academy_set_rollout('pilot', ARRAY[v_internal]);
    IF NOT academy_private.rollout_allows_user(v_internal) THEN RAISE EXCEPTION 'pilot office denied'; END IF;
    IF academy_private.rollout_allows_user(v_manager) THEN RAISE EXCEPTION 'pilot admits unlisted office'; END IF;
    IF academy_private.rollout_allows_user(v_consultant) THEN RAISE EXCEPTION 'pilot admits unlisted consultant'; END IF;

    -- Konto zakończone i zewnętrzne nie przechodzą ani przez listę, ani przez bezpośredni zapis.
    BEGIN
        PERFORM public.academy_set_rollout('pilot', ARRAY[v_exited]);
        RAISE EXCEPTION 'pilot accepted exited';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'pilot_requires_active_academy_accounts' THEN RAISE; END IF;
    END;
    BEGIN
        PERFORM public.academy_set_rollout('pilot', ARRAY[v_external]);
        RAISE EXCEPTION 'pilot accepted external';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'pilot_requires_active_academy_accounts' THEN RAISE; END IF;
    END;
    UPDATE public.academy_rollout_settings SET pilot_user_ids=ARRAY[v_exited, v_external];
    IF academy_private.rollout_allows_user(v_exited) OR academy_private.rollout_allows_user(v_external) THEN
        RAISE EXCEPTION 'pilot admits exited or external';
    END IF;

    -- Uprawnienie trenera biura działa tylko razem z dostępem z rolloutu.
    UPDATE public.academy_rollout_settings SET pilot_user_ids=ARRAY[v_finanse];
    INSERT INTO public.academy_user_capabilities(user_id, can_train) VALUES (v_finanse, true), (v_manager, true);
    IF NOT academy_private.trainer_eligible(v_finanse) THEN RAISE EXCEPTION 'office trainer denied'; END IF;
    IF academy_private.trainer_eligible(v_manager) THEN RAISE EXCEPTION 'trainer outside rollout admitted'; END IF;

    UPDATE public.academy_rollout_settings SET mode='closed', pilot_user_ids='{}';
    IF academy_private.trainer_eligible(v_finanse) THEN RAISE EXCEPTION 'closed keeps office trainer'; END IF;
END $$;
SELECT 'b1_1_smoke_ok' AS result;
