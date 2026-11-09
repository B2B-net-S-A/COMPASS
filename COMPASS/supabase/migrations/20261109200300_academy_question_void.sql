-- B2.3: unieważnienie pytania w opublikowanej wersji. Pytanie liczy się jako poprawne
-- w każdej próbie, w której padło, i wypada z losowania, więc nikt nie traci zaliczenia.
-- Cofnięcie: nieodwracalne, cofamy PITR.
BEGIN;

CREATE OR REPLACE FUNCTION academy_private.guard_content_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid; v_status text; v_course uuid; v_question uuid;
BEGIN
    -- Jedyny wyjątek od niezmienności: RPC unieważnienia ustawia znacznik transakcji
    -- dla konkretnego pytania i może zmienić wyłącznie kolumny unieważnienia.
    -- Osobne IF: wyzwalacz obsługuje też tabele bez tych kolumn.
    IF TG_TABLE_NAME='course_quiz_questions' AND TG_OP='UPDATE' THEN
        IF current_setting('academy.voiding_question',true)=OLD.id::text
            AND to_jsonb(OLD)->>'voided_at' IS NULL AND to_jsonb(NEW)->>'voided_at' IS NOT NULL
            AND (to_jsonb(NEW)-ARRAY['voided_at','voided_by','void_reason'])=(to_jsonb(OLD)-ARRAY['voided_at','voided_by','void_reason']) THEN
            RETURN NEW;
        END IF;
    END IF;
    IF TG_TABLE_NAME='course_quiz_options' THEN
        v_question := CASE WHEN TG_OP='DELETE' THEN OLD.question_id ELSE NEW.question_id END;
        IF TG_OP='UPDATE' AND NEW.question_id<>OLD.question_id THEN RAISE EXCEPTION 'immutable_question_identity'; END IF;
        SELECT version_id,course_id INTO v_id,v_course FROM public.course_quiz_questions WHERE id=v_question;
        -- Parent DELETE has already passed its version guard before the FK cascade.
        IF TG_OP='DELETE' AND v_id IS NULL AND pg_trigger_depth()>1 THEN RETURN OLD; END IF;
    ELSE
        v_id := CASE WHEN TG_OP='DELETE' THEN OLD.version_id ELSE NEW.version_id END;
        v_course := CASE WHEN TG_OP='DELETE' THEN OLD.course_id ELSE NEW.course_id END;
        IF TG_OP='UPDATE' AND (NEW.version_id<>OLD.version_id OR NEW.course_id<>OLD.course_id) THEN
            RAISE EXCEPTION 'immutable_content_identity';
        END IF;
    END IF;
    SELECT status INTO v_status FROM public.course_versions WHERE id=v_id AND course_id=v_course FOR UPDATE;
    -- A scanner has no user session. Its sole exception is attaching scanned
    -- assets to the current editable draft; a separate asset trigger validates
    -- every reference. It cannot create/delete lessons or change other content.
    IF TG_TABLE_NAME='course_lessons' AND TG_OP='UPDATE' AND auth.role()='service_role'
        AND v_status IN ('draft','rejected')
        AND EXISTS(SELECT 1 FROM public.courses c WHERE c.id=v_course AND c.draft_version_id=v_id AND c.status<>'archived')
        AND (to_jsonb(NEW)-ARRAY['attachments','updated_at'])=(to_jsonb(OLD)-ARRAY['attachments','updated_at']) THEN
        RETURN NEW;
    END IF;
    IF NOT FOUND OR v_status NOT IN ('draft','rejected') OR NOT public.academy_can_edit_version(v_id) THEN
        RAISE EXCEPTION 'version_not_editable' USING ERRCODE='42501';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$;

