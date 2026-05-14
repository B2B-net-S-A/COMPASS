-- CONFIRM EMAIL ADDRESS MANUALLY
-- Use this if you cannot access the email confirmation link.
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email = 'zbigniew.twardowski@b2bnetwork.pl';