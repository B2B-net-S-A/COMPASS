-- EMERGENCY MANUAL DELETE SCRIPT
-- This script manually deletes ALL data for a specific user to force removal.
-- It bypasses foreign key constraints by deleting child records first.
DO $$
DECLARE target_email TEXT := 'zbigniew.twardowski@b2bnetwork.pl';
target_user_id UUID;
target_profile_id UUID;
BEGIN -- 1. Find the User
SELECT id INTO target_user_id
FROM auth.users
WHERE email = target_email;
IF target_user_id IS NULL THEN RAISE NOTICE 'User % not found.',
target_email;
RETURN;
END IF;
RAISE NOTICE 'Found User ID: %',
target_user_id;
-- 2. Find the Profile (if exists)
SELECT id INTO target_profile_id
FROM profiles
WHERE id = target_user_id;
-- 3. DELETE CHILD DATA (Dependencies)
-- Notifications
DELETE FROM notifications
WHERE user_id = target_user_id;
-- Verification Codes
DELETE FROM verification_codes
WHERE user_id = target_user_id;
-- Audit Logs
DELETE FROM audit_logs
WHERE user_id = target_user_id;
-- Login Attempts (by email)
DELETE FROM login_attempts
WHERE email = target_email;
-- Contracts (Created By or Consultant)
DELETE FROM contracts
WHERE created_by = target_user_id;
DELETE FROM contracts
WHERE consultant_id = target_user_id;
-- Project Referrals
DELETE FROM project_referrals
WHERE referrer_user_id = target_user_id;
-- Favorite Projects
DELETE FROM favorite_projects
WHERE user_id = target_user_id;
-- Centrala Access List
DELETE FROM centrala_access_list
WHERE added_by = target_user_id;
DELETE FROM centrala_access_list
WHERE email = target_email;
-- linked by email
-- Candidates (Linked by user_id)
UPDATE candidates
SET user_id = NULL
WHERE user_id = target_user_id;
-- IF PROFILE EXISTS, DELETE PROFILE DEPENDENCIES
IF target_profile_id IS NOT NULL THEN -- Document System
DELETE FROM document_versions
WHERE uploaded_by = target_profile_id;
DELETE FROM app_documents
WHERE owner_id = target_profile_id;
-- Messages & Conversations
DELETE FROM messages
WHERE sender_id = target_profile_id;
DELETE FROM conversation_participants
WHERE user_id = target_profile_id;
DELETE FROM conversations
WHERE owner_id = target_profile_id;
-- Loyalty
DELETE FROM loyalty_transactions
WHERE user_id = target_profile_id;
-- Centrala Tables
DELETE FROM centrala_benefit_declarations
WHERE profile_id = target_profile_id;
DELETE FROM centrala_referrals
WHERE referrer_id = target_profile_id;
DELETE FROM centrala_equipment_requests
WHERE profile_id = target_profile_id;
DELETE FROM centrala_invoices
WHERE profile_id = target_profile_id;
-- Finally Delete Profile
DELETE FROM profiles
WHERE id = target_profile_id;
END IF;
-- 4. DELETE USER
DELETE FROM auth.users
WHERE id = target_user_id;
RAISE NOTICE 'User % deleted successfully.',
target_email;
END $$;