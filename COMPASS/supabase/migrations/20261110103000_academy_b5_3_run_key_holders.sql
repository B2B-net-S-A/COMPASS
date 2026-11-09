-- B5.3: wyniki osób z dostępem do klucza nie liczą się do raportu edycji (reguła B2.10).
-- academy_private.user_has_key_access nie jest wołalne z aplikacji, więc raport dostaje
-- wyłącznie identyfikatory zapisów do pominięcia, bez kont i nazwisk.
-- academy_run_quiz_gain dostaje ten sam filtr, żeby przyrost liczył tę samą populację.
-- Cofnięcie: supabase/rollbacks/20261110103000_academy_b5_3_run_key_holders.sql
BEGIN;

CREATE FUNCTION public.academy_run_key_holder_enrollments(p_run_id uuid)
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT public.academy_can_manage_run(p_run_id) THEN
        RAISE EXCEPTION 'Brak uprawnień do wyników edycji.' USING ERRCODE='42501';
    END IF;
    RETURN COALESCE((SELECT array_agg(e.id) FROM public.course_enrollments e
        WHERE e.run_id=p_run_id AND academy_private.user_has_key_access(e.course_id,e.user_id)),'{}'::uuid[]);
END $$;
REVOKE ALL ON FUNCTION public.academy_run_key_holder_enrollments(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_run_key_holder_enrollments(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_run_quiz_gain(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF auth.uid() IS NULL OR NOT public.academy_can_manage_run(p_run_id) THEN
        RAISE EXCEPTION 'Brak uprawnień do wyników edycji.' USING ERRCODE='42501';
    END IF;
    RETURN (
        WITH pairs AS (
            SELECT e.id,
                (SELECT a.score_percent FROM public.course_quiz_attempts a WHERE a.enrollment_id=e.id AND a.kind='pre' AND a.status<>'in_progress' ORDER BY a.attempted_at LIMIT 1) AS pre,
                (SELECT max(a.score_percent) FROM public.course_quiz_attempts a WHERE a.enrollment_id=e.id AND a.kind='final' AND a.status<>'in_progress') AS final
            FROM public.course_enrollments e WHERE e.run_id=p_run_id AND NOT academy_private.user_has_key_access(e.course_id,e.user_id)
        )
        SELECT jsonb_build_object('participants',count(*),'average_pre',round(avg(pre)),'average_final',round(avg(final)),'average_gain',round(avg(final-pre)))
        FROM pairs WHERE pre IS NOT NULL AND final IS NOT NULL
    );
END $$;

NOTIFY pgrst,'reload schema';

DO $$
BEGIN
    IF to_regprocedure('public.academy_run_key_holder_enrollments(uuid)') IS NULL THEN RAISE EXCEPTION 'key holder RPC missing'; END IF;
    IF has_function_privilege('anon','public.academy_run_key_holder_enrollments(uuid)','EXECUTE') THEN RAISE EXCEPTION 'anon can read key holders'; END IF;
    IF position('user_has_key_access' IN pg_get_functiondef('public.academy_run_quiz_gain(uuid)'::regprocedure))=0 THEN
        RAISE EXCEPTION 'gain still counts key holders';
    END IF;
END $$;

COMMIT;
