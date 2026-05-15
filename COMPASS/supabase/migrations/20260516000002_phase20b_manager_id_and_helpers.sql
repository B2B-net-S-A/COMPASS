-- ============================================================
-- Phase 20b — manager_id w profiles + role helpers + RLS update
-- Date: 2026-05-16
--
-- Depends on:
--   - 20260516000001_phase20a_role_enum_extend.sql (manager, talent_community values exist)
--   - 20260514000003_phase19c_sync_user_role_finanse.sql (sync_user_role base)
--   - 20260515000001_phase19d_finanse_internal_parity.sql (is_internal_or_admin base)
--
-- Creates:
--   col:      profiles.manager_id UUID (NULL = no manager, FK na profiles)
--   index:    idx_profiles_manager_id (partial gdzie NOT NULL)
--   helpers:
--     is_internal_or_admin()       — extended: + manager + talent_community
--     is_manager()                 — current user has role='manager'
--     is_manager_of(target uuid)   — current user is manager OF target
--     is_team_member(target uuid)  — target.manager_id = current.user.id
--     can_review_invoices()        — extended: + manager (for own team only — gating in app layer)
--     is_talent_community()        — current user has role='talent_community'
--     has_hr_zone_access()         — alias of is_internal_or_admin()
--   RLS:
--     team-view policies extended to include manager + talent_community in roster
--     manager widzi timesheety swojego zespołu
-- ============================================================

BEGIN;

-- ─── 1. Column: manager_id ────────────────────────────────────────────────
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_manager_id
    ON profiles(manager_id)
    WHERE manager_id IS NOT NULL;

COMMENT ON COLUMN profiles.manager_id IS
    'Phase 20. Manager of this user (NULL = no manager, fallback to admin for approvals). FK to profiles.id with ON DELETE SET NULL.';

-- Prevent self-management (user can't be their own manager).
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_no_self_manager;
ALTER TABLE profiles
    ADD CONSTRAINT profiles_no_self_manager CHECK (manager_id IS NULL OR manager_id <> id);

-- ─── 2. Helper: is_internal_or_admin() — extended ──────────────────────────
-- Now includes manager + talent_community (HR-zone access).
CREATE OR REPLACE FUNCTION public.is_internal_or_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role::TEXT IN ('admin', 'internal', 'finanse', 'manager', 'talent_community')
    );
$$;

COMMENT ON FUNCTION public.is_internal_or_admin IS
    'Phase 11 + 19d + 20b. HR-zone gate: admin/internal/finanse/manager/talent_community. Consultant IT excluded.';

-- ─── 3. Helper: is_manager() ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role::TEXT = 'manager'
    );
$$;

COMMENT ON FUNCTION public.is_manager IS
    'Phase 20. True iff current user has role=manager.';

REVOKE EXECUTE ON FUNCTION public.is_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated, service_role;

-- ─── 4. Helper: is_manager_of(target_user_id) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.is_manager_of(target_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = target_user_id
          AND p.manager_id = auth.uid()
    ) AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role::TEXT = 'manager'
    );
$$;

COMMENT ON FUNCTION public.is_manager_of IS
    'Phase 20. True iff current user (role=manager) is the manager of target_user_id. Used by RLS for team-scoped access.';

REVOKE EXECUTE ON FUNCTION public.is_manager_of(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_manager_of(UUID) TO authenticated, service_role;

-- ─── 5. Helper: is_talent_community() ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_talent_community()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role::TEXT = 'talent_community'
    );
$$;

COMMENT ON FUNCTION public.is_talent_community IS
    'Phase 20. True iff current user has role=talent_community. Used by /admin/inbox + /admin/compliance + news composer gates.';

REVOKE EXECUTE ON FUNCTION public.is_talent_community() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_talent_community() TO authenticated, service_role;

