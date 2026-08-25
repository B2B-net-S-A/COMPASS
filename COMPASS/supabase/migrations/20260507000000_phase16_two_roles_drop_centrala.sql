-- Phase 16: simplify to 2 roles (admin + consultant) and drop unused centrala module
-- Context:
--   - All centrala_* tables are empty in production (0 rows on 2026-05-07)
--   - consultant_assignments + role_permissions are also empty
--   - enum user_role still has 'trainer' but nobody is assigned it
--   - identity-specific role changes and test-user cleanup are operational
--     actions and are intentionally excluded from reproducible schema history

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
DROP POLICY IF EXISTS "news_posts_select_published_audience" ON public.news_posts;

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

CREATE POLICY "news_posts_select_published_audience"
ON public.news_posts FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    published_at IS NOT NULL
    AND (
      audience_role IS NULL
      OR audience_role = '{}'::TEXT[]
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role::TEXT = ANY(audience_role)
      )
    )
  )
);

-- A3. RLS helper compat: is_trainer_or_admin() now aliases is_admin() so existing policies keep working
--     (any policy referencing this function continues to work; we'll rename in a follow-up if desired)
CREATE OR REPLACE FUNCTION public.is_trainer_or_admin() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE
  SET search_path = public
  AS $$ SELECT public.is_admin() $$;

COMMENT ON FUNCTION public.is_trainer_or_admin() IS
  'Deprecated: kept as alias for is_admin() after trainer role was removed in phase 16. Do not use in new policies.';

COMMIT;
