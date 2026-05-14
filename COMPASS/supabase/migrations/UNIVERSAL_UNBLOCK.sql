-- UNIVERSAL UNBLOCK SCRIPT (The Real Master Fix)
-- This script unblocks deletion for ALL tables found in the codebase.
DO $$ BEGIN -- 1. DOCUMENT SYSTEM (Critical Blocker Found)
-- app_documents: uploaded_by/owner_id
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'app_documents'
) THEN
ALTER TABLE app_documents DROP CONSTRAINT IF EXISTS app_documents_owner_id_fkey;
ALTER TABLE app_documents
ADD CONSTRAINT app_documents_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
END IF;
-- document_versions: uploaded_by
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'document_versions'
) THEN
ALTER TABLE document_versions DROP CONSTRAINT IF EXISTS document_versions_uploaded_by_fkey;
-- Allow NULL or Cascade. Let's start with Cascade to be sure.
ALTER TABLE document_versions DROP CONSTRAINT IF EXISTS document_versions_uploaded_by_check;
-- if any
ALTER TABLE document_versions
ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE document_versions
ADD CONSTRAINT document_versions_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE
SET NULL;
END IF;
-- 2. LOYALTY PROGRAM
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'loyalty_transactions'
) THEN
ALTER TABLE loyalty_transactions DROP CONSTRAINT IF EXISTS loyalty_transactions_user_id_fkey;
ALTER TABLE loyalty_transactions
ADD CONSTRAINT loyalty_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
END IF;
-- 3. COMMUNICATOR (Messages/Conversations)
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'messages'
) THEN
ALTER TABLE messages
ALTER COLUMN sender_id DROP NOT NULL;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_sender_id_fkey;
ALTER TABLE messages
ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES profiles(id) ON DELETE
SET NULL;
END IF;
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'conversations'
) THEN
ALTER TABLE conversations
ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_owner_id_fkey;
ALTER TABLE conversations
ADD CONSTRAINT conversations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE
SET NULL;
END IF;
-- 4. CONTRACTS
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
-- 5. CENTRALA ACCESS LIST
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
-- 6. FAVORITE PROJECTS
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
-- 7. PROJECT REFERRALS
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'project_referrals'
) THEN
ALTER TABLE project_referrals DROP CONSTRAINT IF EXISTS project_referrals_referrer_user_id_fkey;
ALTER TABLE project_referrals
ADD CONSTRAINT project_referrals_referrer_user_id_fkey FOREIGN KEY (referrer_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
END IF;
-- 8. AUDIT LOGS
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE schemaname = 'public'
        AND tablename = 'audit_logs'
) THEN
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE audit_logs
ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE
SET NULL;
END IF;
END $$;
-- 9. CORE SCHEMA FIX (For Registration)
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