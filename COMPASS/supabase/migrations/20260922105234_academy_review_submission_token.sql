-- A version may be rejected and edited; each new review submission needs a new identity.
BEGIN;
ALTER TABLE public.course_versions ADD COLUMN submission_id uuid;
UPDATE public.course_versions SET submission_id=gen_random_uuid() WHERE status='pending_review';
CREATE UNIQUE INDEX academy_submission_identity ON public.course_versions(submission_id) WHERE submission_id IS NOT NULL;

CREATE FUNCTION academy_private.assign_review_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='pending_review' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'pending_review') THEN
  NEW.submission_id:=gen_random_uuid();
  INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
  VALUES(auth.uid(),'COURSE_REVIEW_SUBMITTED',NEW.course_id,jsonb_build_object('version_id',NEW.id,'submission_id',NEW.submission_id));
 ELSIF TG_OP='UPDATE' THEN
  -- Token cannot be changed separately from the guarded submission transition.
  NEW.submission_id:=OLD.submission_id;
 ELSE NEW.submission_id:=NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER academy_review_submission_identity BEFORE INSERT OR UPDATE ON public.course_versions
 FOR EACH ROW EXECUTE FUNCTION academy_private.assign_review_submission();
REVOKE ALL ON FUNCTION academy_private.assign_review_submission() FROM PUBLIC,anon,authenticated;

-- Keep the existing transition/award implementation as an internal core only.
-- Neither the original three arguments nor its two-argument default may bypass the token.
REVOKE ALL ON FUNCTION public.academy_review_course(uuid,boolean,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.academy_review_course(p_version_id uuid,p_approve boolean,p_reason text,p_submission_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v public.course_versions; v_course uuid; v_result jsonb;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
 SELECT course_id INTO v_course FROM public.course_versions WHERE id=p_version_id;
 PERFORM 1 FROM public.courses WHERE id=v_course FOR UPDATE;
 SELECT * INTO v FROM public.course_versions WHERE id=p_version_id FOR UPDATE;
 IF NOT FOUND OR p_submission_id IS NULL OR v.submission_id IS DISTINCT FROM p_submission_id THEN
  RAISE EXCEPTION 'review_submission_changed';
 END IF;
 -- Same locks remain held while the legacy core validates status, independence and awards.
 v_result:=public.academy_review_course(p_version_id,p_approve,p_reason);
 IF v.status='pending_review' THEN
  INSERT INTO public.academy_audit_events(actor_id,action,course_id,details)
  VALUES(auth.uid(),'COURSE_REVIEW_DECIDED',v.course_id,jsonb_build_object(
   'version_id',v.id,'submission_id',p_submission_id,'approved',p_approve));
 END IF;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.academy_review_course(uuid,boolean,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.academy_review_course(uuid,boolean,text,uuid) TO authenticated;
COMMIT;
