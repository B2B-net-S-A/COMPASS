-- Explicit content and facilitation assignments; independent moderation and legacy review.
BEGIN;
CREATE TABLE public.course_staff (
 course_id uuid NOT NULL REFERENCES public.courses(id),user_id uuid NOT NULL REFERENCES public.profiles(id),
 role text NOT NULL CHECK(role IN ('editor','facilitator')),granted_by uuid NOT NULL REFERENCES public.profiles(id),
 granted_at timestamptz NOT NULL DEFAULT now(),revoked_by uuid REFERENCES public.profiles(id),revoked_at timestamptz,
 PRIMARY KEY(course_id,user_id,role)
);
CREATE TABLE public.course_run_staff (
 run_id uuid NOT NULL REFERENCES public.course_runs(id),user_id uuid NOT NULL REFERENCES public.profiles(id),
 granted_by uuid NOT NULL REFERENCES public.profiles(id),granted_at timestamptz NOT NULL DEFAULT now(),
 revoked_by uuid REFERENCES public.profiles(id),revoked_at timestamptz,PRIMARY KEY(run_id,user_id)
);
CREATE INDEX academy_staff_user ON public.course_staff(user_id,course_id) WHERE revoked_at IS NULL;
CREATE INDEX academy_run_staff_user ON public.course_run_staff(user_id,run_id) WHERE revoked_at IS NULL;
CREATE FUNCTION academy_private.trainer_eligible(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=p_user_id
  AND NOT COALESCE(p.is_external,false) AND COALESCE(p.employment_status::text,'active')<>'exited'
  AND (p.role::text='admin' OR (p.role::text='consultant' AND EXISTS(SELECT 1 FROM public.academy_user_capabilities g
   WHERE g.user_id=p.id AND g.can_train AND g.revoked_at IS NULL))));
