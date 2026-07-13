-- ============================================================
-- Fixes for Supabase Linter Warnings
-- ============================================================
-- 1. Extension in Public
-- Moves extensions out of the public schema into a dedicated 'extensions' schema
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS "unaccent" WITH SCHEMA public;
ALTER EXTENSION "vector"
SET SCHEMA extensions;
ALTER EXTENSION "unaccent"
SET SCHEMA extensions;
-- 2. RLS Policy Always True
-- Fixes overly permissive policies that bypass RLS
-- audit_logs
DROP POLICY IF EXISTS "Authenticated can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated can insert audit logs" ON public.audit_logs FOR
INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- verification_codes
DROP POLICY IF EXISTS "Authenticated can insert verification codes" ON public.verification_codes;
CREATE POLICY "Authenticated can insert verification codes" ON public.verification_codes FOR
INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
-- admin_access_list
DROP POLICY IF EXISTS "Authenticated users can modify admin_access_list" ON public.admin_access_list;
CREATE POLICY "Admins can modify admin_access_list" ON public.admin_access_list FOR ALL TO authenticated USING (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE id = auth.uid()
            AND role IN ('admin', 'administrator', 'centrala')
    )
) WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE id = auth.uid()
            AND role IN ('admin', 'administrator', 'centrala')
    )
);
-- match_results was a manually-created legacy ATS table and is absent on a
-- fresh, repository-only schema. Its policies are intentionally omitted.
-- 3. Function Search Path Mutable
-- Dynamically sets the search_path for all user-defined functions in the public schema
-- to prevent search_path manipulation vulnerabilities. We include 'extensions' schema 
-- because we just moved vector/unaccent there.
DO $$
DECLARE rec RECORD;
BEGIN FOR rec IN
SELECT n.nspname AS schema_name,
    p.proname AS function_name,
    pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' LOOP EXECUTE format(
        'ALTER FUNCTION %I.%I(%s) SET search_path = public, extensions',
        rec.schema_name,
        rec.function_name,
        rec.arguments
    );
END LOOP;
END;
$$;
