-- Akademia B5.9: jednorazowe usunięcie danych prób przed otwarciem platformy.
--
-- PLIK GOTOWY, NIEURUCHOMIONY. Stosuje wyłącznie właściciel, na bramce startu, po
-- teście na odtworzonym środowisku z ćwiczenia B5.8. Skutek jest nieodwracalny
-- (cofnięcie tylko przez PITR).
--
-- Bez potwierdzenia plik niczego nie robi, bo bramka CI odtwarza cały katalog
-- migracji po kolei, a rytm dzienny też mógłby go wykonać. Żeby naprawdę zadziałał,
-- dopisz na początku tego SQL-a, w tej samej transakcji:
--   SELECT set_config('academy.usun_dane_prob', 'TAK-USUN-DANE-PROB', true);
--
-- Co usuwa, wyłącznie z tej listy:
--   1. konta academy_learner_accounts z source='proba' razem z ich danymi nauki
--      (zapisy, próby testu, ukończenia, frekwencja, ankiety, powiadomienia) oraz
--      kontem w auth.users i profilem,
--   2. kolejkę: wiersze held i approved w academy_outbox przechodzą w expired,
--      bo po otwarciu nic z okresu prób nie może wyjść.
--
-- Czego nie rusza: treści kursów. Kurs-atrapa (is_rehearsal=true, B0.6) zostaje na
-- zawsze i wyklucza go filtr raportów, więc nie ma tu żadnego kasowania wersji ani
-- obejścia guard_version_snapshot. Kursy is_rehearsal=false zostają bez zmian, tak
-- samo dane wszystkich kont spoza listy, także ich zapisy na kursie-atrapie.
--
-- Obejście niezmienności dotyczy tylko historii ukończeń i zaświadczeń udziału
-- (guard_completion_history, guard_participation_history) i kończy się włączeniem tych
-- samych triggerów w tej samej transakcji.
-- Wszystko jest jednym blokiem DO, więc błąd cofa całość.

DO $$
DECLARE
    v_confirmation text := current_setting('academy.usun_dane_prob', true);
    v_max_accounts constant integer := 50;
    v_users uuid[];
    v_accounts integer;
    v_enrollments uuid[];
    v_completions uuid[];
    v_attempts uuid[];
    v_roster uuid[];
    v_blockers text;
    v_fk_column text;
    v_courses_before bigint; v_versions_before bigint; v_lessons_before bigint; v_questions_before bigint;
    v_others_enrollments bigint; v_others_completions bigint; v_others_attempts bigint; v_others_profiles bigint;
    v_left bigint;
    v_outbox_expired bigint;
