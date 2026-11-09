-- Cofnięcie B1.5. Stosuje wyłącznie właściciel. Konta nauki wracają do statusu `active`,
-- więc znów pojawią się na listach ludzi; cofać tylko, gdy takich kont nie ma.
BEGIN;

CREATE OR REPLACE FUNCTION public.nexus_roster_export()
RETURNS TABLE(email text, employment_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
    SELECT
        lower(trim(p.email))::TEXT       AS email,
        p.employment_status::TEXT        AS employment_status
    FROM profiles p
    WHERE p.email IS NOT NULL
      AND trim(p.email) <> ''
    ORDER BY 1;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'pg_catalog' AS $function$
begin
  insert into public.profiles (id, email, full_name, avatar_url, academy_only)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url',
          coalesce(new.raw_app_meta_data->'academy_only' = 'true'::jsonb, false));
  return new;
end;
$function$;

UPDATE public.profiles SET employment_status = 'active' WHERE employment_status = 'learning';

ALTER TABLE public.profiles DROP CONSTRAINT profiles_employment_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_employment_status_check
    CHECK (employment_status = ANY (ARRAY['pending','onboarding','active','offboarding','exited']));

COMMIT;
