-- B0.6: kurs-atrapa (courses.is_rehearsal), data startu raportów, usuwanie niepublikowanych szkiców
-- bez zapisów oraz przywracanie z archiwum.
-- is_rehearsal ustawia wyłącznie SQL (Data API nie ma prawa zapisu do courses); kursu-atrapy się nie kasuje.
-- reports_start_at ustawia właściciel SQL-em na bramce startu; przed tą datą raporty mają etykietę „próba”.
--
-- Cofnięcie: supabase/rollbacks/20261109130200_academy_rehearsal_reports_drafts.sql.
BEGIN;

ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS is_rehearsal boolean NOT NULL DEFAULT false;
ALTER TABLE public.academy_rollout_settings ADD COLUMN IF NOT EXISTS reports_start_at timestamptz;

CREATE OR REPLACE FUNCTION public.academy_reports_start_at()
RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT reports_start_at FROM public.academy_rollout_settings WHERE singleton AND public.academy_can_access();
$$;
REVOKE ALL ON FUNCTION public.academy_reports_start_at() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_reports_start_at() TO authenticated;

-- DELETE wersji przechodzi tylko dla szkicu wskazanego w tej transakcji przez academy_delete_draft_course.
CREATE OR REPLACE FUNCTION academy_private.guard_version_snapshot()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
    IF TG_OP='DELETE' THEN
        IF OLD.status IN ('draft','rejected') AND current_setting('academy.deleting_draft_course',true)=OLD.course_id::text THEN RETURN OLD; END IF;
        RAISE EXCEPTION 'immutable_course_version';
    END IF;
    IF OLD.status='published' THEN RAISE EXCEPTION 'immutable_course_version'; END IF;
    IF NEW.id<>OLD.id OR NEW.course_id<>OLD.course_id OR NEW.version_number<>OLD.version_number THEN
        RAISE EXCEPTION 'immutable_version_identity';
    END IF;
    IF OLD.status='pending_review' AND (NEW.metadata IS DISTINCT FROM OLD.metadata
        OR NEW.completion_rules IS DISTINCT FROM OLD.completion_rules) THEN RAISE EXCEPTION 'review_snapshot_immutable'; END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.academy_delete_draft_course(p_course_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses%ROWTYPE;
BEGIN
    IF NOT public.academy_can_manage_course(p_course_id) THEN RAISE EXCEPTION 'trainer_course_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO c FROM public.courses WHERE id=p_course_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'course_not_found'; END IF;
    IF c.is_rehearsal THEN RAISE EXCEPTION 'rehearsal_course_protected'; END IF;
    IF c.published_version_id IS NOT NULL OR c.status NOT IN ('draft','rejected')
        OR EXISTS(SELECT 1 FROM public.course_versions v WHERE v.course_id=c.id AND v.status NOT IN ('draft','rejected')) THEN
        RAISE EXCEPTION 'unpublished_draft_required';
    END IF;
    IF EXISTS(SELECT 1 FROM public.course_enrollments WHERE course_id=c.id)
        OR EXISTS(SELECT 1 FROM public.course_runs WHERE course_id=c.id)
        OR EXISTS(SELECT 1 FROM public.course_completions WHERE course_id=c.id)
        OR EXISTS(SELECT 1 FROM public.academy_handovers WHERE course_id=c.id) THEN
        RAISE EXCEPTION 'draft_has_activity';
    END IF;
    -- Plików w Storage nie usuwa transakcja SQL: najpierw materiały usuwa bezpieczny formularz.
    IF EXISTS(SELECT 1 FROM public.course_materials WHERE course_id=c.id) THEN RAISE EXCEPTION 'draft_has_materials'; END IF;

    PERFORM set_config('academy.deleting_draft_course',c.id::text,true);
    DELETE FROM public.course_quiz_options o USING public.course_quiz_questions q WHERE o.question_id=q.id AND q.course_id=c.id;
    DELETE FROM public.course_quiz_questions WHERE course_id=c.id;
    DELETE FROM public.course_lessons WHERE course_id=c.id;
    DELETE FROM academy_private.version_contributors x USING public.course_versions v WHERE x.version_id=v.id AND v.course_id=c.id;
    DELETE FROM public.course_staff WHERE course_id=c.id;
    -- Wpisy audytu zostają: tracą tylko klucz obcy, identyfikator kursu przechodzi do details.
    UPDATE public.academy_audit_events SET details=details||jsonb_build_object('deleted_course_id',course_id),course_id=NULL WHERE course_id=c.id;
    UPDATE public.courses SET draft_version_id=NULL WHERE id=c.id;
    DELETE FROM public.course_versions WHERE course_id=c.id;
    DELETE FROM public.courses WHERE id=c.id;
    PERFORM set_config('academy.deleting_draft_course','',true);
    INSERT INTO public.academy_audit_events(actor_id,action,details)
    VALUES(auth.uid(),'COURSE_DRAFT_DELETED',jsonb_build_object('deleted_course_id',c.id,'title',c.title));
END $$;
REVOKE ALL ON FUNCTION public.academy_delete_draft_course(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_delete_draft_course(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.academy_restore_course(p_course_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses%ROWTYPE; v_status text; v_draft text;
BEGIN
    IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO c FROM public.courses WHERE id=p_course_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'course_not_found'; END IF;
    IF c.status<>'archived' THEN RAISE EXCEPTION 'course_not_archived'; END IF;
    SELECT status INTO v_draft FROM public.course_versions WHERE id=c.draft_version_id;
    v_status:=CASE WHEN c.published_version_id IS NOT NULL THEN 'published'
                   WHEN v_draft IN ('pending_review','rejected') THEN v_draft ELSE 'draft' END;
    UPDATE public.courses SET status=v_status,updated_at=now() WHERE id=c.id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'COURSE_RESTORED',c.id,jsonb_build_object('restored_status',v_status));
    RETURN v_status;
END $$;
REVOKE ALL ON FUNCTION public.academy_restore_course(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_restore_course(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';

DO $$
BEGIN
    IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='courses' AND column_name='is_rehearsal') THEN
        RAISE EXCEPTION 'B0.6: brak courses.is_rehearsal';
    END IF;
    IF EXISTS(SELECT 1 FROM public.courses WHERE is_rehearsal) THEN RAISE EXCEPTION 'B0.6: migracja nie może oznaczać kursów jako atrapy'; END IF;
    IF has_table_privilege('authenticated','public.courses','UPDATE') THEN RAISE EXCEPTION 'B0.6: Data API nie może zapisywać courses'; END IF;
    IF position('academy.deleting_draft_course' IN pg_get_functiondef('academy_private.guard_version_snapshot()'::regprocedure))=0 THEN
        RAISE EXCEPTION 'B0.6: strażnik wersji bez furtki szkicu';
    END IF;
    IF NOT has_function_privilege('authenticated','public.academy_delete_draft_course(uuid)','EXECUTE')
        OR has_function_privilege('anon','public.academy_restore_course(uuid)','EXECUTE') THEN
        RAISE EXCEPTION 'B0.6: złe uprawnienia nowych RPC';
    END IF;
END $$;
COMMIT;
