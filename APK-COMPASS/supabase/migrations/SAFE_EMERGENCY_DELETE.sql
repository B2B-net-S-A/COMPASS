-- SAFE EMERGENCY DELETE SCRIPT
-- Deletes user data ONLY if the tables match. No errors if tables are missing.
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
IF tgt_id IS NOT NULL THEN RAISE NOTICE 'Attempting to delete User ID: %',
tgt_id;
-- 1. Candidates (User confirmed this exists and blocks)
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'candidates'
) THEN
DELETE FROM candidates
WHERE user_id = tgt_id
    OR email = tgt_email;
END IF;
-- 2. Clean Dependencies (Only if table exists)
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'notifications'
) THEN
DELETE FROM notifications
WHERE user_id = tgt_id;
END IF;
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'contracts'
) THEN
DELETE FROM contracts
WHERE consultant_id = tgt_id
    OR created_by = tgt_id;
END IF;
-- Documents
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'app_documents'
) THEN
DELETE FROM app_documents
WHERE owner_id = tgt_id;
END IF;
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'document_versions'
) THEN
DELETE FROM document_versions
WHERE uploaded_by = tgt_id;
END IF;
-- Communicator
IF prof_id IS NOT NULL THEN IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'messages'
) THEN
DELETE FROM messages
WHERE sender_id = prof_id;
END IF;
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'conversation_participants'
) THEN
DELETE FROM conversation_participants
WHERE user_id = prof_id;
END IF;
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'conversations'
) THEN
DELETE FROM conversations
WHERE owner_id = prof_id;
END IF;
END IF;
-- Other
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'loyalty_transactions'
) THEN
DELETE FROM loyalty_transactions
WHERE user_id = tgt_id;
END IF;
IF EXISTS (
    SELECT
    FROM pg_tables
    WHERE tablename = 'centrala_benefit_declarations'
) THEN
DELETE FROM centrala_benefit_declarations
WHERE profile_id = tgt_id;
END IF;
-- 3. Delete Profile & User
DELETE FROM profiles
WHERE id = tgt_id;
DELETE FROM auth.users
WHERE id = tgt_id;
RAISE NOTICE 'SUCCESS: User deleted.';
ELSE RAISE NOTICE 'User not found.';
END IF;
END $$;