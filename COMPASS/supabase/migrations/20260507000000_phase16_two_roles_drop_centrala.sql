-- Phase 16: simplify to 2 roles (admin + consultant) and drop unused centrala module
-- Context:
--   - All centrala_* tables are empty in production (0 rows on 2026-05-07)
--   - consultant_assignments + role_permissions are also empty
--   - enum user_role still has 'trainer' but nobody is assigned it
--   - admin@dynaminds.pl has role=consultant despite the name; promote to admin

BEGIN;

-- A1. Drop centrala module + service hub tables (all empty in prod)
DROP TABLE IF EXISTS public.centrala_access_list CASCADE;
DROP TABLE IF EXISTS public.centrala_benefit_declarations CASCADE;
DROP TABLE IF EXISTS public.centrala_equipment_requests CASCADE;
DROP TABLE IF EXISTS public.centrala_invoices CASCADE;
DROP TABLE IF EXISTS public.benefit_declarations CASCADE;
DROP TABLE IF EXISTS public.equipment_requests CASCADE;
DROP TABLE IF EXISTS public.invoices CASCADE;
DROP TABLE IF EXISTS public.consultant_assignments CASCADE;
DROP TABLE IF EXISTS public.role_permissions CASCADE;
-- compass_legacy.* tables (centrala_referrals, project_referrals) are already in legacy schema; leave them

-- A2. Drop 'trainer' from enum user_role (0 users have it)
ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT;

ALTER TYPE public.user_role RENAME TO user_role_old;
CREATE TYPE public.user_role AS ENUM ('consultant', 'admin');

ALTER TABLE public.profiles
  ALTER COLUMN role TYPE public.user_role USING (
    CASE role::text
      WHEN 'trainer' THEN 'admin'::public.user_role
      ELSE role::text::public.user_role
    END
  );

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'consultant'::public.user_role;

DROP TYPE public.user_role_old;

-- A3. RLS helper compat: is_trainer_or_admin() now aliases is_admin() so existing policies keep working
--     (any policy referencing this function continues to work; we'll rename in a follow-up if desired)
CREATE OR REPLACE FUNCTION public.is_trainer_or_admin() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE
  SET search_path = public
  AS $$ SELECT public.is_admin() $$;

COMMENT ON FUNCTION public.is_trainer_or_admin() IS
  'Deprecated: kept as alias for is_admin() after trainer role was removed in phase 16. Do not use in new policies.';

-- A4. Backfill: admin@dynaminds.pl → admin role + admin_access_list entry (so syncRole keeps it stable)
UPDATE public.profiles
   SET role = 'admin'::public.user_role
 WHERE id = 'd97b35fd-75ff-4b0a-b058-f8d4bd1a1d9d';

INSERT INTO public.admin_access_list (email)
  VALUES ('admin@dynaminds.pl')
  ON CONFLICT (email) DO NOTHING;

-- A5. Cleanup: remove legacy E2E test users (centrala / administrator markers no longer exist)
DELETE FROM auth.users WHERE email IN (
  'e2e+centrala@b2bnetwork.pl',
  'e2e+administrator@b2bnetwork.pl'
);

COMMIT;
