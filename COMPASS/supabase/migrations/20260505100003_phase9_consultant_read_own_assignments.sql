-- ============================================================
-- Phase 9 fix: re-add "consultant_read_own_assignments" RLS policy
-- ============================================================
--
-- The earlier `20260219_centrala_management.sql` migration created a policy
-- letting consultants read their own consultant_assignments rows. The phase-15
-- RLS rewrite (`20260504500001_phase15_rls_helpers_rewrite.sql`) replaced the
-- whole policy set on this table with admin + centrala policies only — it
-- silently dropped the consultant read policy.
--
-- Without this policy, `getMyGuardians()` (used by /support/contacts and the
-- sidebar Support Center badge) returns [] for every real consultant on prod
-- because RLS hides their own assignment_to → recruiter rows.
--
-- This migration was already applied to compass-prod via the Supabase MCP
-- after we caught the bug during e2e verification; this file synchronises the
-- migrations directory with prod so a fresh rebuild reproduces it.

DROP POLICY IF EXISTS "consultant_read_own_assignments" ON consultant_assignments;
CREATE POLICY "consultant_read_own_assignments" ON consultant_assignments
    FOR SELECT
    TO authenticated
    USING (consultant_id = auth.uid());
