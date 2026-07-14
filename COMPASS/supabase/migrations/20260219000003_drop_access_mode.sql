-- ============================================================
-- Migration: Remove access_mode from centrala_access_list
-- ============================================================
-- Scenario B: "Uprawnienia Ról" (role_permissions) is the single
-- source of truth for what each role can do.
-- The access_mode column in centrala_access_list was redundant
-- and not consumed by the application after login.
--
-- centrala_access_list now only defines WHO is in Centrala
-- and their role (recruiter / delivery_lead / finance).
-- WHAT each role can do is defined in role_permissions table.
-- ============================================================

-- Step 1: Drop the access_mode column
ALTER TABLE centrala_access_list
DROP COLUMN IF EXISTS access_mode;

-- Step 2: Ensure centrala_role has a default
ALTER TABLE centrala_access_list
ALTER COLUMN centrala_role SET DEFAULT 'recruiter';
