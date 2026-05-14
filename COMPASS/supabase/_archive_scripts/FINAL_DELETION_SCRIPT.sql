-- FINAL FORCE DELETION SCRIPT
-- This script explicitly DELETES the blocking Candidate row.
DO $$
DECLARE tgt_email TEXT := 'zbigniew.twardowski@b2bnetwork.pl';
tgt_id UUID;
prof_id UUID;
BEGIN
SELECT id INTO tgt_id
FROM auth.users
WHERE email = tgt_email;
SELECT id INTO prof_id
FROM profiles
WHERE id = tgt_id;
IF tgt_id IS NOT NULL THEN RAISE NOTICE 'Deleting User ID: %',
tgt_id;
-- 1. DELETE CANDIDATE ROW (Primary Blocker)
-- We delete the ENTIRE candidate row because it's blocking user deletion
DELETE FROM candidates
WHERE user_id = tgt_id;
DELETE FROM candidates
WHERE email = tgt_email;
-- 2. Clean up other dependencies again (Just in case)
DELETE FROM notifications
WHERE user_id = tgt_id;
DELETE FROM contracts
WHERE consultant_id = tgt_id
    OR created_by = tgt_id;
DELETE FROM app_documents
WHERE owner_id = tgt_id;
DELETE FROM document_versions
WHERE uploaded_by = tgt_id;
DELETE FROM loyalty_transactions
WHERE user_id = tgt_id;
-- Centrala & Referrals
DELETE FROM centrala_benefit_declarations
WHERE profile_id = tgt_id;
DELETE FROM centrala_referrals
WHERE referrer_id = tgt_id;
DELETE FROM centrala_equipment_requests
WHERE profile_id = tgt_id;
DELETE FROM centrala_invoices
WHERE profile_id = tgt_id;
DELETE FROM project_referrals
WHERE referrer_user_id = tgt_id;
DELETE FROM favorite_projects
WHERE user_id = tgt_id;
DELETE FROM audit_logs
WHERE user_id = tgt_id;
-- Communicator
DELETE FROM messages
WHERE sender_id = prof_id;
DELETE FROM conversation_participants
WHERE user_id = prof_id;
DELETE FROM conversations
WHERE owner_id = prof_id;
-- 3. Delete Profile & User
DELETE FROM profiles
WHERE id = tgt_id;
DELETE FROM auth.users
WHERE id = tgt_id;
RAISE NOTICE 'User deleted successfully.';
ELSE RAISE NOTICE 'User not found.';
END IF;
END $$;