-- ============================================================
-- Phase 1.5 step 2/2 — Cast profiles.role TEXT → user_role enum
-- Date: 2026-05-04
--
-- Prerequisite: 20260504500001 (RLS rewrite to is_admin() helpers).
-- After this, profiles.role is a strict enum at DB level.
--
-- News audience policy uses profiles.role directly via p.role = ANY(audience_role)
-- — must be dropped before cast and recreated after with explicit ::TEXT cast
-- (audience_role is TEXT[]).
-- ============================================================

BEGIN;

-- Create enum if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('consultant', 'admin', 'trainer');
    END IF;
END $$;

-- Drop CHECK constraints (TEXT-based, would fail post-cast)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_canonical_check;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Drop news audience policy temporarily (uses p.role = ANY(audience_role TEXT[]))
DROP POLICY IF EXISTS "news_posts_select_published_audience" ON news_posts;

-- Cast TEXT → user_role enum
ALTER TABLE profiles ALTER COLUMN role DROP DEFAULT;
ALTER TABLE profiles ALTER COLUMN role TYPE user_role USING role::user_role;
ALTER TABLE profiles ALTER COLUMN role SET DEFAULT 'consultant'::user_role;

-- Recreate news audience policy with explicit ::TEXT cast for array comparison
CREATE POLICY "news_posts_select_published_audience" ON news_posts FOR SELECT TO authenticated USING (
    is_admin() OR (
        published_at IS NOT NULL
        AND (
            audience_role IS NULL
            OR audience_role = '{}'::TEXT[]
            OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role::TEXT = ANY(audience_role))
        )
    )
);

COMMIT;
