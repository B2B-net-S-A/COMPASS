-- B5.4: raport menedżerski i raport kompetencji (M12). Oba liczą wyłącznie nieunieważnione
-- ukończenia: bez oblanych prób i bez procentów. Program liczy się raz dla osoby, niezależnie
-- od drogi (live albo moduły). Kurs bez programu liczy się jako osobny program.
-- Konta próbne i kurs-atrapa nie wchodzą do żadnego z raportów. is_rehearsal czytamy przez
-- to_jsonb, bo kolumna (B0.6) może powstać później niż ta funkcja.
-- Cofnięcie: supabase/rollbacks/20261110133000_academy_b5_4_reports.sql
BEGIN;

CREATE FUNCTION academy_private.report_excludes(p_user_id uuid,p_course public.courses)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT COALESCE((to_jsonb(p_course)->>'is_rehearsal')::boolean,false)
        OR EXISTS(SELECT 1 FROM public.academy_learner_accounts a WHERE a.user_id=p_user_id AND a.source='proba');
$$;

CREATE FUNCTION academy_private.competence_rows()
RETURNS TABLE(user_id uuid,full_name text,programme_key uuid,programme_title text,version_number integer,route text,completed_at timestamptz,valid_until timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT DISTINCT ON (x.user_id,COALESCE(c.programme_id,c.id))
        x.user_id,COALESCE(p.full_name,p.email),COALESCE(c.programme_id,c.id),COALESCE(pr.title,x.certificate_snapshot->>'course_title'),
        v.version_number,
        CASE WHEN v.metadata->>'delivery_mode' IN ('live','blended') THEN 'live' WHEN v.metadata->>'delivery_mode'='assessment' THEN 'assessment' ELSE 'modules' END,
        x.completed_at,(x.certificate_snapshot->>'valid_until')::timestamptz
    FROM public.course_completions x
    JOIN public.courses c ON c.id=x.course_id
    JOIN public.course_versions v ON v.id=x.version_id
    JOIN public.profiles p ON p.id=x.user_id
    LEFT JOIN public.academy_programmes pr ON pr.id=c.programme_id
    WHERE x.revoked_at IS NULL AND NOT academy_private.report_excludes(x.user_id,c)
    ORDER BY x.user_id,COALESCE(c.programme_id,c.id),x.completed_at DESC;
$$;
REVOKE ALL ON FUNCTION academy_private.report_excludes(uuid,public.courses),academy_private.competence_rows() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.academy_competence_report()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object(
        'rows',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.valid_until NULLS LAST,r.programme_title,r.full_name) FROM academy_private.competence_rows() r),'[]'::jsonb),
        'active',(SELECT count(DISTINCT e.user_id) FROM public.course_enrollments e JOIN public.courses c ON c.id=e.course_id JOIN public.profiles p ON p.id=e.user_id
            WHERE p.employment_status IS DISTINCT FROM 'exited' AND NOT academy_private.report_excludes(e.user_id,c)));
END $$;
REVOKE ALL ON FUNCTION public.academy_competence_report() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_competence_report() TO authenticated;

-- Zespół wyłącznie po manager_id i wyłącznie role biurowe: konsultantów B2B tu nie ma.
CREATE FUNCTION public.academy_manager_team_report()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
    IF NOT public.academy_can_access() OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role::text='manager') THEN
        RAISE EXCEPTION 'manager_required' USING ERRCODE='42501';
    END IF;
    RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'user_id',m.id,'full_name',COALESCE(m.full_name,m.email),
        'certificates',COALESCE((SELECT jsonb_agg(jsonb_build_object('programme_title',r.programme_title,'route',r.route,'completed_at',r.completed_at,'valid_until',r.valid_until) ORDER BY r.completed_at DESC)
            FROM academy_private.competence_rows() r WHERE r.user_id=m.id),'[]'::jsonb),
        'in_progress',(SELECT count(*) FROM public.course_enrollments e JOIN public.courses c ON c.id=e.course_id
            WHERE e.user_id=m.id AND e.completed_at IS NULL AND public.academy_enrollment_has_access(e.id) AND NOT academy_private.report_excludes(e.user_id,c))
    ) ORDER BY COALESCE(m.full_name,m.email))
    FROM public.profiles m
    WHERE m.manager_id=auth.uid() AND m.id<>auth.uid() AND m.role::text IN ('internal','manager','finanse')
        AND NOT COALESCE(m.is_external,false) AND m.employment_status IS DISTINCT FROM 'exited'),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.academy_manager_team_report() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_manager_team_report() TO authenticated;

NOTIFY pgrst,'reload schema';

DO $$
BEGIN
    IF to_regprocedure('public.academy_competence_report()') IS NULL OR to_regprocedure('public.academy_manager_team_report()') IS NULL THEN RAISE EXCEPTION 'report RPC missing'; END IF;
    IF has_function_privilege('anon','public.academy_competence_report()','EXECUTE') OR has_function_privilege('anon','public.academy_manager_team_report()','EXECUTE') THEN RAISE EXCEPTION 'anon can read reports'; END IF;
    IF position('score_percent' IN pg_get_functiondef('academy_private.competence_rows()'::regprocedure))>0 THEN RAISE EXCEPTION 'report exposes scores'; END IF;
    IF position($q$('internal','manager','finanse')$q$ IN pg_get_functiondef('public.academy_manager_team_report()'::regprocedure))=0 THEN RAISE EXCEPTION 'manager report not limited to office roles'; END IF;
END $$;

COMMIT;
