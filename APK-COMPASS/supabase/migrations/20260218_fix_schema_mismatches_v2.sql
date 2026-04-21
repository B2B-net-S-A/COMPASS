-- 1. Fix Profiles (Add missing columns)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS skills TEXT [] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS project_sentiment TEXT DEFAULT 'neutral',
    ADD COLUMN IF NOT EXISTS verifier_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS ambassador_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS sales_support_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS previous_clients TEXT [] DEFAULT '{}';
-- 2. Fix Candidates (Add user_id and missing columns)
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE
SET NULL UNIQUE,
    ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS project_sentiment TEXT DEFAULT 'neutral',
    ADD COLUMN IF NOT EXISTS verifier_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS ambassador_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS sales_support_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS previous_clients TEXT [] DEFAULT '{}';
-- 3. Rename status to current_status if needed
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