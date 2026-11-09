-- B4.8: kurs dla nieobecnych jednym działaniem (M09). Z zakończonej edycji powstaje szkic self_paced
-- z tą samą pulą pytań i listą nieobecnych. Szkic przechodzi zwykłą, niezależną akceptację, a nic
-- nie jest wysyłane. Kurs i szkolenie na żywo łączy academy_programmes, więc raport liczy program raz.
-- Wymaga wcześniejszych: 20261109200100_academy_quiz_pool i 20261109213400_academy_library.
-- Cofnięcie: DROP FUNCTION public.academy_programme_completions(), public.academy_create_twin_course(uuid);
-- DROP TABLE public.academy_twin_course_absentees; ALTER TABLE public.courses DROP COLUMN source_run_id.

ALTER TABLE public.courses ADD COLUMN source_run_id uuid REFERENCES public.course_runs(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX academy_courses_source_run_uq ON public.courses(source_run_id) WHERE source_run_id IS NOT NULL;

CREATE TABLE public.academy_twin_course_absentees (
    course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    run_id uuid NOT NULL REFERENCES public.course_runs(id) ON DELETE CASCADE,
    added_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (course_id, user_id)
);
ALTER TABLE public.academy_twin_course_absentees ENABLE ROW LEVEL SECURITY;
CREATE POLICY academy_twin_absentees_manage_read ON public.academy_twin_course_absentees
    FOR SELECT TO authenticated USING (public.academy_can_manage_course(course_id));
REVOKE ALL ON public.academy_twin_course_absentees FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academy_twin_course_absentees TO authenticated;

CREATE FUNCTION public.academy_create_twin_course(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    r public.course_runs%ROWTYPE;
    v public.course_versions%ROWTYPE;
    source_course public.courses%ROWTYPE;
    created jsonb;
    v_course uuid;
    v_version uuid;
    v_existing uuid;
    v_programme uuid;
    v_question uuid;
    v_has_quiz boolean;
    v_rules jsonb;
    v_absentees integer;
    q record;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE = '42501'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id = p_run_id FOR UPDATE;
    IF NOT FOUND OR NOT public.academy_can_manage_run(p_run_id) THEN RAISE EXCEPTION 'run_manager_required' USING ERRCODE = '42501'; END IF;

    -- Drugie kliknięcie wraca do istniejącego szkicu zamiast tworzyć kolejny.
    SELECT id INTO v_existing FROM public.courses WHERE source_run_id = p_run_id;
    IF FOUND THEN RETURN jsonb_build_object('course_id', v_existing, 'created', false, 'absentees', (SELECT count(*) FROM public.academy_twin_course_absentees WHERE course_id = v_existing)); END IF;

    IF r.status = 'cancelled' OR NOT EXISTS (SELECT 1 FROM public.course_sessions s WHERE s.run_id = p_run_id AND s.status <> 'cancelled')
        OR EXISTS (SELECT 1 FROM public.course_sessions s WHERE s.run_id = p_run_id AND s.status <> 'cancelled' AND s.ends_at > now()) THEN
        RAISE EXCEPTION 'run_not_finished';
    END IF;

    SELECT * INTO v FROM public.course_versions WHERE id = r.version_id;
    SELECT * INTO source_course FROM public.courses WHERE id = r.course_id;
    v_has_quiz := EXISTS (SELECT 1 FROM public.course_quiz_questions WHERE version_id = v.id AND voided_at IS NULL);
    v_rules := v.completion_rules || jsonb_build_object('quiz_required', v_has_quiz, 'require_all_lessons', true);

    created := public.academy_create_course(jsonb_build_object(
        'title', left(v.metadata->>'title' || ' (kurs z modułów)', 200),
        'description', v.metadata->>'description',
        'category', v.metadata->>'category',
        'tags', COALESCE(v.metadata->'tags', '[]'::jsonb),
        'level', COALESCE(v.metadata->>'level', 'beginner'),
        'course_type', v.metadata->>'course_type',
        'is_official', COALESCE((v.metadata->>'is_official')::boolean, false),
        'delivery_mode', 'self_paced',
        'completion_rules', v_rules
    ));
    v_course := (created->>'course_id')::uuid;
    v_version := (created->>'version_id')::uuid;

    UPDATE public.course_versions SET quiz_attempt_limit = v.quiz_attempt_limit, quiz_attempt_window_hours = v.quiz_attempt_window_hours WHERE id = v_version;

    -- Moduły nagrywa prowadzący osobno, więc lekcje startują bez plików edycji.
    INSERT INTO public.course_lessons(course_id, version_id, order_index, title, content_md, attachments, estimated_minutes, unlock_after_days)
    SELECT v_course, v_version, order_index, title, content_md, '[]'::jsonb, estimated_minutes, 0
    FROM public.course_lessons WHERE version_id = v.id;

    FOR q IN SELECT * FROM public.course_quiz_questions WHERE version_id = v.id AND voided_at IS NULL ORDER BY order_index LOOP
        INSERT INTO public.course_quiz_questions(course_id, version_id, order_index, question_text, topic_tag, pool_status)
        VALUES (v_course, v_version, q.order_index, q.question_text, q.topic_tag, q.pool_status) RETURNING id INTO v_question;
        INSERT INTO public.course_quiz_options(question_id, order_index, option_text, is_correct, explanation)
        SELECT v_question, order_index, option_text, is_correct, explanation FROM public.course_quiz_options WHERE question_id = q.id;
    END LOOP;

    v_programme := source_course.programme_id;
    IF v_programme IS NULL THEN
        INSERT INTO public.academy_programmes(title, created_by) VALUES (left(v.metadata->>'title', 200), auth.uid()) RETURNING id INTO v_programme;
        UPDATE public.courses SET programme_id = v_programme WHERE id = source_course.id;
    END IF;
    UPDATE public.courses SET programme_id = v_programme, source_run_id = p_run_id WHERE id = v_course;

    -- Nieobecny to potwierdzony zapis bez zaliczonej obecności na żadnej obowiązkowej sesji.
    INSERT INTO public.academy_twin_course_absentees(course_id, user_id, run_id)
    SELECT v_course, reg.user_id, p_run_id
    FROM public.course_run_registrations reg
    WHERE reg.run_id = p_run_id AND reg.status = 'confirmed' AND reg.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.session_attendance a JOIN public.course_sessions s ON s.id = a.session_id
        WHERE a.enrollment_id = reg.enrollment_id AND s.run_id = p_run_id AND a.status = 'present'
      );
    GET DIAGNOSTICS v_absentees = ROW_COUNT;

    INSERT INTO public.academy_audit_events(actor_id, action, course_id, details)
    VALUES (auth.uid(), 'TWIN_COURSE_CREATED', v_course, jsonb_build_object('run_id', p_run_id, 'version_id', v_version, 'absentees', v_absentees));

    RETURN jsonb_build_object('course_id', v_course, 'created', true, 'absentees', v_absentees);
END $$;
REVOKE ALL ON FUNCTION public.academy_create_twin_course(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academy_create_twin_course(uuid) TO authenticated;

-- Ukończenie szkolenia na żywo albo kursu z modułów przez tę samą osobę liczy się raz.
CREATE FUNCTION public.academy_programme_completions()
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

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'courses' AND column_name = 'source_run_id') THEN RAISE EXCEPTION 'B4.8: brak courses.source_run_id'; END IF;
    IF to_regclass('public.academy_twin_course_absentees') IS NULL THEN RAISE EXCEPTION 'B4.8: brak listy nieobecnych'; END IF;
    IF has_table_privilege('authenticated', 'public.academy_twin_course_absentees', 'INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'B4.8: authenticated ma zapis listy nieobecnych'; END IF;
    IF NOT has_function_privilege('authenticated', 'public.academy_create_twin_course(uuid)', 'EXECUTE') THEN RAISE EXCEPTION 'B4.8: brak EXECUTE dla authenticated'; END IF;
END $$;
