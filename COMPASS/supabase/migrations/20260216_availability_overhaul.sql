-- Add granular availability fields to profiles and candidates
DO $$ BEGIN -- Add columns to profiles table
IF NOT EXISTS (
    SELECT
    FROM information_schema.columns
    WHERE table_name = 'profiles'
        AND column_name = 'available_from'
) THEN
ALTER TABLE profiles
ADD COLUMN available_from DATE;
END IF;
IF NOT EXISTS (
    SELECT
    FROM information_schema.columns
    WHERE table_name = 'profiles'
        AND column_name = 'fte_status'
) THEN
ALTER TABLE profiles
ADD COLUMN fte_status TEXT;
END IF;
IF NOT EXISTS (
    SELECT
    FROM information_schema.columns
    WHERE table_name = 'profiles'
        AND column_name = 'max_monthly_hours'
) THEN
ALTER TABLE profiles
ADD COLUMN max_monthly_hours INTEGER DEFAULT 160;
END IF;
-- Add columns to candidates table
IF NOT EXISTS (
    SELECT
    FROM information_schema.columns
    WHERE table_name = 'candidates'
        AND column_name = 'available_from'
) THEN
ALTER TABLE candidates
ADD COLUMN available_from DATE;
END IF;
IF NOT EXISTS (
    SELECT
    FROM information_schema.columns
    WHERE table_name = 'candidates'
        AND column_name = 'fte_status'
) THEN
ALTER TABLE candidates
ADD COLUMN fte_status TEXT;
END IF;
IF NOT EXISTS (
    SELECT
    FROM information_schema.columns
    WHERE table_name = 'candidates'
        AND column_name = 'max_monthly_hours'
) THEN
ALTER TABLE candidates
ADD COLUMN max_monthly_hours INTEGER DEFAULT 160;
END IF;
END $$;
-- Update current_status constraints if they exist
-- Based on previous migration, current_status was text with check constraints in some tables.
-- Let's make it more flexible across both tables.
-- Note: 'available_from' status implies a temporal state, maybe we keep 'open' as general but use available_from as the date.
-- Looking at the requirement: 🔵 Dostępny od (data), 🟢 Pełny etat (1.0 FTE), 🟡 0.5 FTE, 🟠 0.25 FTE, 🔴 Zablokowany (projekt), ⚫ Notice period.
-- We should update the check constraint on profiles.current_status if it exists.
-- But the initial schema didn't have a check constraint on profiles.current_status, only on role.
-- However, candidates table had a check constraint: 'new', 'contacted', 'interview', 'hired', 'rejected'.
-- Wait, the profile page uses 'open', 'busy', 'unavailable'.
-- Let's synchronize the allowed statuses.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_current_status_check;
ALTER TABLE profiles
ADD CONSTRAINT profiles_current_status_check CHECK (
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
    );
ALTER TABLE candidates DROP CONSTRAINT IF EXISTS candidates_current_status_check;
-- Keeping legacy statuses for candidates while adding new ones
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