BEGIN
    IF v_confirmation IS DISTINCT FROM 'TAK-USUN-DANE-PROB' THEN
        RAISE NOTICE 'academy_b5_9: brak potwierdzenia, nic nie zmieniono';
        RETURN;
    END IF;

    -- Warunki wstępne. Każdy niespełniony zatrzymuje całość, zanim cokolwiek zniknie.
    IF to_regclass('public.academy_learner_accounts') IS NULL OR to_regclass('public.academy_outbox') IS NULL THEN
        RAISE EXCEPTION 'academy_b5_9: brak academy_learner_accounts albo academy_outbox';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courses' AND column_name='is_rehearsal')
       OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='academy_only') THEN
        RAISE EXCEPTION 'academy_b5_9: brak kolumny courses.is_rehearsal albo profiles.academy_only';
    END IF;
    IF EXISTS(SELECT 1 FROM public.academy_rollout_settings WHERE mode='open') THEN
        RAISE EXCEPTION 'academy_b5_9: rollout jest w trybie open, usuwanie danych prób odbywa się przed otwarciem';
    END IF;

    SELECT COALESCE(array_agg(user_id) FILTER (WHERE user_id IS NOT NULL), '{}'), count(*)
      INTO v_users, v_accounts FROM public.academy_learner_accounts WHERE source='proba';
    IF v_accounts > v_max_accounts THEN
        RAISE EXCEPTION 'academy_b5_9: % kont proba to więcej niż limit %, sprawdź, czy source nie objął prawdziwych kont', v_accounts, v_max_accounts;
    END IF;

    SELECT string_agg(p.id::text, ', ') INTO v_blockers FROM public.profiles p
     WHERE p.id=ANY(v_users) AND p.academy_only IS NOT TRUE;
    IF v_blockers IS NOT NULL THEN
        RAISE EXCEPTION 'academy_b5_9: konto proba nie jest kontem wyłącznie Akademii: %', v_blockers;
    END IF;

    -- courses.author_id ma ON DELETE CASCADE: skasowanie autora skasowałoby kurs.
    SELECT string_agg(c.id::text, ', ') INTO v_blockers FROM public.courses c WHERE c.author_id=ANY(v_users);
    IF v_blockers IS NOT NULL THEN
        RAISE EXCEPTION 'academy_b5_9: konto proba jest autorem kursu: %', v_blockers;
    END IF;

    -- Tabela zależna, której ten skrypt nie zna, zostawiłaby dane albo wywróciła FK
    -- w połowie. Lepiej stanąć tu, z nazwą tabeli do dopisania.
    SELECT string_agg(DISTINCT conrelid::regclass::text, ', ') INTO v_blockers FROM pg_constraint
     WHERE contype='f'
       AND confrelid IN ('public.course_enrollments'::regclass,'public.course_completions'::regclass,'public.course_quiz_attempts'::regclass)
       AND conrelid::regclass::text <> ALL(ARRAY['course_completions','course_quiz_attempts','course_run_registrations','session_attendance',
            'course_questions','course_survey_responses','academy_edition_survey_responses','academy_completion_rewards','academy_completion_revocations',
            'academy_participation_documents','course_quiz_attempt_items','academy_video_progress','academy_retrieval_schedule','academy_document_shares']);
    IF v_blockers IS NOT NULL THEN
        RAISE EXCEPTION 'academy_b5_9: nieznana tabela zależna, dopisz ją do skryptu: %', v_blockers;
    END IF;

    SELECT count(*) INTO v_courses_before FROM public.courses;
    SELECT count(*) INTO v_versions_before FROM public.course_versions;
    SELECT count(*) INTO v_lessons_before FROM public.course_lessons;
    SELECT count(*) INTO v_questions_before FROM public.course_quiz_questions;
    SELECT count(*) INTO v_others_enrollments FROM public.course_enrollments WHERE user_id<>ALL(v_users);
    SELECT count(*) INTO v_others_completions FROM public.course_completions WHERE user_id<>ALL(v_users);
    SELECT count(*) INTO v_others_attempts FROM public.course_quiz_attempts WHERE user_id<>ALL(v_users);
    SELECT count(*) INTO v_others_profiles FROM public.profiles WHERE id<>ALL(v_users);

    SELECT COALESCE(array_agg(id), '{}') INTO v_enrollments FROM public.course_enrollments WHERE user_id=ANY(v_users);
    SELECT COALESCE(array_agg(id), '{}') INTO v_completions FROM public.course_completions WHERE user_id=ANY(v_users) OR enrollment_id=ANY(v_enrollments);
    SELECT COALESCE(array_agg(id), '{}') INTO v_attempts FROM public.course_quiz_attempts WHERE enrollment_id=ANY(v_enrollments);
    SELECT COALESCE(array_agg(id), '{}') INTO v_roster FROM public.academy_webinar_roster WHERE user_id=ANY(v_users);

    -- Tylko te triggery, tylko do końca tej transakcji.
    ALTER TABLE public.course_completions DISABLE TRIGGER academy_completion_history;
    ALTER TABLE public.academy_completion_revocations DISABLE TRIGGER academy_revocation_history;
    ALTER TABLE public.academy_completion_rewards DISABLE TRIGGER academy_reward_link_history;
    IF to_regclass('public.academy_participation_documents') IS NOT NULL THEN
        ALTER TABLE public.academy_participation_documents DISABLE TRIGGER academy_participation_history;
    END IF;

    IF to_regclass('public.academy_document_shares') IS NOT NULL THEN
        DELETE FROM public.academy_document_shares WHERE user_id=ANY(v_users);
    END IF;
    DELETE FROM public.academy_completion_rewards WHERE completion_id=ANY(v_completions);
    DELETE FROM public.academy_completion_revocations WHERE completion_id=ANY(v_completions);
    IF to_regclass('public.academy_participation_documents') IS NOT NULL THEN
        DELETE FROM public.academy_participation_documents WHERE user_id=ANY(v_users) OR enrollment_id=ANY(v_enrollments);
    END IF;
    DELETE FROM public.course_completions WHERE id=ANY(v_completions);

    IF to_regclass('public.course_quiz_attempt_items') IS NOT NULL THEN
        SELECT a.attname INTO v_fk_column FROM pg_constraint c JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=c.conkey[1]
         WHERE c.contype='f' AND c.conrelid='public.course_quiz_attempt_items'::regclass AND c.confrelid='public.course_quiz_attempts'::regclass;
        IF v_fk_column IS NULL THEN RAISE EXCEPTION 'academy_b5_9: course_quiz_attempt_items bez klucza do prób'; END IF;
        EXECUTE format('DELETE FROM public.course_quiz_attempt_items WHERE %I = ANY($1)', v_fk_column) USING v_attempts;
    END IF;
    DELETE FROM public.course_quiz_attempts WHERE id=ANY(v_attempts);
    DELETE FROM public.academy_edition_survey_responses WHERE user_id=ANY(v_users) OR enrollment_id=ANY(v_enrollments);
    DELETE FROM public.course_survey_responses WHERE user_id=ANY(v_users) OR enrollment_id=ANY(v_enrollments);
    DELETE FROM public.course_answers WHERE user_id=ANY(v_users);
    DELETE FROM public.course_questions WHERE user_id=ANY(v_users) OR enrollment_id=ANY(v_enrollments);
    DELETE FROM public.course_ratings WHERE user_id=ANY(v_users);
    DELETE FROM public.session_attendance WHERE enrollment_id=ANY(v_enrollments);
    DELETE FROM public.academy_webinar_attendance WHERE roster_id=ANY(v_roster);
    DELETE FROM public.academy_webinar_roster WHERE id=ANY(v_roster);
    DELETE FROM public.course_run_registrations WHERE user_id=ANY(v_users) OR enrollment_id=ANY(v_enrollments);
    IF to_regclass('public.academy_video_progress') IS NOT NULL THEN
        DELETE FROM public.academy_video_progress WHERE user_id=ANY(v_users);
    END IF;
    IF to_regclass('public.academy_retrieval_schedule') IS NOT NULL THEN
        DELETE FROM public.academy_retrieval_schedule WHERE user_id=ANY(v_users);
    END IF;
    DELETE FROM public.course_enrollments WHERE id=ANY(v_enrollments);
    DELETE FROM public.academy_reward_claims WHERE user_id=ANY(v_users);
    DELETE FROM public.academy_learning_streaks WHERE user_id=ANY(v_users);
    DELETE FROM public.academy_m365_identities WHERE user_id=ANY(v_users);
    DELETE FROM public.academy_user_capabilities WHERE user_id=ANY(v_users);
    -- Wpis audytu zostaje, znika tylko wskazanie na usuwane konto.
    UPDATE public.academy_audit_events SET actor_id=NULL WHERE actor_id=ANY(v_users);

    DELETE FROM public.academy_learner_accounts WHERE source='proba';
    -- Kaskada: profil, powiadomienia, potwierdzenia, sesje. audit_logs.user_id przechodzi w NULL.
    DELETE FROM auth.users WHERE id=ANY(v_users);

    ALTER TABLE public.course_completions ENABLE TRIGGER academy_completion_history;
    ALTER TABLE public.academy_completion_revocations ENABLE TRIGGER academy_revocation_history;
    ALTER TABLE public.academy_completion_rewards ENABLE TRIGGER academy_reward_link_history;
    IF to_regclass('public.academy_participation_documents') IS NOT NULL THEN
        ALTER TABLE public.academy_participation_documents ENABLE TRIGGER academy_participation_history;
    END IF;

    UPDATE public.academy_outbox SET status='expired' WHERE status IN ('held','approved');
    GET DIAGNOSTICS v_outbox_expired = ROW_COUNT;

    -- Samosprawdzenie: gdziekolwiek rozjazd, RAISE cofa całą transakcję.
    SELECT count(*) INTO v_left FROM public.academy_learner_accounts WHERE source='proba';
    IF v_left<>0 THEN RAISE EXCEPTION 'academy_b5_9: zostały konta proba: %', v_left; END IF;
    SELECT count(*) INTO v_left FROM public.course_enrollments WHERE user_id=ANY(v_users);
    IF v_left<>0 THEN RAISE EXCEPTION 'academy_b5_9: zostały zapisy kont proba: %', v_left; END IF;
    SELECT count(*) INTO v_left FROM public.profiles WHERE id=ANY(v_users);
    IF v_left<>0 THEN RAISE EXCEPTION 'academy_b5_9: zostały profile kont proba: %', v_left; END IF;
    SELECT count(*) INTO v_left FROM public.academy_outbox WHERE status IN ('held','approved');
    IF v_left<>0 THEN RAISE EXCEPTION 'academy_b5_9: zostały wiadomości do wysłania: %', v_left; END IF;

    IF (SELECT count(*) FROM public.courses)<>v_courses_before OR (SELECT count(*) FROM public.course_versions)<>v_versions_before
       OR (SELECT count(*) FROM public.course_lessons)<>v_lessons_before OR (SELECT count(*) FROM public.course_quiz_questions)<>v_questions_before THEN
        RAISE EXCEPTION 'academy_b5_9: zmieniła się treść kursów';
    END IF;
    IF (SELECT count(*) FROM public.course_enrollments)<>v_others_enrollments OR (SELECT count(*) FROM public.course_completions)<>v_others_completions
       OR (SELECT count(*) FROM public.course_quiz_attempts)<>v_others_attempts OR (SELECT count(*) FROM public.profiles)<>v_others_profiles THEN
        RAISE EXCEPTION 'academy_b5_9: zmieniły się dane kont spoza listy';
    END IF;
    IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgname IN ('academy_completion_history','academy_revocation_history','academy_reward_link_history','academy_participation_history') AND tgenabled<>'O') THEN
        RAISE EXCEPTION 'academy_b5_9: trigger historii nie został włączony z powrotem';
    END IF;

    RAISE NOTICE 'academy_b5_9: usunięto konta proba: %, wygaszono wiadomości: %', v_accounts, v_outbox_expired;
END $$;
