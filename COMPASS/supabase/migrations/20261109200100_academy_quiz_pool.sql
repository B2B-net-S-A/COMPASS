-- B2.1: pula pytań w istniejącym modelu course_quiz_*.
-- Addytywne: opublikowane wersje zachowują dotychczasowe zasady, a nowe pola są opcjonalne.
-- Cofnięcie: nieodwracalne dla usuniętych RPC i poszerzonych limitów, cofamy z PITR.
BEGIN;

ALTER TABLE public.course_quiz_questions
    ADD COLUMN topic_tag text CHECK (topic_tag IS NULL OR length(btrim(topic_tag)) BETWEEN 1 AND 80),
    ADD COLUMN pool_status text NOT NULL DEFAULT 'approved' CHECK (pool_status IN ('draft', 'approved')),
    -- Wypełniane wyłącznie przez RPC unieważnienia z B2.3.
    ADD COLUMN voided_at timestamptz,
    ADD COLUMN voided_by uuid REFERENCES public.profiles(id),
    ADD COLUMN void_reason text;
ALTER TABLE public.course_quiz_options
    ADD COLUMN explanation text CHECK (explanation IS NULL OR length(explanation) <= 2000);

-- Limit podejść jest ustawieniem wersji roboczej. Publikacja nadal go zamraża,
-- a jawny NULL nie przywraca nieograniczonych prób.
CREATE OR REPLACE FUNCTION academy_private.pin_quiz_attempt_policy()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
    IF TG_OP='INSERT' THEN
        NEW.quiz_attempt_limit:=COALESCE(NEW.quiz_attempt_limit,3);
        NEW.quiz_attempt_window_hours:=COALESCE(NEW.quiz_attempt_window_hours,24);
    ELSIF (NEW.quiz_attempt_limit IS DISTINCT FROM OLD.quiz_attempt_limit
        OR NEW.quiz_attempt_window_hours IS DISTINCT FROM OLD.quiz_attempt_window_hours)
        AND (OLD.status NOT IN ('draft','rejected') OR NEW.quiz_attempt_limit IS NULL OR NEW.quiz_attempt_window_hours IS NULL) THEN
        RAISE EXCEPTION 'immutable_quiz_attempt_policy';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION academy_private.rule_integer_ok(p_rules jsonb,p_key text,p_min integer,p_max integer)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
    SELECT NOT (p_rules ? p_key) OR jsonb_typeof(p_rules->p_key)='null' OR (
        jsonb_typeof(p_rules->p_key)='number'
        AND (p_rules->>p_key)::numeric=trunc((p_rules->>p_key)::numeric)
        AND (p_rules->>p_key)::numeric BETWEEN p_min AND p_max);
