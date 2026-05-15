-- ============================================================
-- Phase 19d — Finanse parity with internal for HR Hub access
-- Date: 2026-05-15
--
-- Finanse users są też b2b pracownikami biurowymi — wystawiają własne
-- timesheety, składają urlopy, logują obecność. Phase 19a dała im wyłącznie
-- dostęp do review faktur; ten patch wyrównuje uprawnienia do internal.
--
-- Already applied to prod via mcp.apply_migration on 2026-05-15 — file
-- exists for git history + reproducibility on staging/dev envs.
-- ============================================================

-- 1. Broaden is_internal_or_admin() to include finanse.
CREATE OR REPLACE FUNCTION public.is_internal_or_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role::TEXT IN ('admin', 'internal', 'finanse')
    );
$$;

COMMENT ON FUNCTION public.is_internal_or_admin IS
    'Phase 11 + 19d. Used by HR-zone RLS. Returns true for admin, internal, finanse.';

-- 2. Team-view policies on attendance, leave, profiles — include finanse so
--    they show up in the same HR roster alongside internal/admin.

DROP POLICY IF EXISTS "attendance_select_team_for_internal_admin" ON attendance_records;
CREATE POLICY "attendance_select_team_for_internal_admin" ON attendance_records
    FOR SELECT TO authenticated
    USING (
        is_internal_or_admin()
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = attendance_records.user_id
              AND p.role::TEXT IN ('internal', 'admin', 'finanse')
        )
    );

DROP POLICY IF EXISTS "leave_select_team_for_internal_admin" ON leave_requests;
CREATE POLICY "leave_select_team_for_internal_admin" ON leave_requests
    FOR SELECT TO authenticated
    USING (
        is_internal_or_admin()
        AND status = 'approved'
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = leave_requests.user_id
              AND p.role::TEXT IN ('internal', 'admin', 'finanse')
        )
    );

DROP POLICY IF EXISTS "profiles_select_team_for_internal_admin" ON profiles;
CREATE POLICY "profiles_select_team_for_internal_admin" ON profiles
    FOR SELECT TO authenticated
    USING (
        is_internal_or_admin()
        AND role::TEXT IN ('internal', 'admin', 'finanse')
    );

-- 3. Invoice INSERT — allow internal AND finanse to submit their own invoices.
DROP POLICY IF EXISTS "invoices_insert_internal_own" ON invoices;
CREATE POLICY "invoices_insert_internal_or_finanse_own" ON invoices
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role::TEXT IN ('internal', 'finanse')
        )
    );
