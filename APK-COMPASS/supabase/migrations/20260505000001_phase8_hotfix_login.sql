-- ============================================================
-- Phase 8 hotfix — login flow regression after Phase 1.5 enum cast
-- Date: 2026-05-05
--
-- Symptoms reported: users couldn't log in. Postgres error logs showed:
--   - "column profiles.onboarding_completed does not exist" (referenced by
--     middleware.ts, login/actions.ts, profile.ts:completeOnboarding)
--   - "column role_permissions.feature does not exist" (action expects
--     `feature` column; actual schema has `permission_key`)
--   - "operator does not exist: user_role = text" (login UPDATE attempts
--     'administrator'/'centrala' values not in user_role enum from Phase 1.5)
--   - "function sync_user_role does not exist" (RPC referenced but never
--     created)
--
-- This migration adds the missing columns. Login flow code change in
-- app/login/actions.ts removes the broken sync_user_role RPC call and
-- maps any elevated role to DB value 'admin' (only valid enum value).
--
-- Idempotent.
-- ============================================================

BEGIN;

-- 1. profiles.onboarding_completed
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE profiles SET onboarding_completed = TRUE WHERE role::TEXT IN ('admin', 'trainer');

-- 2. role_permissions schema alignment with lib/types/permissions.ts
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='role_permissions' AND column_name='feature') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='role_permissions' AND column_name='permission_key') THEN
            ALTER TABLE role_permissions RENAME COLUMN permission_key TO feature;
        ELSE
            ALTER TABLE role_permissions ADD COLUMN feature TEXT;
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='role_permissions' AND column_name='value') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='role_permissions' AND column_name='allowed') THEN
            ALTER TABLE role_permissions RENAME COLUMN allowed TO value;
        ELSE
            ALTER TABLE role_permissions ADD COLUMN value TEXT;
        END IF;
    END IF;
END $$;

ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS updated_by UUID;

COMMIT;
