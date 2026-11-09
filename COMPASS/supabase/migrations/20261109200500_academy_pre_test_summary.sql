-- B2.8: przyrost między testem wstępnym a końcowym dla raportu edycji (B5.3).
-- Same próby wstępne działają od B2.2: ta sama pula, bez wpływu na zaliczenie i limit.
-- Cofnięcie: DROP FUNCTION, bez utraty danych; cofamy PITR razem z pozostałymi plikami B2.
BEGIN;

CREATE FUNCTION public.academy_run_quiz_gain(p_run_id uuid)
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
            FROM public.course_enrollments e WHERE e.run_id=p_run_id
        )
        SELECT jsonb_build_object('participants',count(*),'average_pre',round(avg(pre)),'average_final',round(avg(final)),'average_gain',round(avg(final-pre)))
        FROM pairs WHERE pre IS NOT NULL AND final IS NOT NULL
    );
END $$;
REVOKE ALL ON FUNCTION public.academy_run_quiz_gain(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_run_quiz_gain(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';

DO $$
BEGIN
    IF to_regprocedure('public.academy_run_quiz_gain(uuid)') IS NULL THEN RAISE EXCEPTION 'gain RPC missing'; END IF;
    IF has_function_privilege('anon','public.academy_run_quiz_gain(uuid)','EXECUTE') THEN RAISE EXCEPTION 'anon can read gain'; END IF;
END $$;

COMMIT;
