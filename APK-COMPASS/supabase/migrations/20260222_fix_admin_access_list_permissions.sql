-- ============================================================
-- Fix: admin_access_list → "permission denied for table users"
-- ============================================================
-- Same root cause as centrala_access_list fix:
--   A manually-added RLS policy "Users can read own admin access entry"
--   referenced auth.users directly:
--     (email = ((SELECT users.email FROM auth.users WHERE users.id = auth.uid()))::text)
--   The `authenticated` role has no SELECT on auth.users → 403 on every query.
--
-- Fix approach:
--   1. Drop the problematic RLS policy referencing auth.users
--   2. Recreate it using profiles table instead
--   3. Ensure GRANT permissions for authenticated role
--   4. Drop FK constraint to auth.users if exists
--   5. Ensure consultant_assignments has proper GRANT
--   6. Reload PostgREST schema cache
-- ============================================================

-- Step 1: Fix admin_access_list RLS policy
DROP POLICY IF EXISTS "Users can read own admin access entry" ON admin_access_list;

CREATE POLICY "Users can read own admin access entry"
  ON admin_access_list
  FOR SELECT
  USING (
    email = (SELECT p.email FROM profiles p WHERE p.id = auth.uid())
  );

-- Step 2: Ensure GRANT for admin_access_list
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_access_list TO authenticated;

-- Step 3: Drop FK constraint to auth.users if exists
ALTER TABLE admin_access_list
  DROP CONSTRAINT IF EXISTS admin_access_list_added_by_fkey;

-- Step 4: Ensure consultant_assignments has proper GRANT
GRANT SELECT, INSERT, UPDATE, DELETE ON consultant_assignments TO authenticated;

-- Step 5: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Done. Takes effect immediately — no restart needed.
-- ============================================================
