-- B4.8: raport programu na ekranie raportu kompetencji. academy_programme_completions() z B4.8
-- liczyła także konta próbne i kurs-atrapę, a wiersze raportu kompetencji (B5.4) ich nie liczą.
-- Na jednym ekranie dawałoby to dwie różne liczby osób dla tego samego programu, więc funkcja
-- korzysta teraz z tej samej reguły wykluczeń co raport (academy_private.report_excludes).
-- Dostęp, kształt wyniku i liczenie osoby raz na program zostają bez zmian.
--
-- Warunek: po 20261110130000_academy_twin_course.sql i 20261110133000_academy_b5_4_reports.sql.
-- Cofnięcie: supabase/rollbacks/20261110164500_academy_programme_completions_report.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.academy_programme_completions()
RETURNS TABLE (programme_id uuid, title text, courses integer, completed_users integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    IF NOT public.academy_is_global_editor() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501'; END IF;
    RETURN QUERY
    SELECT p.id, p.title, count(DISTINCT c.id)::integer, count(DISTINCT cc.user_id)::integer
    FROM public.academy_programmes p
    -- Kurs-atrapa nie jest formą programu: report_excludes z pustą osobą sprawdza sam kurs.
    JOIN public.courses c ON c.programme_id = p.id AND NOT academy_private.report_excludes(NULL, c)
    LEFT JOIN public.course_completions cc ON cc.course_id = c.id AND cc.revoked_at IS NULL
        AND NOT academy_private.report_excludes(cc.user_id, c)
    GROUP BY p.id, p.title
    ORDER BY p.title;
END $$;
REVOKE ALL ON FUNCTION public.academy_programme_completions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_programme_completions() TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $$
BEGIN
    IF position('report_excludes' IN pg_get_functiondef('public.academy_programme_completions()'::regprocedure)) = 0 THEN
        RAISE EXCEPTION 'B4.8: raport programu nie pomija kont próbnych';
    END IF;
    IF has_function_privilege('anon', 'public.academy_programme_completions()', 'EXECUTE') THEN RAISE EXCEPTION 'B4.8: anon czyta raport programu'; END IF;
    IF NOT has_function_privilege('authenticated', 'public.academy_programme_completions()', 'EXECUTE') THEN RAISE EXCEPTION 'B4.8: brak EXECUTE dla authenticated'; END IF;
END $$;

COMMIT;
