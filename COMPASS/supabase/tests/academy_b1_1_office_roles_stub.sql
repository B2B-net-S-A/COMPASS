-- Minimalny schemat dla smoke B1.1 na lokalnym postgres:17.
-- Definicje funkcji odpowiadają produkcji z 2026-11-09, sprzed migracji B1.1.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA academy_private;
GRANT USAGE ON SCHEMA public, auth, academy_private TO authenticated;

CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub','')::uuid
$$;

CREATE TABLE public.profiles (
    id uuid PRIMARY KEY, role text NOT NULL, is_external boolean DEFAULT false, employment_status text DEFAULT 'active'
);
CREATE TABLE public.academy_rollout_settings (
    singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
    mode text NOT NULL DEFAULT 'closed' CHECK(mode IN ('closed','pilot','open')),
    pilot_user_ids uuid[] NOT NULL DEFAULT '{}',
    updated_by uuid, updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.academy_rollout_settings DEFAULT VALUES;
CREATE TABLE public.academy_user_capabilities (
    user_id uuid PRIMARY KEY, can_train boolean, granted_by uuid, granted_at timestamptz, revoked_by uuid, revoked_at timestamptz
);
CREATE TABLE public.academy_audit_events (actor_id uuid, action text, details jsonb);

CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin')
$$;
CREATE FUNCTION public.academy_is_global_editor(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p_user_id IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
  WHERE p.id=p_user_id AND p.role::text IN ('admin','talent_community')
   AND NOT COALESCE(p.is_external,false)
   AND COALESCE(p.employment_status::text,'active')<>'exited'
 );
$$;
CREATE FUNCTION academy_private.rollout_allows_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.academy_is_global_editor(p_user_id) OR EXISTS (
  SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
  CROSS JOIN public.academy_rollout_settings s WHERE p.id=p_user_id
   AND p.role::text='consultant' AND NOT COALESCE(p.is_external,false)
   AND COALESCE(p.employment_status::text,'active')<>'exited'
   AND (s.mode='open' OR (s.mode='pilot' AND p.id=ANY(s.pilot_user_ids)))
 );
$$;
CREATE FUNCTION public.academy_can_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL AND academy_private.rollout_allows_user(auth.uid());
$$;
CREATE FUNCTION public.academy_rollout_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('mode',s.mode,'allowed',public.academy_can_access(),
  'isPilot',s.mode='pilot' AND public.academy_can_access() AND NOT public.is_admin())
 FROM public.academy_rollout_settings s;
$$;
CREATE FUNCTION academy_private.trainer_eligible(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT academy_private.rollout_allows_user(p_user_id) AND (
  public.academy_is_global_editor(p_user_id) OR EXISTS (
   SELECT 1 FROM public.profiles p JOIN public.academy_user_capabilities g ON g.user_id=p.id
   WHERE p.id=p_user_id AND p.role::text='consultant' AND g.can_train AND g.revoked_at IS NULL
  )
 );
$$;
CREATE FUNCTION academy_private.refresh_invites_after_rollout_change()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
CREATE FUNCTION public.academy_set_trainer(p_user_id uuid, p_enabled boolean)
RETURNS void LANGUAGE plpgsql AS $$ BEGIN NULL; END $$;
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
 END IF;
 RETURN public.academy_rollout_access();
END $$;

INSERT INTO auth.users(id) SELECT ('00000000-0000-0000-0000-00000000000'||n)::uuid FROM generate_series(1,8) n;
INSERT INTO public.profiles(id, role, is_external, employment_status) VALUES
    ('00000000-0000-0000-0000-000000000001','admin',false,'active'),
    ('00000000-0000-0000-0000-000000000002','talent_community',false,'active'),
    ('00000000-0000-0000-0000-000000000003','consultant',false,'active'),
    ('00000000-0000-0000-0000-000000000004','internal',false,'active'),
    ('00000000-0000-0000-0000-000000000005','manager',false,'active'),
    ('00000000-0000-0000-0000-000000000006','finanse',false,'active'),
    ('00000000-0000-0000-0000-000000000007','internal',false,'exited'),
    ('00000000-0000-0000-0000-000000000008','internal',true,'active');
