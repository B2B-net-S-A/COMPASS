-- CHECK USER STATUS
-- Use this to see if the user exists and what role they have.
SELECT u.id as user_id,
    u.email,
    u.email_confirmed_at,
    p.role as profile_role
FROM auth.users u
    LEFT JOIN profiles p ON u.id = p.id
WHERE u.email = 'zbigniew.twardowski@b2bnetwork.pl';