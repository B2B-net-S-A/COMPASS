-- FINAL MASTER REPAIR SCRIPT (Fixes Not-Null Constraints + Deletion + Schema)
DO $$ BEGIN -- 1. FIX NOT-NULL CONSTRAINTS (Communicator - Messages)
-- Problem: messages.sender_id is NOT NULL, preventing deletion if we use SET NULL
-- Solution: Allow NULL sender_id
EXECUTE 'ALTER TABLE messages ALTER COLUMN sender_id DROP NOT NULL';
-- Conversations: Ensure owner_id is NULLable
EXECUTE 'ALTER TABLE conversations ALTER COLUMN owner_id DROP NOT NULL';
EXCEPTION
WHEN OTHERS THEN -- If table doesn't exist, ignore error (Safe mechanism)
RAISE NOTICE 'Skipping table modification as table might not exist: %',
SQLERRM;
END $$;
-- 2. RE-APPLY CONSTRAINTS (For Deletion)
DO $$ BEGIN -- Communicator: Messages
-- Drop old constraint first to be safe
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'messages'
) THEN
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
-- Now apply SET NULL (since we made column nullable above)
ALTER TABLE messages
ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE
SET NULL;
END IF;
-- Communicator: Conversations
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
-- Contracts
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
-- Centrala Access List
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
END $$;
-- 3. ENSURE CORE COLUMNS (Registration Fix)
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