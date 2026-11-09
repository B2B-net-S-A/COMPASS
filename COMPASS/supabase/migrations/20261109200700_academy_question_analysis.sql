-- B2.10: klucz opublikowanej wersji widzą tylko autor i recenzent, a wyniki osób
-- z dostępem do klucza nie liczą się do analizy. Odsetek poprawnych i rozkład dystraktorów,
-- bez korelacji i IRT, bo przy tej populacji nie odróżniłyby dobrego pytania od złego.
-- Cofnięcie: nieodwracalne, cofamy PITR.
BEGIN;

-- Dostęp do klucza liczony na cały kurs: kopia pytań w kolejnym szkicu ujawnia ten sam klucz.
CREATE FUNCTION academy_private.user_has_key_access(p_course_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=p_course_id AND c.author_id=p_user_id)
        OR EXISTS(SELECT 1 FROM public.course_versions v WHERE v.course_id=p_course_id AND v.reviewed_by=p_user_id)
        OR EXISTS(SELECT 1 FROM academy_private.version_contributors x JOIN public.course_versions v ON v.id=x.version_id
            WHERE v.course_id=p_course_id AND x.user_id=p_user_id);
$$;
REVOKE ALL ON FUNCTION academy_private.user_has_key_access(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.academy_can_read_quiz_key(p_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT public.academy_can_access() AND EXISTS(SELECT 1 FROM public.course_versions v WHERE v.id=p_version_id AND (
        public.academy_can_edit_version(v.id)
        OR (v.status='pending_review' AND (public.academy_can_review_version(v.id) OR academy_private.user_has_key_access(v.course_id,auth.uid())))
        OR (v.status NOT IN ('draft','pending_review') AND academy_private.user_has_key_access(v.course_id,auth.uid()))));
$$;
REVOKE ALL ON FUNCTION public.academy_can_read_quiz_key(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.academy_can_read_quiz_key(uuid) TO authenticated,service_role;

DROP POLICY academy_options_read ON public.course_quiz_options;
CREATE POLICY academy_options_read ON public.course_quiz_options FOR SELECT TO authenticated USING (
    EXISTS(SELECT 1 FROM public.course_quiz_questions q WHERE q.id=question_id AND public.academy_can_read_quiz_key(q.version_id)));

CREATE FUNCTION public.academy_question_analysis(p_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_course uuid;
BEGIN
    SELECT course_id INTO v_course FROM public.course_versions WHERE id=p_version_id;
    IF NOT FOUND OR NOT public.academy_can_read_quiz_key(p_version_id) THEN RAISE EXCEPTION 'quiz_key_access_required' USING ERRCODE='42501'; END IF;
    RETURN COALESCE((SELECT jsonb_agg(jsonb_build_object('question_id',q.id,'order_index',q.order_index,'voided',q.voided_at IS NOT NULL,
        'responses',stats.responses,'correct_percent',CASE WHEN stats.responses>0 THEN round(stats.correct*100.0/stats.responses) END,
        'options',stats.options) ORDER BY CASE WHEN stats.responses>0 THEN stats.correct*1.0/stats.responses END NULLS LAST,q.order_index)
    FROM public.course_quiz_questions q CROSS JOIN LATERAL (
        WITH answers AS (
            SELECT i.selected_option_id FROM public.course_quiz_attempt_items i
            JOIN public.course_quiz_attempts a ON a.id=i.attempt_id
            WHERE i.question_id=q.id AND a.kind='final' AND a.status<>'in_progress' AND i.selected_option_id IS NOT NULL
                AND NOT academy_private.user_has_key_access(v_course,a.user_id)
        )
        SELECT (SELECT count(*) FROM answers)::integer AS responses,
            (SELECT count(*) FROM answers x JOIN public.course_quiz_options o ON o.id=x.selected_option_id WHERE o.is_correct)::integer AS correct,
            (SELECT jsonb_agg(jsonb_build_object('option_id',o.id,'is_correct',o.is_correct,
                'count',(SELECT count(*) FROM answers x WHERE x.selected_option_id=o.id)) ORDER BY o.order_index)
                FROM public.course_quiz_options o WHERE o.question_id=q.id) AS options
    ) stats WHERE q.version_id=p_version_id),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION public.academy_question_analysis(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_question_analysis(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';

DO $$
BEGIN
    IF position('academy_can_read_quiz_key' IN (SELECT qual FROM pg_policies WHERE schemaname='public' AND tablename='course_quiz_options' AND policyname='academy_options_read'))=0 THEN
        RAISE EXCEPTION 'options policy still open to every course manager';
    END IF;
    IF has_function_privilege('anon','public.academy_question_analysis(uuid)','EXECUTE') THEN RAISE EXCEPTION 'anon can read analysis'; END IF;
END $$;

COMMIT;
