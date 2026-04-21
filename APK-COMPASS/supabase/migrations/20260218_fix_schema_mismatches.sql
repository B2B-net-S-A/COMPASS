-- Fix Schema Mismatches between Profiles, Candidates, and Triggers
-- 1. Fix Profiles table (Add missing columns expected by trigger)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS skills TEXT [] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS current_status TEXT CHECK (
        current_status IN (
            'open',
            'busy',
            'unavailable',
            'available_from',
            'fte_1_0',
            'fte_0_5',
            'fte_0_25',
            'blocked',
            'notice_period'
        )
    ) DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS project_sentiment TEXT DEFAULT 'neutral',
    ADD COLUMN IF NOT EXISTS verifier_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS ambassador_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS sales_support_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS previous_clients TEXT [] DEFAULT '{}';
-- 2. Fix Candidates table (Add missing columns and fix status mismatch)
-- 2a. Add user_id to link with auth/profiles
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE
SET NULL UNIQUE;
-- 2b. Handle status vs current_status mismatch
-- Check if 'status' column exists and 'current_status' does not. If so, rename it.
DO $$ BEGIN IF EXISTS (
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
END $$;
-- 2c. Add remaining missing columns to candidates
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS project_sentiment TEXT DEFAULT 'neutral',
    ADD COLUMN IF NOT EXISTS verifier_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS ambassador_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS sales_support_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS previous_clients TEXT [] DEFAULT '{}';
-- 3. Ensure constraints on candidates.current_status match profiles
-- (Previously handled in 20260216_availability_overhaul.sql but safer to re-apply if table was malformed)
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_current_status_check;
ALTER TABLE candidates
ADD CONSTRAINT candidates_current_status_check CHECK (
        current_status IN (
            'new',
            'contacted',
            'interview',
            'hired',
            'rejected',
            'open',
            'busy',
            'unavailable',
            'available_from',
            'fte_1_0',
            'fte_0_5',
            'fte_0_25',
            'blocked',
            'notice_period'
        )
    );