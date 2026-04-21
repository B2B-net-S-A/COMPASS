-- ============================================================
-- Fix: centrala_access_list → "permission denied for table users"
-- ============================================================
-- Root cause (ACTUAL):
--   A manually-added RLS policy "Users can read own centrala access entry"
--   referenced auth.users directly:
--     (email = ((SELECT users.email FROM auth.users WHERE users.id = auth.uid()))::text)
--   The `authenticated` role has no SELECT on auth.users → 403 on every query.
--
-- Secondary issue:
--   FK constraint `added_by REFERENCES auth.users(id)` could also cause
--   PostgREST schema introspection issues.
--
-- Fix approach:
--   1. Drop the FK constraint to auth.users
--   2. Drop the problematic RLS policy referencing auth.users
--   3. Recreate it using profiles table instead
--   4. Ensure GRANT permissions for authenticated role
--   5. Reload PostgREST schema cache
-- ============================================================

-- Step 1: Remove FK constraint to auth.users
ALTER TABLE centrala_access_list
  DROP CONSTRAINT IF EXISTS centrala_access_list_added_by_fkey;

-- Step 2: Grant table-level permissions to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON centrala_access_list TO authenticated;

-- Step 3: Ensure RLS is enabled
ALTER TABLE centrala_access_list ENABLE ROW LEVEL SECURITY;

-- Step 4: Recreate admin policy with WITH CHECK
DROP POLICY IF EXISTS "Administrators can manage centrala access list" ON centrala_access_list;

CREATE POLICY "Administrators can manage centrala access list"
  ON centrala_access_list
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('administrator', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('administrator', 'admin')
    )
  );

-- Step 5: Fix the problematic policy that referenced auth.users
-- (was manually added via Supabase Dashboard, not in migration files)
DROP POLICY IF EXISTS "Users can read own centrala access entry" ON centrala_access_list;

CREATE POLICY "Users can read own centrala access entry"
  ON centrala_access_list
  FOR SELECT
  USING (
    email = (SELECT p.email FROM profiles p WHERE p.id = auth.uid())
  );

-- Step 6: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Done. Takes effect immediately — no restart needed.
-- ============================================================
