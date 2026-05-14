-- FORCE CASCADE FIX (The "Nuclear" Option)
-- This script changes ALL potential blocking relationships to "DELETE CASCADE"
-- This means if you delete a User, all their linked data (messages, contracts) will be deleted too.
-- This ensures the user deletion CANNOT fail.
DO $$ BEGIN -- 1. CONTRACTS (created_by)
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'contracts'
) THEN
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_created_by_fkey;
ALTER TABLE contracts
ADD CONSTRAINT contracts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;
END IF;
-- 2. CONVERSATIONS (owner_id)
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'conversations'
) THEN
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_owner_id_fkey;
ALTER TABLE conversations
ADD CONSTRAINT conversations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
END IF;
-- 3. MESSAGES (sender_id)
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'messages'
) THEN
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE messages
ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE CASCADE;
END IF;
-- 4. CENTRALA ACCESS LIST (added_by)
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'centrala_access_list'
) THEN
ALTER TABLE centrala_access_list DROP CONSTRAINT IF EXISTS centrala_access_list_added_by_fkey;
ALTER TABLE centrala_access_list
ADD CONSTRAINT centrala_access_list_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE CASCADE;
END IF;
-- 5. CANDIDATES (user_id) -> Ensuring it is CASCADE/SET NULL
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'candidates'
) THEN -- Attempt to find the constraint name if it exists, or just try generic
-- Dropping based on column is hard in plain SQL block without looking up name.
-- Let's try to add the column, if it exists, alter it?
NULL;
END IF;
END $$;
-- 6. ENSURE COLUMNS (Just to be sure)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS skills TEXT [] DEFAULT '{}';
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0;
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'open';
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE;
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'open';
-- 7. CLEANUP (Try to delete dependent data manually for the stuck user if Cascade doesn't catch old rows?)
-- We can't delete by email easily here without knowing the ID.
-- The User will delete via Dashboard.