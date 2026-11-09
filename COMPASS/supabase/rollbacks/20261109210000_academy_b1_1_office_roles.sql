-- Cofnięcie B1.1. Stosuje wyłącznie właściciel, gdy migracja B1.1 ma zostać wycofana.
-- Przywraca: konsultant w rollout i trenerach, a w pilocie tylko konsultant albo admin.
BEGIN;

CREATE OR REPLACE FUNCTION academy_private.rollout_allows_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.academy_is_global_editor(p_user_id) OR EXISTS (
  SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
  CROSS JOIN public.academy_rollout_settings s WHERE p.id=p_user_id
   AND p.role::text='consultant' AND NOT COALESCE(p.is_external,false)
   AND COALESCE(p.employment_status::text,'active')<>'exited'
   AND (s.mode='open' OR (s.mode='pilot' AND p.id=ANY(s.pilot_user_ids)))
 );
$$;

CREATE OR REPLACE FUNCTION academy_private.trainer_eligible(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT academy_private.rollout_allows_user(p_user_id) AND (
  public.academy_is_global_editor(p_user_id) OR EXISTS (
   SELECT 1 FROM public.profiles p JOIN public.academy_user_capabilities g ON g.user_id=p.id
   WHERE p.id=p_user_id AND p.role::text='consultant' AND g.can_train AND g.revoked_at IS NULL
  )
 );
$$;

DO $migration$
DECLARE v_fn text; v_def text; v_new text;
BEGIN
    v_fn := 'academy_private.refresh_invites_after_rollout_change()';
    v_def := pg_get_functiondef(v_fn::regprocedure);
    v_new := replace(v_def, $old$p.role::text IN ('consultant','internal','manager','finanse')$old$, $new$p.role::text='consultant'$new$);
    IF v_new = v_def THEN RAISE EXCEPTION 'b1_1_down_refresh_not_found'; END IF;
    EXECUTE v_new;

    v_fn := 'public.academy_set_trainer(uuid,boolean)';
    v_def := pg_get_functiondef(v_fn::regprocedure);
    v_new := replace(v_def, $old$p.role::text IN ('consultant','internal','manager','finanse')$old$, $new$p.role::text='consultant'$new$);
    IF v_new = v_def THEN RAISE EXCEPTION 'b1_1_down_set_trainer_not_found'; END IF;
    EXECUTE v_new;

    v_fn := 'public.academy_set_rollout(text,uuid[])';
    v_def := pg_get_functiondef(v_fn::regprocedure);
    v_new := replace(v_def, $old$WHERE p.id=candidate.uid AND NOT COALESCE(p.is_external,false)$old$,
        $new$WHERE p.id=candidate.uid AND p.role::text IN ('consultant','admin') AND NOT COALESCE(p.is_external,false)$new$);
    IF v_new = v_def THEN RAISE EXCEPTION 'b1_1_down_set_rollout_not_found'; END IF;
    EXECUTE v_new;
END $migration$;

COMMIT;
