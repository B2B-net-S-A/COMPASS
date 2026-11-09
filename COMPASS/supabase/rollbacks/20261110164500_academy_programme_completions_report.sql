-- Cofnięcie 20261110164500_academy_programme_completions_report.sql. Bez utraty danych:
-- przywraca definicję z 20261110130000_academy_twin_course.sql (bez wykluczeń kont próbnych).
BEGIN;
CREATE OR REPLACE FUNCTION public.academy_programme_completions()
RETURNS TABLE (programme_id uuid, title text, courses integer, completed_users integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT public.academy_is_global_editor() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501'; END IF;
    RETURN QUERY
    SELECT p.id, p.title, count(DISTINCT c.id)::integer, count(DISTINCT cc.user_id)::integer
    FROM public.academy_programmes p
    JOIN public.courses c ON c.programme_id = p.id
    LEFT JOIN public.course_completions cc ON cc.course_id = c.id AND cc.revoked_at IS NULL
    GROUP BY p.id, p.title;
END $$;
REVOKE ALL ON FUNCTION public.academy_programme_completions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_programme_completions() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