-- ─── 6. Helper: has_hr_zone_access() — semantic alias ──────────────────────
-- Alias of is_internal_or_admin() for clarity in code that gates HR-zone access
-- (timesheet, faktura, work clock, kalendarz). Same semantics, just a clearer name.
CREATE OR REPLACE FUNCTION public.has_hr_zone_access()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
    SELECT public.is_internal_or_admin();
$$;

COMMENT ON FUNCTION public.has_hr_zone_access IS
    'Phase 20. Alias for is_internal_or_admin(). Returns true for everyone except consultant IT.';

REVOKE EXECUTE ON FUNCTION public.has_hr_zone_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_hr_zone_access() TO authenticated, service_role;

-- ─── 7. RLS: HR-zone tables — extend role list to 5 (everyone except consultant) ──
-- Pattern: HR-zone roles = {admin, internal, finanse, manager, talent_community}.
-- Phase 19d had {admin, internal, finanse}; Phase 20 adds {manager, talent_community}.

DROP POLICY IF EXISTS "attendance_select_team_for_internal_admin" ON attendance_records;
CREATE POLICY "attendance_select_team_for_internal_admin" ON attendance_records
    FOR SELECT TO authenticated
    USING (
        is_internal_or_admin()
        AND EXISTS (
            SELECT 1 FROM profiles p
            WHERE p.id = attendance_records.user_id
              AND p.role::TEXT IN ('internal', 'admin', 'finanse', 'manager', 'talent_community')
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
              AND p.role::TEXT IN ('internal', 'admin', 'finanse', 'manager', 'talent_community')
        )
    );

DROP POLICY IF EXISTS "profiles_select_team_for_internal_admin" ON profiles;
CREATE POLICY "profiles_select_team_for_internal_admin" ON profiles
    FOR SELECT TO authenticated
    USING (
        is_internal_or_admin()
        AND role::TEXT IN ('internal', 'admin', 'finanse', 'manager', 'talent_community')
    );

-- ─── 8. RLS: timesheets — manager widzi timesheety swojego zespołu ─────────
-- Existing policies (admin via service role + owner via auth.uid()) zostają
-- bez zmian. Dodajemy policy dla manager — widzi/edytuje timesheety wszystkich
-- u których jest managerem.

DROP POLICY IF EXISTS "timesheets_select_manager_team" ON timesheets;
CREATE POLICY "timesheets_select_manager_team" ON timesheets
    FOR SELECT TO authenticated
    USING (
        is_manager_of(user_id)
    );

DROP POLICY IF EXISTS "timesheets_update_manager_approve_reject" ON timesheets;
CREATE POLICY "timesheets_update_manager_approve_reject" ON timesheets
    FOR UPDATE TO authenticated
    USING (is_manager_of(user_id))
    WITH CHECK (is_manager_of(user_id));

-- ─── 9. RLS: timesheet_entries — manager widzi entries swojego zespołu ─────
DROP POLICY IF EXISTS "timesheet_entries_select_manager_team" ON timesheet_entries;
CREATE POLICY "timesheet_entries_select_manager_team" ON timesheet_entries
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM timesheets t
            WHERE t.id = timesheet_entries.timesheet_id
              AND is_manager_of(t.user_id)
        )
    );

-- ─── 10. RLS: invoices — manager widzi faktury swojego zespołu ─────────────
-- Phase 20: rozszerzenie. Manager SELECT swoje + zespołu + manager_approve/reject.
DROP POLICY IF EXISTS "invoices_select_manager_team" ON invoices;
CREATE POLICY "invoices_select_manager_team" ON invoices
    FOR SELECT TO authenticated
    USING (
        is_manager_of(user_id)
    );

-- ─── 11. Audit log: dodaj action types (komentarz tylko, action jest TEXT) ───
-- New audit actions: MANAGER_ASSIGNED, TIMESHEET_MANAGER_APPROVED, TIMESHEET_MANAGER_REJECTED,
-- INVOICE_MANAGER_APPROVED, INVOICE_MANAGER_REJECTED.

COMMIT;
