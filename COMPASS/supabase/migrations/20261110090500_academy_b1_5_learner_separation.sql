-- B1.5: konto nauki poza kartoteką. Status `learning` jest ustawiany razem z academy_only.
--
-- Dlaczego osobny status, a nie filtr po kolumnie academy_only w kodzie: kod idzie przed
-- SQL, a odwołanie do nieistniejącej kolumny wywróciłoby każdą listę ludzi błędem 42703.
-- Porównanie tekstowe z nieznaną wartością statusu działa przed migracją i po niej.
--
-- Kolejność: po 20261110090000_academy_b1_2_learner_accounts.sql.
-- Cofnięcie: supabase/rollbacks/20261110090500_academy_b1_5_learner_separation.sql
BEGIN;

ALTER TABLE public.profiles DROP CONSTRAINT profiles_employment_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_employment_status_check
    CHECK (employment_status = ANY (ARRAY['pending','onboarding','active','offboarding','exited','learning']));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_catalog' AS $function$
declare
  v_academy_only boolean := coalesce(new.raw_app_meta_data->'academy_only' = 'true'::jsonb, false);
begin
  insert into public.profiles (id, email, full_name, avatar_url, academy_only, employment_status)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url',
          v_academy_only, case when v_academy_only then 'learning' else 'active' end);
  return new;
end;
$function$;

UPDATE public.profiles SET employment_status = 'learning'
WHERE academy_only AND employment_status <> 'exited';

-- Konto nauki nie jest pracownikiem: NEXUS nie ma go dostać w liście cyklu życia.
CREATE OR REPLACE FUNCTION public.nexus_roster_export()
RETURNS TABLE(email text, employment_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
    SELECT
        lower(trim(p.email))::TEXT       AS email,
        p.employment_status::TEXT        AS employment_status
    FROM profiles p
    WHERE p.email IS NOT NULL
      AND trim(p.email) <> ''
      AND NOT p.academy_only
    ORDER BY 1;
$function$;

DO $check$
DECLARE v_def text;
BEGIN
    v_def := pg_get_functiondef('public.nexus_roster_export()'::regprocedure);
    IF v_def NOT LIKE '%NOT p.academy_only%' THEN RAISE EXCEPTION 'b1_5_roster_filter_missing'; END IF;
    v_def := pg_get_functiondef('public.handle_new_user()'::regprocedure);
    IF v_def NOT LIKE '%''learning''%' THEN RAISE EXCEPTION 'b1_5_status_not_set'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_employment_status_check'
        AND pg_get_constraintdef(oid) LIKE '%learning%') THEN
        RAISE EXCEPTION 'b1_5_status_check_missing';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE academy_only AND employment_status NOT IN ('learning','exited')) THEN
        RAISE EXCEPTION 'b1_5_learner_status_mismatch';
    END IF;
END $check$;

COMMIT;
