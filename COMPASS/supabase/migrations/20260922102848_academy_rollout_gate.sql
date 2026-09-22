-- One database policy controls both direct API access and the application shell.
BEGIN;
CREATE TABLE public.academy_rollout_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 mode text NOT NULL DEFAULT 'closed' CHECK(mode IN ('closed','pilot','open')),
 pilot_user_ids uuid[] NOT NULL DEFAULT '{}',
 updated_by uuid REFERENCES public.profiles(id),updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.academy_rollout_settings DEFAULT VALUES;
ALTER TABLE public.academy_rollout_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.academy_rollout_settings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.academy_rollout_settings TO authenticated;
GRANT ALL ON public.academy_rollout_settings TO service_role;
CREATE FUNCTION academy_private.rollout_allows_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
  CROSS JOIN public.academy_rollout_settings s WHERE p.id=p_user_id
  AND p.role::text IN ('consultant','admin') AND NOT COALESCE(p.is_external,false)
  AND COALESCE(p.employment_status::text,'active')<>'exited'
  AND (p.role::text='admin' OR s.mode='open' OR (s.mode='pilot' AND p.id=ANY(s.pilot_user_ids))));
$$;
CREATE OR REPLACE FUNCTION public.academy_can_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND academy_private.rollout_allows_user(auth.uid());
$$;
CREATE POLICY academy_rollout_admin_read ON public.academy_rollout_settings FOR SELECT TO authenticated
 USING(public.academy_can_access() AND public.is_admin());
CREATE FUNCTION public.academy_rollout_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('mode',s.mode,'allowed',public.academy_can_access(),
  'isPilot',s.mode='pilot' AND public.academy_can_access() AND NOT public.is_admin())
 FROM public.academy_rollout_settings s;
$$;
CREATE FUNCTION public.academy_set_rollout(p_mode text,p_user_ids uuid[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_users uuid[]; v_old public.academy_rollout_settings;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('closed','pilot','open') OR p_user_ids IS NULL OR cardinality(p_user_ids)>1000
  OR array_position(p_user_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'invalid_rollout_settings'; END IF;
 SELECT COALESCE(array_agg(DISTINCT id ORDER BY id),'{}') INTO v_users FROM unnest(p_user_ids) id;
 IF EXISTS(SELECT 1 FROM unnest(v_users) candidate(uid) WHERE NOT EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE p.id=candidate.uid AND p.role::text IN ('consultant','admin') AND NOT COALESCE(p.is_external,false)
  AND COALESCE(p.employment_status::text,'active')<>'exited')) THEN RAISE EXCEPTION 'pilot_requires_active_academy_accounts'; END IF;
 IF p_mode='pilot' AND cardinality(v_users)=0 THEN RAISE EXCEPTION 'pilot_requires_accounts'; END IF;
 SELECT * INTO v_old FROM public.academy_rollout_settings WHERE singleton FOR UPDATE;
 IF v_old.mode IS DISTINCT FROM p_mode OR v_old.pilot_user_ids IS DISTINCT FROM v_users THEN
  UPDATE public.academy_rollout_settings SET mode=p_mode,pilot_user_ids=v_users,updated_by=auth.uid(),updated_at=now() WHERE singleton;
  INSERT INTO public.academy_audit_events(actor_id,action,details) VALUES(auth.uid(),'ACADEMY_ROLLOUT_CHANGED',
   jsonb_build_object('previous_mode',v_old.mode,'mode',p_mode,'previous_pilot_user_ids',v_old.pilot_user_ids,'pilot_user_ids',v_users));
 END IF;
 RETURN public.academy_rollout_access();
END $$;
-- Service operations recheck the actual uploader/facilitator, including rollout membership.
CREATE OR REPLACE FUNCTION academy_private.trainer_eligible(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT academy_private.rollout_allows_user(p_user_id) AND EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=p_user_id
  AND (p.role::text='admin' OR EXISTS(SELECT 1 FROM public.academy_user_capabilities g
   WHERE g.user_id=p.id AND g.can_train AND g.revoked_at IS NULL)));
$$;
CREATE OR REPLACE FUNCTION academy_private.user_may_register(p_user_id uuid,p_version_id uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('academy-eligibility:'||p_user_id::text,0));
 RETURN academy_private.rollout_allows_user(p_user_id)
  AND EXISTS(SELECT 1 FROM public.course_versions v JOIN public.courses c ON c.id=v.course_id WHERE v.id=p_version_id AND NOT c.legacy_review_required)
  AND NOT EXISTS(SELECT 1 FROM public.course_versions v,
   jsonb_array_elements_text(COALESCE(v.metadata->'prerequisite_course_ids','[]')) prerequisite(value)
   WHERE v.id=p_version_id AND NOT EXISTS(SELECT 1 FROM public.course_completions c
    WHERE c.user_id=p_user_id AND c.course_id=prerequisite.value::uuid AND c.revoked_at IS NULL));
END $$;
REVOKE ALL ON FUNCTION academy_private.rollout_allows_user(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.academy_rollout_access(),public.academy_set_rollout(text,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.academy_rollout_access(),public.academy_set_rollout(text,uuid[]) TO authenticated;
COMMIT;
