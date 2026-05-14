-- INSPECT USER
-- Check the details of the manually created user to find anomalies.
SELECT id,
    instance_id,
    aud,
    role,
    email,
    email_confirmed_at,
    encrypted_password,
    raw_app_meta_data,
    raw_user_meta_data
FROM auth.users
WHERE email = 'zbigniew.twardowski@b2bnetwork.pl';