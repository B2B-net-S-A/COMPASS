-- B0.4: tryb open Akademii zablokowany w bazie, także dla admina, lista pilota do 20 kont.
-- Zdjęcie blokady to osobna migracja stosowana przez właściciela na bramce startu.
-- Definicja academy_set_rollout wyjściowo zgodna z produkcją (odczyt 2026-11-09).
BEGIN;

DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.academy_rollout_settings WHERE mode NOT IN ('closed','pilot')) THEN
  RAISE EXCEPTION 'academy_rollout: tryb inny niż closed lub pilot, najpierw zamknij Akademię';
 END IF;
 IF EXISTS (SELECT 1 FROM public.academy_rollout_settings WHERE cardinality(pilot_user_ids) > 20) THEN
  RAISE EXCEPTION 'academy_rollout: lista pilota ponad 20 kont, najpierw ją skróć';
 END IF;
END $$;

ALTER TABLE public.academy_rollout_settings DROP CONSTRAINT academy_rollout_settings_mode_check;
ALTER TABLE public.academy_rollout_settings ADD CONSTRAINT academy_rollout_settings_mode_check CHECK (mode IN ('closed','pilot'));
ALTER TABLE public.academy_rollout_settings ADD CONSTRAINT academy_rollout_settings_pilot_limit CHECK (cardinality(pilot_user_ids) <= 20);

CREATE OR REPLACE FUNCTION public.academy_set_rollout(p_mode text, p_user_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_users uuid[]; v_old public.academy_rollout_settings;
BEGIN
 IF NOT public.academy_can_access() OR NOT public.is_admin() THEN RAISE EXCEPTION 'admin_required' USING ERRCODE='42501'; END IF;
 IF p_mode = 'open' THEN RAISE EXCEPTION 'academy_open_locked'; END IF;
 IF p_mode IS NULL OR p_mode NOT IN ('closed','pilot') OR p_user_ids IS NULL OR cardinality(p_user_ids)>1000
  OR array_position(p_user_ids,NULL) IS NOT NULL THEN RAISE EXCEPTION 'invalid_rollout_settings'; END IF;
 SELECT COALESCE(array_agg(DISTINCT id ORDER BY id),'{}') INTO v_users FROM unnest(p_user_ids) id;
 IF cardinality(v_users)>20 THEN RAISE EXCEPTION 'pilot_limit_exceeded'; END IF;
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

-- Samosprawdzenie na prawdziwym wierszu; blok z wyjątkiem cofa każdą próbę.
DO $$
DECLARE v_rejected boolean;
BEGIN
 v_rejected := false;
 BEGIN
  UPDATE public.academy_rollout_settings SET mode = 'open' WHERE singleton;
 EXCEPTION WHEN check_violation THEN v_rejected := true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'academy_rollout: baza przyjęła tryb open'; END IF;
 v_rejected := false;
 BEGIN
  UPDATE public.academy_rollout_settings SET pilot_user_ids = ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 21)) WHERE singleton;
 EXCEPTION WHEN check_violation THEN v_rejected := true;
 END;
 IF NOT v_rejected THEN RAISE EXCEPTION 'academy_rollout: baza przyjęła pilota ponad 20 kont'; END IF;
 IF pg_get_functiondef('public.academy_set_rollout(text,uuid[])'::regprocedure) NOT LIKE '%academy_open_locked%'
  OR pg_get_functiondef('public.academy_set_rollout(text,uuid[])'::regprocedure) NOT LIKE '%pilot_limit_exceeded%' THEN
  RAISE EXCEPTION 'academy_rollout: funkcja bez blokady';
 END IF;
 IF NOT has_function_privilege('authenticated', 'public.academy_set_rollout(text,uuid[])', 'EXECUTE')
  OR has_function_privilege('anon', 'public.academy_set_rollout(text,uuid[])', 'EXECUTE') THEN
  RAISE EXCEPTION 'academy_rollout: zmienione uprawnienia funkcji';
 END IF;
END $$;

COMMIT;
