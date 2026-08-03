-- Phase 45 — Per-user grants: timesheet overtime (>8h) + TCM section access
-- Date: 2026-08-03
--
-- Business: Dominik Zwierzchowski (manager) needs two capabilities added WITHOUT
-- losing his manager role:
--   1. Log > 8h/day on timesheets (his own + team he approves) — until now admin-only.
--   2. Access the Talent Community / People Ops section with full edit + add.
--
-- Model: single role per user, so both capabilities are granted as ADDITIVE
-- per-user boolean flags on profiles (not a role change).
--   - can_log_overtime  → unlocks the overtime-override path (self-service + approver)
--   - has_tcm_access     → additive TCM/lifecycle access on top of the current role
--   - is_inbox_handler   → (existing column) administracja@ inbox tickets
--
-- Changes:
--   1. Add profiles.can_log_overtime + profiles.has_tcm_access (default FALSE).
--   2. has_lifecycle_access(): admin | talent_community | has_tcm_access.
--      → grants contractors / contractor_tasks / contractor_bench / lifecycle_events /
--        onboarding_* / exit_interviews / offboarding_tasks / consultant_success (RLS
--        via this helper) and requireLifecycleManagerAction()-guarded actions.
--   3. enforce_overtime_override_admin_only(): admin | can_log_overtime.
--   4. Grant Dominik all three flags.
--
-- Additive + idempotent; safe to apply before the app code that reads the columns
-- deploys (existing admin/TCM paths unchanged).

-- ─── 1. New per-user grant columns ───────────────────────────────────────
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS can_log_overtime BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS has_tcm_access   BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN profiles.can_log_overtime IS
    'Phase 45. Per-user grant: may enter >8h/day (overtime override, up to 16h) on own and team timesheets — same capability as admin. Default FALSE.';
COMMENT ON COLUMN profiles.has_tcm_access IS
    'Phase 45. Per-user grant: additive Talent Community / lifecycle access (contractors, onboarding/exit, people-ops) on top of base role, without changing role. Default FALSE.';

-- ─── 2. has_lifecycle_access(): honor has_tcm_access flag ─────────────────
CREATE OR REPLACE FUNCTION public.has_lifecycle_access()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND (role::TEXT IN ('admin', 'talent_community') OR has_tcm_access = TRUE)
    );
$function$;

-- ─── 3. Overtime trigger: honor can_log_overtime flag ─────────────────────
CREATE OR REPLACE FUNCTION public.enforce_overtime_override_admin_only()
RETURNS trigger
LANGUAGE plpgsql AS $function$
DECLARE
    v_role TEXT;
    v_can_log_overtime BOOLEAN;
BEGIN
    IF NEW.is_overtime_override = TRUE THEN
        SELECT role::text, can_log_overtime
          INTO v_role, v_can_log_overtime
        FROM profiles
        WHERE id = NEW.override_by;

        IF v_role IS NULL THEN
            RAISE EXCEPTION 'override_by must reference an existing profile'
                USING ERRCODE = 'P0001';
        END IF;

        IF v_role <> 'admin' AND COALESCE(v_can_log_overtime, FALSE) = FALSE THEN
            RAISE EXCEPTION 'Only admin or a user granted can_log_overtime may apply overtime override (got role: %)', v_role
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- ─── 4. Grant Dominik Zwierzchowski the three flags ───────────────────────
UPDATE profiles
   SET can_log_overtime = TRUE,
       has_tcm_access   = TRUE,
       is_inbox_handler = TRUE
 WHERE id = '43abab10-0834-4e3a-9b85-5087b21d2ccd';
