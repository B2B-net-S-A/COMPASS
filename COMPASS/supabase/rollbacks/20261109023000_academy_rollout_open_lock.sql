-- Cofnięcie 20261109023000_academy_rollout_open_lock.sql: przywraca tryb open i limit 1000.
-- Działa tak samo jak zdjęcie blokady, więc stosuje je wyłącznie właściciel.
BEGIN;

ALTER TABLE public.academy_rollout_settings DROP CONSTRAINT academy_rollout_settings_pilot_limit;
ALTER TABLE public.academy_rollout_settings DROP CONSTRAINT academy_rollout_settings_mode_check;
ALTER TABLE public.academy_rollout_settings ADD CONSTRAINT academy_rollout_settings_mode_check CHECK (mode IN ('closed','pilot','open'));

CREATE OR REPLACE FUNCTION public.academy_set_rollout(p_mode text, p_user_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
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
END $function$;

DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.academy_rollout_settings'::regclass AND conname = 'academy_rollout_settings_pilot_limit') THEN
  RAISE EXCEPTION 'academy_rollout: limit pilota nadal istnieje';
 END IF;
 IF pg_get_functiondef('public.academy_set_rollout(text,uuid[])'::regprocedure) LIKE '%academy_open_locked%' THEN
  RAISE EXCEPTION 'academy_rollout: funkcja nadal z blokadą';
 END IF;
END $$;

COMMIT;
