-- Cofnięcie B1.2. Stosuje wyłącznie właściciel. Wymaga braku kont nauki w użyciu,
-- bo usuwa kolumnę profiles.academy_only i pola przepustki.
BEGIN;

CREATE OR REPLACE FUNCTION academy_private.rollout_allows_user(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.academy_is_global_editor(p_user_id) OR EXISTS (
  SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
  CROSS JOIN public.academy_rollout_settings s WHERE p.id=p_user_id
   AND p.role::text IN ('consultant','internal','manager','finanse') AND NOT COALESCE(p.is_external,false)
   AND COALESCE(p.employment_status::text,'active')<>'exited'
   AND (s.mode='open' OR (s.mode='pilot' AND p.id=ANY(s.pilot_user_ids)))
 );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_catalog' AS $function$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$function$;

DO $migration$
DECLARE v_def text; v_new text;
BEGIN
    v_def := pg_get_functiondef('public.pin_profile_privilege_columns()'::regprocedure);
    v_new := replace(v_def, E'            OR NEW.academy_only IS DISTINCT FROM OLD.academy_only\n', '');
    v_new := replace(v_new, E'        NEW.academy_only            := OLD.academy_only;\n', '');
    IF v_new = v_def THEN RAISE EXCEPTION 'b1_2_down_pin_not_found'; END IF;
    EXECUTE v_new;
END $migration$;

ALTER TABLE public.profiles DROP COLUMN academy_only;
DROP TRIGGER academy_learner_trial_source_guard ON public.academy_learner_accounts;
DROP FUNCTION academy_private.guard_learner_trial_source();
ALTER TABLE public.academy_learner_accounts
    DROP CONSTRAINT academy_learner_accounts_source_check,
    DROP CONSTRAINT academy_learner_accounts_not_company_check,
    DROP COLUMN access_until,
    DROP COLUMN disappeared_at,
    DROP COLUMN info_version,
    DROP COLUMN last_entry_at;

COMMIT;
