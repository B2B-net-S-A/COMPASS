-- ASSIGN ADMIN ROLES
-- Updates existing users to 'administrator' role based on email list.
DO $$
DECLARE admin_emails TEXT [] := ARRAY [
        'zbigniew.twardowski@b2bnetwork.pl',
        'artur.twardowski@b2bnetwork.pl',
        'igor.twardowski@b2bnetwork.pl',
        'marta.kozarzewska@b2bnetwork.pl'
    ];
target_email TEXT;
BEGIN FOREACH target_email IN ARRAY admin_emails LOOP -- Update Profile Role if user exists
UPDATE profiles
SET role = 'administrator'
FROM auth.users
WHERE profiles.id = auth.users.id
    AND auth.users.email = target_email;
-- Also try to add to Centrala List (optional, good for records)
INSERT INTO centrala_access_list (email)
VALUES (target_email) ON CONFLICT (email) DO NOTHING;
RAISE NOTICE 'Processed Admin: %',
target_email;
END LOOP;
END $$;