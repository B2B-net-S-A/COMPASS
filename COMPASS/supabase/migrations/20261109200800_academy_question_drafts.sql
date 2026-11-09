-- B2.11: szkice pytań z AI. Do puli trafia wyłącznie to, co zatwierdził człowiek,
-- z zapisem kto i kiedy. Generowanie stoi za ACADEMY_AI_DRAFTS_ENABLED w aplikacji.
-- Cofnięcie: nieodwracalne, cofamy PITR.
BEGIN;

CREATE TABLE public.academy_question_drafts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id uuid NOT NULL REFERENCES public.courses(id),
    source_label text NOT NULL CHECK (length(btrim(source_label)) BETWEEN 1 AND 200),
    source_excerpt text NOT NULL CHECK (length(btrim(source_excerpt)) BETWEEN 1 AND 2000),
    question_text text NOT NULL CHECK (length(btrim(question_text)) BETWEEN 1 AND 8000),
    options jsonb NOT NULL CHECK (jsonb_typeof(options)='array'),
    topic_tag text CHECK (topic_tag IS NULL OR length(btrim(topic_tag)) BETWEEN 1 AND 80),
    critique jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(critique)='object'),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    model text,
    generated_by uuid NOT NULL REFERENCES public.profiles(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_by uuid REFERENCES public.profiles(id),
    decided_at timestamptz,
    decision_reason text,
    approved_question_id uuid,
    CHECK ((status='pending' AND decided_by IS NULL AND decided_at IS NULL) OR (status<>'pending' AND decided_by IS NOT NULL AND decided_at IS NOT NULL))
);
CREATE INDEX academy_question_drafts_course ON public.academy_question_drafts(course_id,status,created_at);
ALTER TABLE public.academy_question_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_question_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.academy_question_drafts TO authenticated;
GRANT ALL ON public.academy_question_drafts TO service_role;
CREATE POLICY academy_question_drafts_read ON public.academy_question_drafts FOR SELECT TO authenticated
    USING (public.academy_can_manage_course(course_id));

CREATE FUNCTION academy_private.draft_options_valid(p_options jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
    SELECT jsonb_typeof(p_options)='array' AND jsonb_array_length(p_options) BETWEEN 2 AND 6
        AND (SELECT count(*) FROM jsonb_array_elements(p_options) x WHERE x->'is_correct'='true'::jsonb)=1
        AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_options) x WHERE length(btrim(COALESCE(x->>'option_text',''))) NOT BETWEEN 1 AND 2000
            OR length(COALESCE(x->>'explanation',''))>2000 OR jsonb_typeof(x->'is_correct') IS DISTINCT FROM 'boolean');
