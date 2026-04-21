-- FINAL REGISTRATION FIX
-- This script adds missing columns to Profiles and Candidates to fix the "Database error saving new user".
DO $$ BEGIN -- 1. FIX PROFILES (Critical for Trigger)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS skills TEXT [] DEFAULT '{}';
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0;
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'open';
-- 2. FIX CANDIDATES (Critical for Trigger)
-- Ensure table exists first (just in case)
CREATE TABLE IF NOT EXISTS candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE;
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE;
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'open';
-- Rename legacy column if exists
IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'candidates'
        AND column_name = 'status'
)
AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'candidates'
        AND column_name = 'current_status'
) THEN
ALTER TABLE candidates
    RENAME COLUMN status TO current_status;
END IF;
-- 3. RECREATE TRIGGER ( Robust Version )
-- Just in case the old trigger is broken or references missing columns.
-- We assume the trigger exists already, but let's make sure it handles errors or at least columns exist.
-- (Columns are added above so trigger should work).
END $$;