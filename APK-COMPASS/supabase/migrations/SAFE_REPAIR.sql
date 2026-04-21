-- SAFE REPAIR SCRIPT (Fixes Missing Columns + Constraints if table exists)
-- 1. FIX CORE SCHEMA (Profiles & Candidates) - Critical for Registration
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS skills TEXT [] DEFAULT '{}';
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0;
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'open';
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE
SET NULL UNIQUE;
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'open';
DO $$ BEGIN -- Rename legacy column if needed
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
-- 2. FIX DELETION BLOCKERS (Constraints) - Only if tables exist
-- Contracts: created_by -> Set Null
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'contracts'
) THEN
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_created_by_fkey;
ALTER TABLE contracts
ADD CONSTRAINT contracts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE
SET NULL;
END IF;
-- Conversations: owner_id -> Set Null
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'conversations'
) THEN
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_owner_id_fkey;
ALTER TABLE conversations
ADD CONSTRAINT conversations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE
SET NULL;
END IF;
-- Messages: sender_id -> Set Null
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'messages'
) THEN
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE messages
ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE
SET NULL;
END IF;
-- Centrala Access List: added_by -> Set Null
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'centrala_access_list'
) THEN
ALTER TABLE centrala_access_list DROP CONSTRAINT IF EXISTS centrala_access_list_added_by_fkey;
ALTER TABLE centrala_access_list
ADD CONSTRAINT centrala_access_list_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id) ON DELETE
SET NULL;
END IF;
-- Favorite Projects: user_id -> Cascade
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'favorite_projects'
) THEN
ALTER TABLE favorite_projects DROP CONSTRAINT IF EXISTS favorite_projects_user_id_fkey;
ALTER TABLE favorite_projects
ADD CONSTRAINT favorite_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
END IF;
END $$;