$$;
REVOKE ALL ON FUNCTION academy_private.rule_integer_ok(jsonb,text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION academy_private.validate_metadata(p_metadata jsonb,p_rules jsonb)
RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
    IF jsonb_typeof(p_metadata)<>'object' OR length(trim(COALESCE(p_metadata->>'title',''))) NOT BETWEEN 3 AND 200
        OR length(trim(COALESCE(p_metadata->>'category',''))) NOT BETWEEN 1 AND 100
        OR COALESCE(p_metadata->>'level','') NOT IN ('beginner','intermediate','advanced')
        OR COALESCE(p_metadata->>'delivery_mode','') NOT IN ('self_paced','live','blended')
        OR COALESCE(p_metadata->>'course_type','') NOT IN ('consultant','company')
        OR jsonb_typeof(p_metadata->'tags') IS DISTINCT FROM 'array'
        OR jsonb_typeof(p_metadata->'prerequisite_course_ids') IS DISTINCT FROM 'array'
        OR jsonb_typeof(p_metadata->'is_official') IS DISTINCT FROM 'boolean'
        OR length(COALESCE(p_metadata->>'description',''))>20000 THEN
        RAISE EXCEPTION 'invalid_course_metadata';
    END IF;
    IF (p_metadata->>'duration_minutes') IS NOT NULL AND (p_metadata->>'duration_minutes')::integer<1 THEN
        RAISE EXCEPTION 'invalid_course_duration';
    END IF;
    IF jsonb_array_length(p_metadata->'tags')>30 OR jsonb_array_length(p_metadata->'prerequisite_course_ids')>50
        OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_metadata->'tags') t
            WHERE jsonb_typeof(t)<>'string' OR length(t#>>'{}') NOT BETWEEN 1 AND 100)
        OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_metadata->'prerequisite_course_ids') p(id)
            WHERE NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=p.id::uuid)) THEN
        RAISE EXCEPTION 'invalid_course_tags_or_prerequisites';
    END IF;
    IF (p_metadata->>'is_official')::boolean AND p_metadata->>'course_type'<>'company' THEN
        RAISE EXCEPTION 'official_course_must_be_company';
    END IF;
    IF jsonb_typeof(p_rules) IS DISTINCT FROM 'object'
        OR jsonb_typeof(p_rules->'quiz_required') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(p_rules->'require_all_lessons') IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(p_rules->'quiz_pass_percent') IS DISTINCT FROM 'number'
        OR jsonb_typeof(p_rules->'attendance_percent') IS DISTINCT FROM 'number'
        OR (p_rules->>'quiz_pass_percent')::integer NOT BETWEEN 1 AND 100
        OR (p_rules->>'attendance_percent')::integer NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'invalid_completion_rules';
    END IF;
    -- Pola puli są opcjonalne: brak klucza zachowuje dotychczasowe działanie.
    IF NOT academy_private.rule_integer_ok(p_rules,'draw_count',1,100)
        OR NOT academy_private.rule_integer_ok(p_rules,'pre_test_count',1,50)
        OR NOT academy_private.rule_integer_ok(p_rules,'time_limit_minutes',1,480)
        OR jsonb_typeof(COALESCE(p_rules->'show_explanations','false')) IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(COALESCE(p_rules->'draw_random','true')) IS DISTINCT FROM 'boolean'
        OR jsonb_typeof(COALESCE(p_rules->'shuffle_options','true')) IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'invalid_quiz_configuration';
    END IF;
    IF p_metadata->>'delivery_mode'='self_paced'
        AND NOT (p_rules->>'quiz_required')::boolean AND NOT (p_rules->>'require_all_lessons')::boolean THEN
        RAISE EXCEPTION 'self_paced_requires_completion_evidence';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.academy_begin_draft(p_course_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses%ROWTYPE; v public.course_versions%ROWTYPE; v_id uuid; q record; v_question uuid;
BEGIN
    IF NOT public.academy_can_manage_course(p_course_id) THEN RAISE EXCEPTION 'trainer_course_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO c FROM public.courses WHERE id=p_course_id FOR UPDATE;
    IF c.status='archived' THEN RAISE EXCEPTION 'course_archived'; END IF;
    IF c.draft_version_id IS NOT NULL THEN
        SELECT * INTO v FROM public.course_versions WHERE id=c.draft_version_id FOR UPDATE;
        IF v.status='pending_review' THEN RAISE EXCEPTION 'version_in_review'; END IF;
        RETURN v.id;
    END IF;
    SELECT * INTO v FROM public.course_versions WHERE id=c.published_version_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'published_version_missing'; END IF;
    INSERT INTO public.course_versions(course_id,version_number,status,metadata,completion_rules,created_by,quiz_attempt_limit,quiz_attempt_window_hours)
    VALUES(c.id,(SELECT COALESCE(max(version_number),0)+1 FROM public.course_versions WHERE course_id=c.id),
        'draft',v.metadata,v.completion_rules,auth.uid(),v.quiz_attempt_limit,v.quiz_attempt_window_hours) RETURNING id INTO v_id;
    UPDATE public.courses SET draft_version_id=v_id,updated_at=now() WHERE id=c.id;
    INSERT INTO public.course_lessons(course_id,version_id,order_index,title,content_md,video_url,attachments,
        estimated_minutes,unlock_after_days,ai_summary,ai_summary_generated_at)
    SELECT course_id,v_id,order_index,title,content_md,video_url,attachments,estimated_minutes,
        unlock_after_days,ai_summary,ai_summary_generated_at FROM public.course_lessons WHERE version_id=v.id;
    -- Pytanie unieważnione w opublikowanej wersji nie wraca do kolejnej.
    FOR q IN SELECT * FROM public.course_quiz_questions WHERE version_id=v.id AND voided_at IS NULL ORDER BY order_index LOOP
        INSERT INTO public.course_quiz_questions(course_id,version_id,order_index,question_text,topic_tag,pool_status)
        VALUES(c.id,v_id,q.order_index,q.question_text,q.topic_tag,q.pool_status) RETURNING id INTO v_question;
        INSERT INTO public.course_quiz_options(question_id,order_index,option_text,is_correct,explanation)
        SELECT v_question,order_index,option_text,is_correct,explanation FROM public.course_quiz_options WHERE question_id=q.id;
    END LOOP;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'COURSE_DRAFT_CREATED',c.id,jsonb_build_object('version_id',v_id,'source_version_id',v.id));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.academy_replace_quiz(p_course_id uuid,p_questions jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; q record; o record; v_question uuid; v_status text; v_correct integer;
BEGIN
    v_id:=public.academy_begin_draft(p_course_id);
    PERFORM 1 FROM public.course_versions WHERE id=v_id FOR UPDATE;
    IF jsonb_typeof(p_questions) IS DISTINCT FROM 'array' OR jsonb_array_length(p_questions)>300 THEN
        RAISE EXCEPTION 'invalid_quiz_questions';
    END IF;
    FOR q IN SELECT value,ordinality FROM jsonb_array_elements(p_questions) WITH ORDINALITY LOOP
        v_status:=COALESCE(q.value->>'pool_status','approved');
        IF length(trim(COALESCE(q.value->>'question_text',''))) NOT BETWEEN 1 AND 8000
            OR v_status NOT IN ('draft','approved')
            OR length(btrim(COALESCE(q.value->>'topic_tag','x'))) NOT BETWEEN 1 AND 80
            OR jsonb_typeof(q.value->'options') IS DISTINCT FROM 'array'
            OR jsonb_array_length(q.value->'options') NOT BETWEEN 2 AND 6 THEN RAISE EXCEPTION 'invalid_quiz_question'; END IF;
        SELECT count(*) INTO v_correct FROM jsonb_array_elements(q.value->'options') x WHERE x->'is_correct'='true'::jsonb;
        -- Szkic puli może jeszcze nie mieć klucza; wchodzi do losowania dopiero po zatwierdzeniu.
        IF (v_status='approved' AND v_correct<>1) OR v_correct>1 THEN RAISE EXCEPTION 'invalid_quiz_question'; END IF;
        IF EXISTS(SELECT 1 FROM jsonb_array_elements(q.value->'options') x
            WHERE length(trim(COALESCE(x->>'option_text',''))) NOT BETWEEN 1 AND 2000
                OR length(COALESCE(x->>'explanation',''))>2000
                OR jsonb_typeof(x->'is_correct') IS DISTINCT FROM 'boolean') THEN RAISE EXCEPTION 'invalid_quiz_option'; END IF;
    END LOOP;
    DELETE FROM public.course_quiz_questions WHERE version_id=v_id;
    FOR q IN SELECT value,ordinality FROM jsonb_array_elements(p_questions) WITH ORDINALITY LOOP
        INSERT INTO public.course_quiz_questions(course_id,version_id,order_index,question_text,topic_tag,pool_status)
        VALUES(p_course_id,v_id,q.ordinality-1,trim(q.value->>'question_text'),NULLIF(btrim(COALESCE(q.value->>'topic_tag','')),''),
            COALESCE(q.value->>'pool_status','approved')) RETURNING id INTO v_question;
        FOR o IN SELECT value,ordinality FROM jsonb_array_elements(q.value->'options') WITH ORDINALITY LOOP
            INSERT INTO public.course_quiz_options(question_id,order_index,option_text,is_correct,explanation)
            VALUES(v_question,o.ordinality-1,trim(o.value->>'option_text'),(o.value->>'is_correct')::boolean,
                NULLIF(btrim(COALESCE(o.value->>'explanation','')),''));
        END LOOP;
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.academy_submit_for_review(p_course_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses%ROWTYPE; v public.course_versions%ROWTYPE; v_count integer; v_draw integer;
BEGIN
    IF NOT public.academy_can_manage_course(p_course_id) THEN RAISE EXCEPTION 'trainer_course_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO c FROM public.courses WHERE id=p_course_id FOR UPDATE;
    SELECT * INTO v FROM public.course_versions WHERE id=c.draft_version_id FOR UPDATE;
    IF NOT FOUND OR v.status NOT IN ('draft','rejected') OR c.status='archived' THEN RAISE EXCEPTION 'editable_draft_required'; END IF;
    PERFORM academy_private.validate_metadata(v.metadata,v.completion_rules);
    IF v.metadata->>'delivery_mode'<>'live' AND NOT EXISTS (SELECT 1 FROM public.course_lessons WHERE version_id=v.id) THEN
        RAISE EXCEPTION 'at_least_one_lesson_required';
    END IF;
    IF EXISTS(SELECT 1 FROM public.course_lessons l WHERE l.version_id=v.id AND (
        length(trim(l.title)) NOT BETWEEN 1 AND 200 OR (length(trim(COALESCE(l.content_md,'')))=0
            AND length(trim(COALESCE(l.video_url,'')))=0 AND jsonb_array_length(l.attachments)=0))) THEN
        RAISE EXCEPTION 'lesson_content_required';
    END IF;
    SELECT count(*) INTO v_count FROM public.course_quiz_questions WHERE version_id=v.id AND pool_status='approved' AND voided_at IS NULL;
    v_draw:=NULLIF(v.completion_rules->>'draw_count','')::integer;
    IF (v.completion_rules->>'quiz_required')::boolean THEN
        IF v_count=0 THEN RAISE EXCEPTION 'quiz_requires_questions'; END IF;
        IF v_draw>v_count THEN RAISE EXCEPTION 'quiz_pool_smaller_than_draw'; END IF;
    END IF;
    -- Wyjaśnienia ujawniają klucz po próbie, więc pula musi być co najmniej dwukrotnie większa od zestawu.
    -- Stały zestaw (draw_random=false) wróciłby w kolejnej próbie razem z ujawnionym kluczem.
    IF COALESCE((v.completion_rules->>'show_explanations')::boolean,false) AND (v_draw IS NULL OR v_count<2*v_draw
        OR NOT COALESCE((v.completion_rules->>'draw_random')::boolean,true)) THEN
        RAISE EXCEPTION 'quiz_explanations_need_larger_pool';
    END IF;
    IF EXISTS(SELECT 1 FROM public.course_quiz_questions q WHERE q.version_id=v.id AND q.pool_status='approved' AND (
        length(trim(q.question_text)) NOT BETWEEN 1 AND 8000 OR
        (SELECT count(*) FROM public.course_quiz_options o WHERE o.question_id=q.id) NOT BETWEEN 2 AND 6 OR
        (SELECT count(*) FROM public.course_quiz_options o WHERE o.question_id=q.id AND o.is_correct)<>1 OR
        EXISTS(SELECT 1 FROM public.course_quiz_options o WHERE o.question_id=q.id AND length(trim(o.option_text)) NOT BETWEEN 1 AND 2000))) THEN
        RAISE EXCEPTION 'invalid_quiz_options';
    END IF;
    UPDATE public.course_versions SET status='pending_review',submitted_at=now(),reviewed_by=NULL,
        reviewed_at=NULL,rejection_reason=NULL WHERE id=v.id;
    UPDATE public.courses SET status=CASE WHEN published_version_id IS NULL THEN 'pending_review' ELSE status END,
        updated_at=now() WHERE id=c.id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'COURSE_SUBMITTED',c.id,jsonb_build_object('version_id',v.id));
    RETURN v.id;
END $$;

CREATE FUNCTION public.academy_set_quiz_attempt_policy(p_course_id uuid,p_limit integer,p_window_hours integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
    v_id:=public.academy_begin_draft(p_course_id);
    IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10 OR p_window_hours IS NULL OR p_window_hours NOT BETWEEN 1 AND 168 THEN
        RAISE EXCEPTION 'invalid_quiz_attempt_policy';
    END IF;
    -- completion_rules na liście SET uruchamia zapis współautora wersji (niezależna recenzja).
    UPDATE public.course_versions SET quiz_attempt_limit=p_limit,quiz_attempt_window_hours=p_window_hours,
        completion_rules=completion_rules WHERE id=v_id;
    RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.academy_set_quiz_attempt_policy(uuid,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_set_quiz_attempt_policy(uuid,integer,integer) TO authenticated;

-- Martwe wejścia po identyfikatorze kursu; aplikacja woła academy_get_quiz i academy_submit_quiz.
DROP FUNCTION public.get_quiz_for_attempt(uuid);
DROP FUNCTION public.submit_quiz_attempt(uuid,jsonb);

NOTIFY pgrst,'reload schema';

DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='course_quiz_questions' AND column_name='topic_tag')
        OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='course_quiz_options' AND column_name='explanation') THEN
        RAISE EXCEPTION 'quiz pool columns missing';
    END IF;
    IF to_regprocedure('public.get_quiz_for_attempt(uuid)') IS NOT NULL OR to_regprocedure('public.submit_quiz_attempt(uuid,jsonb)') IS NOT NULL THEN
        RAISE EXCEPTION 'dead quiz RPCs still present';
    END IF;
    IF position('quiz_requires_four_to_ten_questions' IN pg_get_functiondef('public.academy_submit_for_review(uuid)'::regprocedure))>0 THEN
        RAISE EXCEPTION 'rigid question count still enforced';
    END IF;
    IF has_function_privilege('anon','public.academy_set_quiz_attempt_policy(uuid,integer,integer)','EXECUTE') THEN
        RAISE EXCEPTION 'anon can set attempt policy';
    END IF;
END $$;

COMMIT;