$$;
CREATE FUNCTION public.academy_can_edit_course_as(p_course_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT academy_private.trainer_eligible(p_user_id) AND EXISTS(SELECT 1 FROM public.courses c JOIN public.profiles p ON p.id=p_user_id
 WHERE c.id=p_course_id AND (p.role::text='admin' OR c.author_id=p_user_id OR EXISTS(SELECT 1 FROM public.course_staff s
 WHERE s.course_id=c.id AND s.user_id=p_user_id AND s.role='editor' AND s.revoked_at IS NULL)));
$$;
CREATE FUNCTION public.academy_can_lead_course_as(p_course_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT academy_private.trainer_eligible(p_user_id) AND EXISTS(SELECT 1 FROM public.courses c JOIN public.profiles p ON p.id=p_user_id
 WHERE c.id=p_course_id AND (p.role::text='admin' OR c.author_id=p_user_id OR EXISTS(SELECT 1 FROM public.course_staff s
 WHERE s.course_id=c.id AND s.user_id=p_user_id AND s.role='facilitator' AND s.revoked_at IS NULL)));
$$;
CREATE FUNCTION public.academy_can_lead_run_as(p_run_id uuid,p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT academy_private.trainer_eligible(p_user_id) AND EXISTS(SELECT 1 FROM public.course_runs r WHERE r.id=p_run_id
 AND (public.academy_can_lead_course_as(r.course_id,p_user_id) OR EXISTS(SELECT 1 FROM public.course_run_staff s
 WHERE s.run_id=r.id AND s.user_id=p_user_id AND s.revoked_at IS NULL)));
$$;
CREATE OR REPLACE FUNCTION public.academy_can_manage_course(p_course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND public.academy_can_edit_course_as(p_course_id,auth.uid());
$$;
CREATE FUNCTION public.academy_can_lead_course(p_course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND public.academy_can_lead_course_as(p_course_id,auth.uid());
$$;
CREATE OR REPLACE FUNCTION public.academy_can_manage_run(p_run_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND public.academy_can_lead_run_as(p_run_id,auth.uid());
$$;
CREATE FUNCTION public.academy_can_assign_staff(p_course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.academy_is_trainer() AND EXISTS(SELECT 1 FROM public.courses WHERE id=p_course_id AND (author_id=auth.uid() OR public.is_admin()));
$$;
ALTER TABLE public.course_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_run_staff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.course_staff,public.course_run_staff FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.course_staff,public.course_run_staff TO authenticated;
GRANT ALL ON public.course_staff,public.course_run_staff TO service_role;
CREATE POLICY academy_staff_read ON public.course_staff FOR SELECT TO authenticated
 USING(public.academy_can_access() AND (user_id=auth.uid() OR public.academy_can_assign_staff(course_id)));
CREATE POLICY academy_run_staff_read ON public.course_run_staff FOR SELECT TO authenticated
 USING(public.academy_can_access() AND (user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.course_runs r WHERE r.id=run_id AND public.academy_can_assign_staff(r.course_id))));

CREATE FUNCTION public.academy_set_course_staff(p_course_id uuid,p_user_id uuid,p_role text,p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_run uuid;
BEGIN
 IF NOT public.academy_can_assign_staff(p_course_id) THEN RAISE EXCEPTION 'course_owner_or_admin_required' USING ERRCODE='42501'; END IF;
 IF p_enabled IS NULL OR p_role NOT IN ('editor','facilitator') OR p_role IS NULL THEN RAISE EXCEPTION 'invalid_staff_assignment'; END IF;
 PERFORM 1 FROM public.courses WHERE id=p_course_id FOR UPDATE;
 IF p_enabled AND NOT academy_private.trainer_eligible(p_user_id) THEN RAISE EXCEPTION 'active_trainer_required'; END IF;
 IF p_enabled THEN
  INSERT INTO public.course_staff(course_id,user_id,role,granted_by) VALUES(p_course_id,p_user_id,p_role,auth.uid())
  ON CONFLICT(course_id,user_id,role) DO UPDATE SET granted_by=auth.uid(),granted_at=now(),revoked_by=NULL,revoked_at=NULL;
 ELSE UPDATE public.course_staff SET revoked_by=auth.uid(),revoked_at=now() WHERE course_id=p_course_id AND user_id=p_user_id AND role=p_role AND revoked_at IS NULL;
 END IF;
 IF p_role='facilitator' THEN
 FOR v_run IN SELECT id FROM public.course_runs WHERE course_id=p_course_id ORDER BY id FOR UPDATE LOOP
  PERFORM academy_private.check_invitation_budget(v_run);
  PERFORM academy_private.refresh_run_meetings(v_run);
 END LOOP; END IF;
 INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(auth.uid(),'COURSE_STAFF_CHANGED',p_course_id,jsonb_build_object('user_id',p_user_id,'role',p_role,'enabled',p_enabled));
END $$;
CREATE FUNCTION public.academy_set_run_staff(p_run_id uuid,p_user_id uuid,p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_course uuid;
BEGIN
 SELECT course_id INTO v_course FROM public.course_runs WHERE id=p_run_id;
 IF NOT FOUND OR NOT public.academy_can_assign_staff(v_course) THEN RAISE EXCEPTION 'course_owner_or_admin_required' USING ERRCODE='42501'; END IF;
 IF p_enabled IS NULL THEN RAISE EXCEPTION 'invalid_staff_assignment'; END IF;
 PERFORM 1 FROM public.course_runs WHERE id=p_run_id FOR UPDATE;
 IF p_enabled AND NOT academy_private.trainer_eligible(p_user_id) THEN RAISE EXCEPTION 'active_trainer_required'; END IF;
 IF p_enabled THEN
  INSERT INTO public.course_run_staff(run_id,user_id,granted_by) VALUES(p_run_id,p_user_id,auth.uid())
  ON CONFLICT(run_id,user_id) DO UPDATE SET granted_by=auth.uid(),granted_at=now(),revoked_by=NULL,revoked_at=NULL;
 ELSE UPDATE public.course_run_staff SET revoked_by=auth.uid(),revoked_at=now() WHERE run_id=p_run_id AND user_id=p_user_id AND revoked_at IS NULL;
 END IF;
 PERFORM academy_private.check_invitation_budget(p_run_id);
 PERFORM academy_private.refresh_run_meetings(p_run_id);
 INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(auth.uid(),'RUN_STAFF_CHANGED',v_course,jsonb_build_object('run_id',p_run_id,'user_id',p_user_id,'enabled',p_enabled));
END $$;
CREATE FUNCTION public.academy_get_staff(p_course_id uuid,p_run_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_members jsonb;
BEGIN
 IF NOT public.academy_can_assign_staff(p_course_id) THEN RAISE EXCEPTION 'course_owner_or_admin_required' USING ERRCODE='42501'; END IF;
 IF p_run_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.course_runs WHERE id=p_run_id AND course_id=p_course_id) THEN RAISE EXCEPTION 'run_course_mismatch'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('userId',s.user_id,'fullName',p.full_name,'email',p.email,'role',s.role,'eligible',academy_private.trainer_eligible(p.id)) ORDER BY p.full_name,p.email),'[]') INTO v_members FROM (
 SELECT user_id,role FROM public.course_staff WHERE course_id=p_course_id AND revoked_at IS NULL AND p_run_id IS NULL
 UNION ALL SELECT user_id,'facilitator' FROM public.course_run_staff WHERE run_id=p_run_id AND revoked_at IS NULL) s JOIN public.profiles p ON p.id=s.user_id;
 RETURN jsonb_build_object('members',v_members,'candidates',COALESCE((SELECT jsonb_agg(jsonb_build_object('userId',p.id,'fullName',p.full_name,'email',p.email) ORDER BY p.full_name,p.email)
 FROM public.profiles p WHERE academy_private.trainer_eligible(p.id) AND p.id<>(SELECT author_id FROM public.courses WHERE id=p_course_id)),'[]'));
END $$;

ALTER TABLE public.courses ADD COLUMN legacy_review_required boolean NOT NULL DEFAULT false;
-- Broad legacy write policies cannot establish an independent approval history.
UPDATE public.courses SET legacy_review_required=true WHERE published_version_id IS NOT NULL;
CREATE TABLE public.academy_legacy_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),course_id uuid NOT NULL REFERENCES public.courses(id),version_id uuid NOT NULL REFERENCES public.course_versions(id),
 reviewed_by uuid NOT NULL REFERENCES public.profiles(id),reviewed_at timestamptz NOT NULL DEFAULT now(),approved boolean NOT NULL,note text
);
CREATE TABLE academy_private.version_contributors (
 version_id uuid NOT NULL REFERENCES public.course_versions(id),user_id uuid NOT NULL REFERENCES public.profiles(id),PRIMARY KEY(version_id,user_id)
);
INSERT INTO academy_private.version_contributors SELECT id,created_by FROM public.course_versions WHERE created_by IS NOT NULL ON CONFLICT DO NOTHING;
ALTER TABLE academy_private.version_contributors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON academy_private.version_contributors FROM PUBLIC,anon,authenticated;
ALTER TABLE public.academy_legacy_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_legacy_reviews FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.academy_legacy_reviews TO authenticated;
GRANT ALL ON public.academy_legacy_reviews TO service_role;
CREATE POLICY academy_legacy_reviews_read ON public.academy_legacy_reviews FOR SELECT TO authenticated USING(public.academy_can_access() AND public.academy_can_assign_staff(course_id));
CREATE FUNCTION public.academy_can_review_version(p_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.academy_can_access() AND public.is_admin() AND EXISTS(SELECT 1 FROM public.course_versions v JOIN public.courses c ON c.id=v.course_id
 WHERE v.id=p_version_id AND c.author_id<>auth.uid() AND NOT EXISTS(SELECT 1 FROM academy_private.version_contributors x WHERE x.version_id=v.id AND x.user_id=auth.uid()));
$$;
CREATE FUNCTION academy_private.track_contributor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RETURN COALESCE(NEW,OLD); END IF;
 IF TG_TABLE_NAME='course_versions' THEN v_id:=NEW.id;
 ELSIF TG_TABLE_NAME='course_quiz_options' THEN SELECT version_id INTO v_id FROM public.course_quiz_questions WHERE id=COALESCE(NEW.question_id,OLD.question_id);
 ELSE v_id:=COALESCE(NEW.version_id,OLD.version_id); END IF;
 IF v_id IS NOT NULL THEN INSERT INTO academy_private.version_contributors(version_id,user_id) VALUES(v_id,auth.uid()) ON CONFLICT DO NOTHING; END IF;
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER academy_track_version_contributor AFTER INSERT OR UPDATE OF metadata,completion_rules ON public.course_versions FOR EACH ROW EXECUTE FUNCTION academy_private.track_contributor();
CREATE TRIGGER academy_track_lesson_contributor AFTER INSERT OR UPDATE OR DELETE ON public.course_lessons FOR EACH ROW EXECUTE FUNCTION academy_private.track_contributor();
CREATE TRIGGER academy_track_quiz_contributor AFTER INSERT OR UPDATE OR DELETE ON public.course_quiz_questions FOR EACH ROW EXECUTE FUNCTION academy_private.track_contributor();
CREATE TRIGGER academy_track_option_contributor AFTER INSERT OR UPDATE OR DELETE ON public.course_quiz_options FOR EACH ROW EXECUTE FUNCTION academy_private.track_contributor();
CREATE FUNCTION academy_private.independent_review_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.status='pending_review' AND NEW.status IN ('published','rejected') AND NOT public.academy_can_review_version(OLD.id) THEN RAISE EXCEPTION 'independent_admin_review_required' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_independent_review BEFORE UPDATE OF status ON public.course_versions FOR EACH ROW EXECUTE FUNCTION academy_private.independent_review_guard();
CREATE FUNCTION academy_private.clear_legacy_hold()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='published' AND OLD.status<>'published' THEN UPDATE public.courses SET legacy_review_required=false WHERE id=NEW.course_id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_clear_legacy_hold AFTER UPDATE OF status ON public.course_versions FOR EACH ROW EXECUTE FUNCTION academy_private.clear_legacy_hold();
CREATE FUNCTION public.academy_review_legacy_course(p_course_id uuid,p_approve boolean,p_reason text DEFAULT NULL,p_version_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses;
BEGIN
 SELECT * INTO c FROM public.courses WHERE id=p_course_id FOR UPDATE;
 IF NOT FOUND OR NOT public.academy_can_review_version(c.published_version_id) THEN RAISE EXCEPTION 'independent_admin_review_required' USING ERRCODE='42501'; END IF;
 IF p_version_id IS DISTINCT FROM c.published_version_id THEN RAISE EXCEPTION 'review_version_changed'; END IF;
 IF NOT c.legacy_review_required THEN RETURN; END IF;
 IF p_approve IS NULL OR (NOT p_approve AND COALESCE(length(btrim(p_reason)),0)<5) OR length(p_reason)>3000 THEN RAISE EXCEPTION 'review_reason_required'; END IF;
 INSERT INTO public.academy_legacy_reviews(course_id,version_id,reviewed_by,approved,note) VALUES(c.id,c.published_version_id,auth.uid(),p_approve,p_reason);
 IF p_approve THEN UPDATE public.courses SET legacy_review_required=false WHERE id=c.id; END IF;
 INSERT INTO public.academy_audit_events(actor_id,action,course_id,details) VALUES(auth.uid(),'LEGACY_COURSE_REVIEWED',c.id,jsonb_build_object('version_id',c.published_version_id,'approved',p_approve,'reason',p_reason));
END $$;

CREATE FUNCTION public.academy_can_preview_version(p_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.academy_can_access() AND EXISTS(SELECT 1 FROM public.course_versions v WHERE v.id=p_version_id
 AND (public.academy_can_manage_course(v.course_id) OR (v.status='published' AND (public.academy_can_lead_course(v.course_id)
 OR EXISTS(SELECT 1 FROM public.course_runs r WHERE r.version_id=v.id AND public.academy_can_manage_run(r.id))))));
$$;
CREATE FUNCTION public.academy_teaching_versions(p_course_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',v.id,'versionNumber',v.version_number,'title',v.metadata->>'title','status',v.status) ORDER BY v.version_number DESC),'[]')
 FROM public.course_versions v WHERE v.course_id=p_course_id AND public.academy_can_preview_version(v.id);
$$;

CREATE FUNCTION public.academy_can_monitor_enrollment(p_enrollment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.academy_can_access() AND EXISTS(SELECT 1 FROM public.course_enrollments e WHERE e.id=p_enrollment_id
 AND (e.user_id=auth.uid() OR CASE WHEN e.run_id IS NULL THEN public.academy_can_lead_course(e.course_id) ELSE public.academy_can_manage_run(e.run_id) END));
$$;
CREATE FUNCTION public.academy_has_assigned_runs(p_course_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.academy_is_trainer() AND EXISTS(SELECT 1 FROM public.course_runs r WHERE r.course_id=p_course_id AND public.academy_can_manage_run(r.id));
$$;
DROP POLICY academy_courses_read ON public.courses;
CREATE POLICY academy_courses_read ON public.courses FOR SELECT TO authenticated USING(
 public.academy_can_access() AND (public.academy_can_manage_course(id) OR public.academy_can_lead_course(id)
 OR public.academy_has_assigned_runs(id)
 OR (status='published' AND published_version_id IS NOT NULL AND NOT legacy_review_required)
 OR EXISTS(SELECT 1 FROM public.course_enrollments e WHERE e.course_id=courses.id AND e.user_id=auth.uid() AND public.academy_enrollment_has_access(e.id))));
DROP POLICY academy_enrollments_read ON public.course_enrollments;
CREATE POLICY academy_enrollments_read ON public.course_enrollments FOR SELECT TO authenticated USING(public.academy_can_monitor_enrollment(id));
DROP POLICY academy_attempts_read ON public.course_quiz_attempts;
CREATE POLICY academy_attempts_read ON public.course_quiz_attempts FOR SELECT TO authenticated USING(public.academy_can_monitor_enrollment(enrollment_id));
DROP POLICY academy_completions_read ON public.course_completions;
CREATE POLICY academy_completions_read ON public.course_completions FOR SELECT TO authenticated USING(public.academy_can_monitor_enrollment(enrollment_id));
DROP POLICY academy_attendance_read ON public.session_attendance;
CREATE POLICY academy_attendance_read ON public.session_attendance FOR SELECT TO authenticated USING(public.academy_can_monitor_enrollment(enrollment_id));
DROP POLICY academy_runs_read ON public.course_runs;
CREATE POLICY academy_runs_read ON public.course_runs FOR SELECT TO authenticated USING(public.academy_can_access() AND(
 public.academy_can_manage_run(id) OR public.academy_is_run_registered(id)
 OR (status='published' AND EXISTS(SELECT 1 FROM public.courses c WHERE c.id=course_id AND c.status='published' AND NOT c.legacy_review_required))));

CREATE FUNCTION public.academy_teaching_courses()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT COALESCE(jsonb_agg(to_jsonb(c)||jsonb_build_object('can_edit',public.academy_can_manage_course(c.id),'can_lead',public.academy_can_lead_course(c.id),
 'can_manage_assigned_runs',EXISTS(SELECT 1 FROM public.course_runs r WHERE r.course_id=c.id AND public.academy_can_manage_run(r.id))) ORDER BY c.updated_at DESC),'[]')
 FROM public.courses c WHERE public.academy_is_trainer() AND (c.author_id=auth.uid()
 OR EXISTS(SELECT 1 FROM public.course_staff s WHERE s.course_id=c.id AND s.user_id=auth.uid() AND s.revoked_at IS NULL)
 OR EXISTS(SELECT 1 FROM public.course_runs r JOIN public.course_run_staff s ON s.run_id=r.id WHERE r.course_id=c.id AND s.user_id=auth.uid() AND s.revoked_at IS NULL));
$$;

-- Validate the entire proposed graph inside a shared transaction lock, so two
-- concurrent edits cannot both introduce a reciprocal prerequisite.
CREATE FUNCTION academy_private.guard_prerequisites()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ids uuid[];
BEGIN
 IF TG_OP='UPDATE' AND NEW.metadata->'prerequisite_course_ids' IS NOT DISTINCT FROM OLD.metadata->'prerequisite_course_ids' THEN RETURN NEW; END IF;
 IF jsonb_typeof(NEW.metadata->'prerequisite_course_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_prerequisites'; END IF;
 SELECT ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(NEW.metadata->'prerequisite_course_ids')) INTO ids;
 IF cardinality(ids)>50 OR cardinality(ids)<>(SELECT count(DISTINCT id) FROM unnest(ids) id) OR NEW.course_id=ANY(ids) THEN RAISE EXCEPTION 'invalid_prerequisites'; END IF;
 -- Cloning preserves the already-approved snapshot even if a prerequisite was archived later.
 IF TG_OP='INSERT' AND NEW.version_number>1 AND EXISTS(SELECT 1 FROM public.course_versions v WHERE v.course_id=NEW.course_id AND v.status='published'
 AND v.metadata->'prerequisite_course_ids'=NEW.metadata->'prerequisite_course_ids') THEN RETURN NEW; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('academy-prerequisite-graph',0));
 IF EXISTS(SELECT 1 FROM unnest(ids) id WHERE NOT EXISTS(SELECT 1 FROM public.courses c WHERE c.id=id AND c.status='published'
 AND NOT c.legacy_review_required AND public.academy_can_read_version(c.published_version_id))) THEN RAISE EXCEPTION 'published_visible_prerequisites_required'; END IF;
 IF EXISTS(WITH RECURSIVE dependency(id) AS (
 SELECT unnest(ids) UNION SELECT p.value::uuid FROM dependency d JOIN public.courses c ON c.id=d.id
 JOIN public.course_versions v ON v.id=c.published_version_id OR v.id=c.draft_version_id
 CROSS JOIN LATERAL jsonb_array_elements_text(v.metadata->'prerequisite_course_ids') p(value)
 ) SELECT 1 FROM dependency WHERE id=NEW.course_id) THEN RAISE EXCEPTION 'prerequisite_cycle'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_prerequisite_guard BEFORE INSERT OR UPDATE OF metadata ON public.course_versions FOR EACH ROW EXECUTE FUNCTION academy_private.guard_prerequisites();

CREATE OR REPLACE FUNCTION public.academy_can_read_version(p_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT public.academy_can_access() AND EXISTS (
        SELECT 1 FROM public.course_versions v JOIN public.courses c ON c.id=v.course_id
        WHERE v.id=p_version_id AND (public.academy_can_preview_version(v.id)
            OR (c.status='published' AND NOT c.legacy_review_required AND c.published_version_id=v.id AND v.status='published')
            OR EXISTS (SELECT 1 FROM public.course_enrollments e WHERE e.version_id=v.id AND e.user_id=auth.uid() AND public.academy_enrollment_has_access(e.id)))
    );
$$;

CREATE OR REPLACE FUNCTION public.academy_can_read_material(p_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT public.academy_can_access() AND EXISTS (
        SELECT 1 FROM public.course_versions v JOIN public.courses c ON c.id=v.course_id
        WHERE v.id=p_version_id AND (public.academy_can_preview_version(v.id)
            OR EXISTS (SELECT 1 FROM public.course_enrollments e WHERE e.version_id=v.id AND e.user_id=auth.uid() AND public.academy_enrollment_has_access(e.id)))
    );
$$;

CREATE OR REPLACE FUNCTION public.academy_can_read_lesson(p_lesson_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT public.academy_can_access() AND EXISTS (
        SELECT 1 FROM public.course_lessons l JOIN public.courses c ON c.id=l.course_id
        WHERE l.id=p_lesson_id AND (public.academy_can_preview_version(l.version_id) OR EXISTS (
            SELECT 1 FROM public.course_enrollments e WHERE e.user_id=auth.uid() AND e.version_id=l.version_id AND public.academy_enrollment_has_access(e.id)
                AND (e.completed_at IS NOT NULL OR l.unlock_after_days=0 OR NOT EXISTS (
                    SELECT 1 FROM public.course_lessons previous WHERE previous.version_id=l.version_id AND previous.order_index<l.order_index)
                OR now() >= academy_private.try_timestamp(e.lesson_completion_dates->>(
                    SELECT previous.id::text FROM public.course_lessons previous WHERE previous.version_id=l.version_id
                        AND previous.order_index<l.order_index ORDER BY previous.order_index DESC LIMIT 1)) + make_interval(days=>l.unlock_after_days))
        ))
    );
$$;

CREATE OR REPLACE FUNCTION public.academy_enroll(p_course_id uuid,p_version_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c public.courses%ROWTYPE; v public.course_versions%ROWTYPE; v_id uuid;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'academy_access_required' USING ERRCODE='42501'; END IF;
    SELECT * INTO c FROM public.courses WHERE id=p_course_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'course_not_found'; END IF;
    SELECT id INTO v_id FROM public.course_enrollments WHERE user_id=auth.uid() AND course_id=c.id AND run_id IS NULL;
    IF FOUND THEN RETURN v_id; END IF;
    IF c.legacy_review_required THEN RAISE EXCEPTION 'legacy_admin_review_required'; END IF;
    IF c.status<>'published' OR c.published_version_id IS NULL
        OR (p_version_id IS NOT NULL AND p_version_id<>c.published_version_id) THEN RAISE EXCEPTION 'published_version_required'; END IF;
    SELECT * INTO v FROM public.course_versions WHERE id=c.published_version_id;
    IF v.status<>'published' THEN RAISE EXCEPTION 'published_version_required'; END IF;
    IF v.metadata->>'delivery_mode'<>'self_paced' THEN RAISE EXCEPTION 'select_course_run'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v.metadata->'prerequisite_course_ids') p(id)
        WHERE NOT EXISTS(SELECT 1 FROM public.course_completions cc WHERE cc.user_id=auth.uid() AND cc.course_id=p.id::uuid)) THEN
        RAISE EXCEPTION 'prerequisites_not_completed';
    END IF;
    INSERT INTO public.course_enrollments(user_id,course_id,version_id) VALUES(auth.uid(),c.id,v.id) RETURNING id INTO v_id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
    VALUES(auth.uid(),'COURSE_ENROLLED',c.id,jsonb_build_object('version_id',v.id,'enrollment_id',v_id));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.academy_create_run(p_input jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.course_versions; v_id uuid;
BEGIN
    IF NOT public.academy_can_lead_course((p_input->>'courseId')::uuid) THEN RAISE EXCEPTION 'Brak uprawnień do edycji szkolenia.' USING ERRCODE='42501'; END IF;
    SELECT * INTO v FROM public.course_versions WHERE id=(p_input->>'versionId')::uuid
        AND course_id=(p_input->>'courseId')::uuid AND status='published' FOR SHARE;
    IF NOT FOUND OR v.metadata->>'delivery_mode' NOT IN ('live','blended') OR NOT EXISTS(
        SELECT 1 FROM public.courses c WHERE c.id=v.course_id AND c.status='published' AND NOT c.legacy_review_required) THEN
        RAISE EXCEPTION 'Edycja wymaga zatwierdzonego szkolenia live lub mieszanego.';
    END IF;
    INSERT INTO public.course_runs(course_id,version_id,title,capacity,created_by)
        VALUES(v.course_id,v.id,btrim(p_input->>'title'),(p_input->>'capacity')::integer,auth.uid()) RETURNING id INTO v_id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_RUN_CREATED',v.course_id,jsonb_build_object('run_id',v_id,'version_id',v.id));
    RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.academy_register_run(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs; reg public.course_run_registrations; v_id uuid;
BEGIN
    IF NOT public.academy_can_access() THEN RAISE EXCEPTION 'Brak dostępu do Akademii.' USING ERRCODE='42501'; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=p_run_id FOR UPDATE;
    IF NOT FOUND OR r.status<>'published' OR NOT EXISTS(SELECT 1 FROM public.courses WHERE id=r.course_id AND status='published' AND NOT legacy_review_required) THEN
        RAISE EXCEPTION 'Edycja nie jest dostępna do zapisów.';
    END IF;
    IF NOT academy_private.user_may_register(auth.uid(),r.version_id) THEN RAISE EXCEPTION 'Najpierw ukończ wymagane szkolenia wstępne.'; END IF;
    SELECT * INTO reg FROM public.course_run_registrations WHERE run_id=r.id AND user_id=auth.uid();
    IF FOUND AND reg.status IN ('confirmed','waitlisted') THEN
        RETURN jsonb_build_object('registrationId',reg.id,'status',reg.status,'enrollmentId',reg.enrollment_id);
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=r.id AND status='scheduled')
        OR EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=r.id AND status='scheduled' AND starts_at<=now()) THEN
        RAISE EXCEPTION 'Zapisy na rozpoczętą edycję są zamknięte.';
    END IF;
    IF (SELECT count(*) FROM public.course_run_registrations WHERE run_id=r.id AND status='waitlisted')>=1000 THEN
        RAISE EXCEPTION 'Lista rezerwowa jest pełna.';
    END IF;
    INSERT INTO public.course_run_registrations(run_id,user_id,status) VALUES(r.id,auth.uid(),'waitlisted')
        ON CONFLICT(run_id,user_id) DO UPDATE SET status='waitlisted',created_at=now(),updated_at=now() RETURNING id INTO v_id;
    PERFORM academy_private.promote_run_waitlist(r.id);
    SELECT * INTO reg FROM public.course_run_registrations WHERE id=v_id;
    INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
        VALUES(auth.uid(),'ACADEMY_RUN_REGISTERED',r.course_id,jsonb_build_object('run_id',r.id,'status',reg.status));
    RETURN jsonb_build_object('registrationId',reg.id,'status',reg.status,'enrollmentId',reg.enrollment_id);
END $$;

CREATE TABLE academy_private.run_contributors(run_id uuid NOT NULL REFERENCES public.course_runs(id),user_id uuid NOT NULL REFERENCES public.profiles(id),PRIMARY KEY(run_id,user_id));
ALTER TABLE academy_private.run_contributors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON academy_private.run_contributors FROM PUBLIC,anon,authenticated;
INSERT INTO academy_private.run_contributors SELECT id,created_by FROM public.course_runs WHERE created_by IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO academy_private.run_contributors SELECT run_id,created_by FROM public.course_sessions WHERE created_by IS NOT NULL ON CONFLICT DO NOTHING;
CREATE FUNCTION public.academy_can_review_run(p_run_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.academy_can_access() AND public.is_admin() AND EXISTS(SELECT 1 FROM public.course_runs r JOIN public.courses c ON c.id=r.course_id
 WHERE r.id=p_run_id AND c.author_id<>auth.uid() AND NOT EXISTS(SELECT 1 FROM academy_private.run_contributors x WHERE x.run_id=r.id AND x.user_id=auth.uid()));
$$;
CREATE FUNCTION academy_private.track_run_contributor()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_run uuid;
BEGIN
 IF auth.uid() IS NOT NULL THEN
  IF TG_TABLE_NAME='course_runs' THEN v_run:=NEW.id; ELSE v_run:=NEW.run_id; END IF;
  INSERT INTO academy_private.run_contributors(run_id,user_id) VALUES(v_run,auth.uid()) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION academy_private.guard_run_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='published' AND OLD.status IS DISTINCT FROM NEW.status AND NOT public.academy_can_review_run(NEW.id) THEN RAISE EXCEPTION 'independent_admin_review_required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_track_run_contributor AFTER INSERT OR UPDATE OF title,capacity ON public.course_runs FOR EACH ROW EXECUTE FUNCTION academy_private.track_run_contributor();
CREATE TRIGGER academy_track_session_contributor AFTER INSERT OR UPDATE OF title,starts_at,ends_at,time_zone,meeting_mode,organizer_id,external_join_url,required ON public.course_sessions FOR EACH ROW EXECUTE FUNCTION academy_private.track_run_contributor();
CREATE TRIGGER academy_independent_run_review BEFORE UPDATE OF status ON public.course_runs FOR EACH ROW EXECUTE FUNCTION academy_private.guard_run_review();

CREATE OR REPLACE FUNCTION public.academy_list_runs(p_course_id uuid DEFAULT NULL,p_run_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT COALESCE(jsonb_agg(item ORDER BY created_at DESC),'[]') FROM (
        SELECT r.created_at,jsonb_build_object('id',r.id,'courseId',r.course_id,'versionId',r.version_id,
            'versionNumber',v.version_number,'courseTitle',v.metadata->>'title','courseSlug',c.slug,
            'title',r.title,'capacity',r.capacity,'status',r.status,
            'confirmedCount',(SELECT count(*) FROM public.course_run_registrations WHERE run_id=r.id AND status='confirmed'),
            'waitlistCount',(SELECT count(*) FROM public.course_run_registrations WHERE run_id=r.id AND status='waitlisted'),
            'canManage',public.academy_can_manage_run(r.id),'canPublish',public.academy_can_review_run(r.id),
            'myRegistration',(SELECT jsonb_build_object('id',reg.id,'status',reg.status,'enrollmentId',reg.enrollment_id,
                    'completedAt',(SELECT completed_at FROM public.course_enrollments WHERE id=reg.enrollment_id))
                FROM public.course_run_registrations reg WHERE reg.run_id=r.id AND reg.user_id=auth.uid()),
            'sessions',(SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id',s.id,'runId',s.run_id,'title',s.title,'startsAt',s.starts_at,'endsAt',s.ends_at,
                'timeZone',s.time_zone,'mode',s.meeting_mode,'required',s.required,'status',s.status,
                'syncStatus',s.sync_status,'organizerId',s.organizer_id,
                'actualStartsAt',s.actual_starts_at,'actualEndsAt',s.actual_ends_at,'attendanceWindowConfirmed',s.window_confirmed_at IS NOT NULL,
                'externalJoinUrl',CASE WHEN public.academy_can_manage_run(r.id) THEN s.external_join_url END,
                'joinUrl',CASE WHEN s.status='scheduled' AND r.status='published' AND s.sync_status='ready'
                    AND (public.academy_can_manage_run(r.id) OR public.academy_is_run_registered(r.id))
                    THEN CASE WHEN s.meeting_mode='external_link' THEN s.external_join_url ELSE i.join_url END END
                ) ORDER BY s.starts_at,s.id),'[]') FROM public.course_sessions s
                LEFT JOIN public.academy_session_integrations i ON i.session_id=s.id AND i.cancelled_at IS NULL WHERE s.run_id=r.id)
        ) item
        FROM public.course_runs r JOIN public.course_versions v ON v.id=r.version_id JOIN public.courses c ON c.id=r.course_id
        WHERE public.academy_can_access() AND (p_course_id IS NULL OR r.course_id=p_course_id) AND (p_run_id IS NULL OR r.id=p_run_id)
            AND (public.academy_can_manage_run(r.id) OR (r.status='published' AND c.status='published' AND NOT c.legacy_review_required)
                OR EXISTS(SELECT 1 FROM public.course_run_registrations reg WHERE reg.run_id=r.id AND reg.user_id=auth.uid()))
        ORDER BY r.created_at DESC LIMIT 200
    ) rows;
$$;

CREATE OR REPLACE FUNCTION academy_private.user_may_register(p_user_id uuid,p_version_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
    SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=p_user_id
        AND p.role::text IN ('consultant','admin') AND NOT COALESCE(p.is_external,false)
        AND COALESCE(p.employment_status::text,'active')<>'exited')
    AND EXISTS(SELECT 1 FROM public.course_versions v JOIN public.courses c ON c.id=v.course_id WHERE v.id=p_version_id AND NOT c.legacy_review_required)
    AND NOT EXISTS(SELECT 1 FROM public.course_versions v,
        jsonb_array_elements_text(COALESCE(v.metadata->'prerequisite_course_ids','[]')) prerequisite(value)
        WHERE v.id=p_version_id AND NOT EXISTS(SELECT 1 FROM public.course_completions c
            WHERE c.user_id=p_user_id AND c.course_id=prerequisite.value::uuid));
$$;


CREATE FUNCTION public.academy_catalog_instructors()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH visible AS (SELECT id,author_id FROM public.courses WHERE public.academy_can_access()
 AND status='published' AND published_version_id IS NOT NULL AND NOT legacy_review_required),
 instructors AS (
 SELECT id AS course_id,author_id AS user_id FROM visible
 UNION SELECT c.id,s.user_id FROM visible c JOIN public.course_staff s ON s.course_id=c.id
 WHERE s.role='facilitator' AND s.revoked_at IS NULL AND academy_private.trainer_eligible(s.user_id)
 UNION SELECT c.id,s.user_id FROM visible c JOIN public.course_runs r ON r.course_id=c.id
 JOIN public.course_run_staff s ON s.run_id=r.id WHERE r.status='published' AND s.revoked_at IS NULL
 AND academy_private.trainer_eligible(s.user_id)
 ) SELECT COALESCE(jsonb_agg(item ORDER BY item->>'name'),'[]') FROM (
 SELECT jsonb_build_object('id',p.id,'name',COALESCE(p.full_name,'Prowadzący szkolenie'),'courseIds',jsonb_agg(i.course_id ORDER BY i.course_id)) item
 FROM instructors i JOIN public.profiles p ON p.id=i.user_id GROUP BY p.id,p.full_name) items;
$$;
CREATE FUNCTION academy_private.run_instructors(p_run_id uuid,p_course_id uuid)
RETURNS TABLE(user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT author_id FROM public.courses WHERE id=p_course_id
 UNION SELECT s.user_id FROM public.course_staff s WHERE s.course_id=p_course_id AND s.role='facilitator'
 AND s.revoked_at IS NULL AND academy_private.trainer_eligible(s.user_id)
 UNION SELECT s.user_id FROM public.course_run_staff s WHERE s.run_id=p_run_id AND s.revoked_at IS NULL AND academy_private.trainer_eligible(s.user_id);
$$;
CREATE FUNCTION academy_private.check_invitation_budget(p_run_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.course_runs;
BEGIN
 SELECT * INTO r FROM public.course_runs WHERE id=p_run_id;
 IF r.capacity+(SELECT count(*) FROM academy_private.run_instructors(r.id,r.course_id))>500
 AND EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=r.id AND meeting_mode='managed_teams' AND status='scheduled')
 THEN RAISE EXCEPTION 'Teams: limit 500 obejmuje miejsca uczestników i wszystkich prowadzących. Zmniejsz liczbę miejsc.'; END IF;
END $$;
CREATE FUNCTION academy_private.guard_invitation_budget()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_count integer; v_capacity integer; v_course uuid;
BEGIN
 IF TG_TABLE_NAME='course_runs' THEN
  IF NEW.status='published' AND EXISTS(SELECT 1 FROM public.courses WHERE id=NEW.course_id AND legacy_review_required) THEN RAISE EXCEPTION 'legacy_admin_review_required'; END IF;
  IF EXISTS(SELECT 1 FROM public.course_sessions WHERE run_id=NEW.id AND meeting_mode='managed_teams' AND status='scheduled') THEN
   SELECT count(*) INTO v_count FROM academy_private.run_instructors(NEW.id,NEW.course_id);
   v_capacity:=NEW.capacity;
  END IF;
 ELSE
  IF NEW.meeting_mode='managed_teams' AND NEW.status='scheduled' THEN
   SELECT capacity,course_id INTO v_capacity,v_course FROM public.course_runs WHERE id=NEW.run_id FOR UPDATE;
   SELECT count(*) INTO v_count FROM academy_private.run_instructors(NEW.run_id,v_course);
  END IF;
 END IF;
 IF v_capacity+v_count>500 THEN RAISE EXCEPTION 'Teams: limit 500 obejmuje miejsca uczestników i wszystkich prowadzących. Zmniejsz liczbę miejsc.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_run_invitation_budget BEFORE INSERT OR UPDATE OF capacity,status ON public.course_runs FOR EACH ROW EXECUTE FUNCTION academy_private.guard_invitation_budget();
CREATE TRIGGER academy_session_invitation_budget BEFORE INSERT OR UPDATE OF meeting_mode,status ON public.course_sessions FOR EACH ROW EXECUTE FUNCTION academy_private.guard_invitation_budget();

CREATE OR REPLACE FUNCTION public.academy_job_context(p_job_id uuid,p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.academy_integration_jobs; s public.course_sessions; r public.course_runs; o public.academy_organizers;
    i public.academy_session_integrations; v public.course_versions; v_attendees jsonb; v_participants jsonb;
BEGIN
    IF NOT public.academy_job_lease_current(p_job_id,p_lease_token) THEN RAISE EXCEPTION 'lease_lost'; END IF;
    SELECT * INTO j FROM public.academy_integration_jobs WHERE id=p_job_id;
    SELECT * INTO s FROM public.course_sessions WHERE id=j.session_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO r FROM public.course_runs WHERE id=s.run_id;
    SELECT * INTO v FROM public.course_versions WHERE id=r.version_id;
    SELECT * INTO o FROM public.academy_organizers WHERE id=s.organizer_id;
    SELECT * INTO i FROM public.academy_session_integrations WHERE session_id=s.id;
    -- Trusted addresses only: verified auth address and explicit administrator-verified M365 aliases.
    SELECT COALESCE(jsonb_agg(jsonb_build_object('email',mail.email,'name',mail.full_name)),'[]') INTO v_attendees FROM (
        SELECT DISTINCT u.email,p.full_name FROM public.course_run_registrations reg
            JOIN public.profiles p ON p.id=reg.user_id JOIN auth.users u ON u.id=p.id
            WHERE reg.run_id=r.id AND reg.status='confirmed' AND u.email_confirmed_at IS NOT NULL
            AND u.email IS NOT NULL AND p.id IS DISTINCT FROM o.profile_id
        UNION SELECT u.email,p.full_name FROM academy_private.run_instructors(r.id,r.course_id) staff JOIN public.profiles p ON p.id=staff.user_id
            JOIN auth.users u ON u.id=p.id WHERE u.email_confirmed_at IS NOT NULL
            AND u.email IS NOT NULL AND p.id IS DISTINCT FROM o.profile_id
    ) mail;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('profileId',p.id,
        'identities',(SELECT COALESCE(jsonb_agg(jsonb_build_object('tenantId',x.tenant_id,'objectId',x.object_id)),'[]') FROM public.academy_m365_identities x WHERE x.user_id=p.id),
        'verifiedEmails',(SELECT COALESCE(jsonb_agg(email),'[]') FROM (
            SELECT u.email WHERE u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL
            UNION SELECT x.verified_email FROM public.academy_m365_identities x WHERE x.user_id=p.id AND x.verified_email IS NOT NULL) verified)
        )),'[]') INTO v_participants FROM public.course_run_registrations reg JOIN public.profiles p ON p.id=reg.user_id
        JOIN auth.users u ON u.id=p.id WHERE reg.run_id=r.id AND reg.status='confirmed';
    RETURN jsonb_build_object('id',s.id,'revision',s.revision,'approved',v.status='published',
        'published',r.status='published','cancelled',s.status='cancelled' OR r.status='cancelled',
        'mode',s.meeting_mode,'externalJoinUrl',s.external_join_url,'organizerEnabled',COALESCE(o.enabled,false)
            AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=o.profile_id AND NOT COALESCE(p.is_external,false)
                AND COALESCE(p.employment_status::text,'active')<>'exited'),
        'meeting',CASE WHEN i.session_id IS NULL THEN NULL ELSE jsonb_build_object('eventId',i.event_id,'joinUrl',i.join_url,
            'transactionId',i.transaction_id,'organizerId',i.organizer_object_id) END,
        'onlineMeetingId',i.online_meeting_id,'attendanceWindowConfirmed',s.window_confirmed_at IS NOT NULL,
        'input',jsonb_build_object('sessionId',s.id,'organizer',jsonb_build_object('tenantId',COALESCE(o.tenant_id,'00000000-0000-0000-0000-000000000000'::uuid),
            'userId',COALESCE(o.object_id,'00000000-0000-0000-0000-000000000000'::uuid)),
            'subject',s.title,'startDateTime',s.starts_at,'endDateTime',s.ends_at,'timeZone',s.time_zone,
            'descriptionText','Szkolenie w Akademii Compass. Materiały i zasady ukończenia znajdziesz w swoim panelu szkolenia.', 'attendees',v_attendees),
        'attendanceWindow',jsonb_build_object('start',COALESCE(s.actual_starts_at,s.starts_at),'end',COALESCE(s.actual_ends_at,s.ends_at)),
        'attendanceThresholdPercent',(v.completion_rules->>'attendance_percent')::integer,'participants',v_participants);
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('academy_can_edit_course_as','academy_can_lead_course_as','academy_can_lead_run_as','academy_can_lead_course','academy_can_assign_staff','academy_set_course_staff','academy_set_run_staff','academy_get_staff','academy_can_review_version','academy_review_legacy_course','academy_can_preview_version','academy_can_monitor_enrollment','academy_teaching_courses','academy_has_assigned_runs','academy_catalog_instructors','academy_can_review_run','academy_teaching_versions') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
 IF f.proname NOT LIKE '%_as' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA academy_private FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
