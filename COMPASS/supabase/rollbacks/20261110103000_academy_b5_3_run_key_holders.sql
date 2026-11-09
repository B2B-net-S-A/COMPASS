-- Cofnięcie 20261110103000_academy_b5_3_run_key_holders.sql. Bez utraty danych.
BEGIN;

DROP FUNCTION public.academy_run_key_holder_enrollments(uuid);

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
            FROM public.course_enrollments e WHERE e.run_id=p_run_id
        )
        SELECT jsonb_build_object('participants',count(*),'average_pre',round(avg(pre)),'average_final',round(avg(final)),'average_gain',round(avg(final-pre)))
        FROM pairs WHERE pre IS NOT NULL AND final IS NOT NULL
    );
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
