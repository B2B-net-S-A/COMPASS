-- ============================================================
-- Phase 1.1 — Role taxonomy normalization + RLS helpers
-- Date: 2026-05-04
--
-- Pivot Compass to consultant retention platform: collapse legacy roles
--   (recruiter | delivery_lead | finance | centrala | administrator)
-- to canonical 3 (`consultant | admin | trainer`).
--
-- DEFERRED to Phase 1.5: full ENUM cast for `profiles.role` column. There are
-- 60+ existing RLS policies using TEXT comparisons against role values; cleanly
-- migrating to enum requires rewriting every policy in the same migration. For
-- now we keep TEXT but enforce a CHECK constraint to canonical values, and
-- introduce `is_admin()` / `is_trainer_or_admin()` helpers for new RLS code.
--
-- Idempotent: UPDATE keys safe; constraint dropped before re-add.
-- ============================================================

BEGIN;

-- 1. Normalize legacy role values
UPDATE profiles SET role = 'admin'
WHERE role IN ('recruiter', 'delivery_lead', 'finance', 'centrala', 'administrator');

UPDATE profiles SET role = 'consultant'
WHERE role IS NULL OR role = '';

-- 2. Helper functions (TEXT-based; enum cast in Phase 1.5)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role = 'admin'
    );
$$;

CREATE OR REPLACE FUNCTION is_trainer_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid() AND role IN ('admin', 'trainer')
    );
$$;

-- 3. CHECK constraint to keep role canonical going forward
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_canonical_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_canonical_check
    CHECK (role IN ('consultant', 'admin', 'trainer'));

COMMENT ON FUNCTION is_admin IS 'Phase 1.1 (2026-05-04). RLS migration to use this helper deferred to Phase 1.5.';
COMMENT ON FUNCTION is_trainer_or_admin IS 'Phase 1.1.';
COMMENT ON CONSTRAINT profiles_role_canonical_check ON profiles IS 'Phase 1.1: roles canonical to 3 values.';

COMMIT;