-- Skutek liczony na bieżącym stanie: ile prób zyska punkt, ile przekroczy próg, ile osób zyska zaliczenie.
CREATE FUNCTION academy_private.question_void_impact(p_question_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    WITH question AS (
        SELECT q.id,q.version_id,(v.completion_rules->>'quiz_pass_percent')::integer AS pass_percent
        FROM public.course_quiz_questions q JOIN public.course_versions v ON v.id=q.version_id WHERE q.id=p_question_id
    ), affected AS (
        SELECT a.id,a.enrollment_id,a.passed,a.kind,
            (o.is_correct IS NOT TRUE) AS gains,
            (SELECT count(*) FROM public.course_quiz_attempt_items x WHERE x.attempt_id=a.id) AS total,
            (SELECT count(*) FROM public.course_quiz_attempt_items x JOIN public.course_quiz_questions xq ON xq.id=x.question_id
                LEFT JOIN public.course_quiz_options xo ON xo.id=x.selected_option_id
                WHERE x.attempt_id=a.id AND (xq.voided_at IS NOT NULL OR xo.is_correct OR xq.id=p_question_id)) AS correct_after
        FROM public.course_quiz_attempt_items i JOIN public.course_quiz_attempts a ON a.id=i.attempt_id
        LEFT JOIN public.course_quiz_options o ON o.id=i.selected_option_id
        WHERE i.question_id=p_question_id AND a.status<>'in_progress'
    ), crossing AS (
        SELECT f.* FROM affected f, question q
        WHERE f.kind='final' AND NOT f.passed AND round(f.correct_after::numeric/f.total*100)>=q.pass_percent
    )
    SELECT jsonb_build_object('attempts',(SELECT count(*) FROM affected),
        'gain_point',(SELECT count(*) FROM affected WHERE gains),
        'cross_threshold',(SELECT count(*) FROM crossing),
        'lose_pass',0,
        'new_passes',(SELECT count(DISTINCT c.enrollment_id) FROM crossing c WHERE NOT EXISTS(
            SELECT 1 FROM public.course_quiz_attempts p WHERE p.enrollment_id=c.enrollment_id AND p.kind='final' AND p.passed)),
        'pool_after',(SELECT count(*) FROM public.course_quiz_questions other, question q
            WHERE other.version_id=q.version_id AND other.pool_status='approved' AND other.voided_at IS NULL AND other.id<>p_question_id));
$$;

CREATE FUNCTION public.academy_preview_void_question(p_question_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_course uuid;
BEGIN
    SELECT course_id INTO v_course FROM public.course_quiz_questions WHERE id=p_question_id;
    IF NOT FOUND OR NOT public.academy_can_manage_course(v_course) THEN RAISE EXCEPTION 'trainer_course_required' USING ERRCODE='42501'; END IF;
    RETURN academy_private.question_void_impact(p_question_id);
END $$;

CREATE FUNCTION public.academy_void_question(p_question_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q public.course_quiz_questions; v public.course_versions; v_impact jsonb; a record; v_run uuid;
    v_total integer; v_correct integer; v_score integer; v_new_passed boolean; v_recalculated integer:=0; v_completed integer:=0; v_result jsonb;
BEGIN
    SELECT * INTO q FROM public.course_quiz_questions WHERE id=p_question_id;
    IF NOT FOUND OR NOT public.academy_can_manage_course(q.course_id) THEN RAISE EXCEPTION 'trainer_course_required' USING ERRCODE='42501'; END IF;
    IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'void_reason_required'; END IF;
    SELECT * INTO v FROM public.course_versions WHERE id=q.version_id FOR SHARE;
    IF v.status<>'published' THEN RAISE EXCEPTION 'void_requires_published_version'; END IF;
    -- NO KEY: blokuje wysyłkę (FOR SHARE), ale nie zapis zestawu z FK do pytania,
    -- bo start trzyma wtedy zapis uczestnika, na który unieważnienie czeka niżej.
    SELECT * INTO q FROM public.course_quiz_questions WHERE id=p_question_id FOR NO KEY UPDATE;
    IF q.voided_at IS NOT NULL THEN RETURN jsonb_build_object('already_voided',true,'voided_at',q.voided_at); END IF;
    v_impact:=academy_private.question_void_impact(p_question_id);
    IF (v_impact->>'pool_after')::integer=0 THEN RAISE EXCEPTION 'void_would_empty_pool'; END IF;
    PERFORM set_config('academy.voiding_question',q.id::text,true);
    UPDATE public.course_quiz_questions SET voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason) WHERE id=q.id;
    PERFORM set_config('academy.voiding_question','',true);

    -- Ta sama kolejność blokad co wysyłka próby: edycja, zapis, próba.
    FOR a IN SELECT x.id,x.enrollment_id,x.kind,x.passed FROM public.course_quiz_attempts x
        JOIN public.course_quiz_attempt_items i ON i.attempt_id=x.id
        WHERE i.question_id=q.id AND x.status<>'in_progress' ORDER BY x.enrollment_id,x.id LOOP
        SELECT run_id INTO v_run FROM public.course_enrollments WHERE id=a.enrollment_id;
        IF v_run IS NOT NULL THEN PERFORM 1 FROM public.course_runs WHERE id=v_run FOR UPDATE; END IF;
        PERFORM 1 FROM public.course_enrollments WHERE id=a.enrollment_id FOR UPDATE;
        PERFORM 1 FROM public.course_quiz_attempts WHERE id=a.id FOR UPDATE;
        SELECT count(*),count(*) FILTER(WHERE xq.voided_at IS NOT NULL OR xo.is_correct) INTO v_total,v_correct
            FROM public.course_quiz_attempt_items x JOIN public.course_quiz_questions xq ON xq.id=x.question_id
            LEFT JOIN public.course_quiz_options xo ON xo.id=x.selected_option_id WHERE x.attempt_id=a.id;
        v_score:=round(v_correct::numeric/v_total*100);
        v_new_passed:=a.kind='final' AND v_score>=(v.completion_rules->>'quiz_pass_percent')::integer;
        UPDATE public.course_quiz_attempts SET score_percent=v_score,passed=passed OR v_new_passed WHERE id=a.id;
        v_recalculated:=v_recalculated+1;
        IF v_new_passed AND NOT a.passed THEN
            v_result:=academy_private.finalize_enrollment(a.enrollment_id);
            IF (v_result->>'completed')::boolean AND NOT COALESCE((v_result->>'already_completed')::boolean,false) THEN v_completed:=v_completed+1; END IF;
        END IF;
    END LOOP;

    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'QUIZ_QUESTION_VOIDED',q.course_id,jsonb_build_object('question_id',q.id,'version_id',q.version_id,'reason',btrim(p_reason),
        'recalculated',v_recalculated,'completions_closed',v_completed,'impact',v_impact));
    RETURN jsonb_build_object('already_voided',false,'recalculated',v_recalculated,'completions_closed',v_completed,'impact',v_impact);
END $$;

REVOKE ALL ON FUNCTION academy_private.question_void_impact(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.academy_preview_void_question(uuid),public.academy_void_question(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_preview_void_question(uuid),public.academy_void_question(uuid,text) TO authenticated;

NOTIFY pgrst,'reload schema';

DO $$
BEGIN
    IF position('academy.voiding_question' IN pg_get_functiondef('academy_private.guard_content_write()'::regprocedure))=0 THEN
        RAISE EXCEPTION 'void exception missing from content guard';
    END IF;
    IF has_function_privilege('anon','public.academy_void_question(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'anon can void questions'; END IF;
    IF NOT has_function_privilege('authenticated','public.academy_void_question(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'void RPC not granted'; END IF;
END $$;

COMMIT;
