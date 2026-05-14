-- BLOCKBUSTER FIX (Naprawa Wszystkich 12 Blokad + Wymuszenie Usunięcia)
DO $$ BEGIN -- 1. NOTIFICATIONS
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'notifications'
) THEN
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
ALTER TABLE notifications
ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
END IF;
-- 2. CENTRALA TABLES
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'centrala_benefit_declarations'
) THEN
ALTER TABLE centrala_benefit_declarations DROP CONSTRAINT IF EXISTS centrala_benefit_declarations_profile_id_fkey;
ALTER TABLE centrala_benefit_declarations
ADD CONSTRAINT centrala_benefit_declarations_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
END IF;
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'centrala_referrals'
) THEN
ALTER TABLE centrala_referrals DROP CONSTRAINT IF EXISTS centrala_referrals_referrer_id_fkey;
ALTER TABLE centrala_referrals
ADD CONSTRAINT centrala_referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES profiles(id) ON DELETE CASCADE;
END IF;
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'centrala_equipment_requests'
) THEN
ALTER TABLE centrala_equipment_requests DROP CONSTRAINT IF EXISTS centrala_equipment_requests_profile_id_fkey;
ALTER TABLE centrala_equipment_requests
ADD CONSTRAINT centrala_equipment_requests_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
END IF;
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'centrala_invoices'
) THEN
ALTER TABLE centrala_invoices DROP CONSTRAINT IF EXISTS centrala_invoices_profile_id_fkey;
ALTER TABLE centrala_invoices
ADD CONSTRAINT centrala_invoices_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
END IF;
-- 3. DOCUMENT SYSTEM (Confirmed Blocker!)
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'app_documents'
) THEN
ALTER TABLE app_documents DROP CONSTRAINT IF EXISTS app_documents_owner_id_fkey;
ALTER TABLE app_documents
ADD CONSTRAINT app_documents_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE;
END IF;
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'document_versions'
) THEN
ALTER TABLE document_versions
ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE document_versions DROP CONSTRAINT IF EXISTS document_versions_uploaded_by_fkey;
ALTER TABLE document_versions
ADD CONSTRAINT document_versions_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES profiles(id) ON DELETE
SET NULL;
END IF;
-- 4. LOYALTY PROGRAM
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'loyalty_transactions'
) THEN
ALTER TABLE loyalty_transactions DROP CONSTRAINT IF EXISTS loyalty_transactions_user_id_fkey;
ALTER TABLE loyalty_transactions
ADD CONSTRAINT loyalty_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE;
END IF;
-- 5. MESSAGES & CONVERSATIONS
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'messages'
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
    WHERE tablename = 'conversations'
) THEN
ALTER TABLE conversations
ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_owner_id_fkey;
ALTER TABLE conversations
ADD CONSTRAINT conversations_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE
SET NULL;
END IF;
-- 6. CONTRACTS
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'contracts'
) THEN
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_created_by_fkey;
ALTER TABLE contracts
ADD CONSTRAINT contracts_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE
SET NULL;
END IF;
-- 7. REFERRALS & FAVORITES
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'project_referrals'
) THEN
ALTER TABLE project_referrals DROP CONSTRAINT IF EXISTS project_referrals_referrer_user_id_fkey;
ALTER TABLE project_referrals
ADD CONSTRAINT project_referrals_referrer_user_id_fkey FOREIGN KEY (referrer_user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
END IF;
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'favorite_projects'
) THEN
ALTER TABLE favorite_projects DROP CONSTRAINT IF EXISTS favorite_projects_user_id_fkey;
ALTER TABLE favorite_projects
ADD CONSTRAINT favorite_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
END IF;
-- 8. AUDIT LOGS
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'audit_logs'
) THEN
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_user_id_fkey;
ALTER TABLE audit_logs
ADD CONSTRAINT audit_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE
SET NULL;
END IF;
-- 9. LOGIN ATTEMPTS
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'login_attempts'
) THEN -- Usually no FK here, but check if user added one?
NULL;
END IF;
END $$;
-- 10. CORE REGISTRATION FIX
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