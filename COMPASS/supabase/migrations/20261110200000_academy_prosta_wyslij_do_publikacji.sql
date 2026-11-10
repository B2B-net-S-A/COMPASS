-- Wersja prosta, krok 3: „Prowadzę” w 3 krokach kończy się przyciskiem „Wyślij do publikacji”.
-- Decyzja właściciela z 2026-11-10: pakiet przekazania praw zamienia się w jedno pole zgody
-- trenera przy publikacji. Ta migracja zapisuje tę zgodę dla edycji i powiadamia w Compass
-- osoby uprawnione do akceptacji (bez maili). Akceptacja nagrania zostaje jak była:
-- academy_review_run_material, zasada czterech oczu.
-- academy_run_recording_viewers oddaje prowadzącemu liczbę oglądających (agregat, bez osób).
--
-- Kolejność: po 20261110150000_academy_b3_10_tcm_review.sql (academy_private.reviewer_eligible)
-- i 20261109213000_academy_video_progress.sql (academy_video_progress).
-- Cofnięcie: supabase/rollbacks/20261110200000_academy_prosta_wyslij_do_publikacji.sql.
BEGIN;

DO $pre$
BEGIN
    IF to_regprocedure('academy_private.reviewer_eligible(uuid)') IS NULL THEN
        RAISE EXCEPTION 'prosta_3_wymaga_B3_10: najpierw 20261110150000_academy_b3_10_tcm_review.sql';
    END IF;
    IF to_regclass('public.academy_video_progress') IS NULL THEN
        RAISE EXCEPTION 'prosta_3_wymaga_B4_3: najpierw 20261109213000_academy_video_progress.sql';
    END IF;
END $pre$;

CREATE TABLE public.academy_run_publication_requests (
    run_id uuid PRIMARY KEY REFERENCES public.course_runs(id) ON DELETE CASCADE,
    requested_by uuid NOT NULL REFERENCES public.profiles(id),
    trainer_consent boolean NOT NULL CHECK (trainer_consent),
    requested_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.academy_run_publication_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_run_publication_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academy_run_publication_requests TO authenticated;
GRANT ALL ON public.academy_run_publication_requests TO service_role;
CREATE POLICY academy_run_publication_staff_read ON public.academy_run_publication_requests
    FOR SELECT TO authenticated USING (public.academy_can_access() AND (public.academy_can_manage_run(run_id)
        OR public.academy_is_reviewer()));

CREATE FUNCTION public.academy_request_run_publication(p_run_id uuid, p_trainer_consent boolean)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    r public.course_runs;
    v_pending integer;
    v_at timestamptz := now();
BEGIN
    IF NOT public.academy_can_access() OR NOT public.academy_can_manage_run(p_run_id) THEN
        RAISE EXCEPTION 'run_manager_required' USING ERRCODE = '42501';
    END IF;
    IF p_trainer_consent IS NOT TRUE THEN RAISE EXCEPTION 'trainer_consent_required'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id = p_run_id FOR UPDATE;
    IF NOT FOUND OR r.status = 'cancelled' THEN RAISE EXCEPTION 'run_not_found'; END IF;
    SELECT count(*) INTO v_pending FROM public.course_materials
        WHERE run_id = p_run_id AND status = 'ready' AND review_status = 'pending_review' AND purged_at IS NULL;
    IF v_pending = 0 THEN RAISE EXCEPTION 'nothing_to_publish'; END IF;

    INSERT INTO public.academy_run_publication_requests(run_id, requested_by, trainer_consent, requested_at)
    VALUES (p_run_id, auth.uid(), true, v_at)
    ON CONFLICT (run_id) DO UPDATE SET requested_by = EXCLUDED.requested_by, trainer_consent = true, requested_at = EXCLUDED.requested_at;

    INSERT INTO public.academy_audit_events(actor_id, action, course_id, details)
    VALUES (auth.uid(), 'ACADEMY_RUN_PUBLICATION_REQUESTED', r.course_id,
        jsonb_build_object('run_id', r.id, 'pending_materials', v_pending, 'trainer_consent', true));

    -- Tylko dzwonek w Compass. Autor prośby nie dostaje własnego powiadomienia.
    INSERT INTO public.notifications(user_id, type, title_pl, title_en, body_pl, body_en, action_url)
    SELECT p.id, 'document_uploaded', 'Nagranie czeka na akceptację', 'Recording awaits approval',
        'Obejrzyj i zatwierdź: ' || r.title, 'Review and approve: ' || r.title, '/learning/organizuje'
    FROM public.profiles p
    WHERE academy_private.reviewer_eligible(p.id) AND p.id <> auth.uid();
    RETURN v_at;
END $$;
REVOKE ALL ON FUNCTION public.academy_request_run_publication(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_request_run_publication(uuid, boolean) TO authenticated;

CREATE FUNCTION public.academy_run_recording_viewers(p_run_id uuid)
RETURNS TABLE(asset_id uuid, viewers integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT a.id, count(p.user_id)::integer
    FROM public.course_materials a
    LEFT JOIN public.academy_video_progress p ON p.asset_id = a.id
    WHERE public.academy_can_access() AND public.academy_can_manage_run(p_run_id)
        AND a.run_id = p_run_id AND a.mime_type = 'video/mp4'
    GROUP BY a.id;
$$;
REVOKE ALL ON FUNCTION public.academy_run_recording_viewers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_run_recording_viewers(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $check$
BEGIN
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.academy_run_publication_requests'::regclass) THEN
        RAISE EXCEPTION 'prosta_3: RLS wyłączone';
    END IF;
    IF has_table_privilege('authenticated', 'public.academy_run_publication_requests', 'INSERT,UPDATE,DELETE') THEN
        RAISE EXCEPTION 'prosta_3: authenticated ma zapis bezpośredni';
    END IF;
    IF has_function_privilege('anon', 'public.academy_request_run_publication(uuid,boolean)', 'EXECUTE')
        OR NOT has_function_privilege('authenticated', 'public.academy_request_run_publication(uuid,boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'prosta_3: złe uprawnienia prośby o publikację';
    END IF;
    IF has_function_privilege('anon', 'public.academy_run_recording_viewers(uuid)', 'EXECUTE') THEN
        RAISE EXCEPTION 'prosta_3: anon czyta liczbę oglądających';
    END IF;
    IF pg_get_functiondef('public.academy_request_run_publication(uuid,boolean)'::regprocedure) NOT LIKE '%academy_can_manage_run(p_run_id)%' THEN
        RAISE EXCEPTION 'prosta_3: prośba bez sprawdzenia prowadzącego';
    END IF;
END $check$;

COMMIT;