$$;
REVOKE ALL ON FUNCTION academy_private.draft_options_valid(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.academy_save_question_drafts(p_course_id uuid,p_drafts jsonb,p_model text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d jsonb; v_count integer:=0;
BEGIN
    IF NOT public.academy_can_manage_course(p_course_id) THEN RAISE EXCEPTION 'trainer_course_required' USING ERRCODE='42501'; END IF;
    IF jsonb_typeof(p_drafts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_drafts) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'invalid_question_drafts'; END IF;
    FOR d IN SELECT value FROM jsonb_array_elements(p_drafts) LOOP
        IF NOT academy_private.draft_options_valid(d->'options') THEN RAISE EXCEPTION 'invalid_question_drafts'; END IF;
        INSERT INTO public.academy_question_drafts(course_id,source_label,source_excerpt,question_text,options,topic_tag,critique,model,generated_by)
        VALUES(p_course_id,d->>'source_label',d->>'source_excerpt',d->>'question_text',d->'options',NULLIF(btrim(COALESCE(d->>'topic_tag','')),''),COALESCE(d->'critique','{}'::jsonb),p_model,auth.uid());
        v_count:=v_count+1;
    END LOOP;
    RETURN v_count;
END $$;

-- Człowiek może poprawić treść przed zatwierdzeniem; do puli idzie wersja po poprawkach.
CREATE FUNCTION public.academy_decide_question_draft(p_draft_id uuid,p_approve boolean,p_reason text DEFAULT NULL,p_edited jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d public.academy_question_drafts; v_version uuid; v_question uuid; v_text text; v_options jsonb; v_topic text; o record;
BEGIN
    SELECT * INTO d FROM public.academy_question_drafts WHERE id=p_draft_id FOR UPDATE;
    IF NOT FOUND OR NOT public.academy_can_manage_course(d.course_id) THEN RAISE EXCEPTION 'trainer_course_required' USING ERRCODE='42501'; END IF;
    IF d.status<>'pending' THEN RAISE EXCEPTION 'question_draft_already_decided'; END IF;
    IF p_approve IS NULL THEN RAISE EXCEPTION 'review_decision_required'; END IF;
    IF NOT p_approve THEN
        IF length(btrim(COALESCE(p_reason,''))) NOT BETWEEN 3 AND 2000 THEN RAISE EXCEPTION 'rejection_reason_required'; END IF;
        UPDATE public.academy_question_drafts SET status='rejected',decided_by=auth.uid(),decided_at=now(),decision_reason=btrim(p_reason) WHERE id=d.id;
        INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(auth.uid(),'QUESTION_DRAFT_REJECTED',d.course_id,jsonb_build_object('draft_id',d.id));
        RETURN jsonb_build_object('status','rejected');
    END IF;
    v_text:=btrim(COALESCE(p_edited->>'question_text',d.question_text));
    v_options:=COALESCE(p_edited->'options',d.options);
    v_topic:=NULLIF(btrim(COALESCE(p_edited->>'topic_tag',d.topic_tag,'')),'');
    IF length(v_text) NOT BETWEEN 1 AND 8000 OR NOT academy_private.draft_options_valid(v_options) THEN RAISE EXCEPTION 'invalid_question_drafts'; END IF;
    v_version:=public.academy_begin_draft(d.course_id);
    PERFORM 1 FROM public.course_versions WHERE id=v_version FOR UPDATE;
    INSERT INTO public.course_quiz_questions(course_id,version_id,order_index,question_text,topic_tag,pool_status)
    VALUES(d.course_id,v_version,(SELECT COALESCE(max(order_index),-1)+1 FROM public.course_quiz_questions WHERE version_id=v_version),v_text,v_topic,'approved')
    RETURNING id INTO v_question;
    FOR o IN SELECT value,ordinality FROM jsonb_array_elements(v_options) WITH ORDINALITY LOOP
        INSERT INTO public.course_quiz_options(question_id,order_index,option_text,is_correct,explanation)
        VALUES(v_question,o.ordinality-1,btrim(o.value->>'option_text'),(o.value->>'is_correct')::boolean,NULLIF(btrim(COALESCE(o.value->>'explanation','')),''));
    END LOOP;
    UPDATE public.academy_question_drafts SET status='approved',decided_by=auth.uid(),decided_at=now(),approved_question_id=v_question WHERE id=d.id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'QUESTION_DRAFT_APPROVED',d.course_id,jsonb_build_object('draft_id',d.id,'question_id',v_question,'version_id',v_version,'edited',p_edited IS NOT NULL));
    RETURN jsonb_build_object('status','approved','question_id',v_question,'version_id',v_version);
END $$;

REVOKE ALL ON FUNCTION public.academy_save_question_drafts(uuid,jsonb,text),public.academy_decide_question_draft(uuid,boolean,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_save_question_drafts(uuid,jsonb,text),public.academy_decide_question_draft(uuid,boolean,text,jsonb) TO authenticated;

NOTIFY pgrst,'reload schema';

DO $$
BEGIN
    IF to_regclass('public.academy_question_drafts') IS NULL THEN RAISE EXCEPTION 'question drafts missing'; END IF;
    IF has_table_privilege('authenticated','public.academy_question_drafts','INSERT') OR has_table_privilege('authenticated','public.academy_question_drafts','UPDATE') THEN
        RAISE EXCEPTION 'drafts writable outside the approval RPC';
    END IF;
    IF has_function_privilege('anon','public.academy_decide_question_draft(uuid,boolean,text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'anon can decide drafts'; END IF;
END $$;

COMMIT;
