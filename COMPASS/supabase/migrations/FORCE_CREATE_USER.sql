-- FORCE CREATE USER (Bypass Rate Limits)
-- This script creates the user directly with a pre-hashed password.
-- Default Password: Password123!
-- You MUST have pgcrypto extension enabled.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$
DECLARE new_user_id UUID;
eml TEXT := 'zbigniew.twardowski@b2bnetwork.pl';
pw_hash TEXT;
BEGIN -- 1. Check if user already exists
IF EXISTS (
    SELECT 1
    FROM auth.users
    WHERE email = eml
) THEN RAISE NOTICE 'User % already exists. Skipping creation.',
eml;
RETURN;
END IF;
-- 2. Generate new ID and hash password ('Password123!')
new_user_id := gen_random_uuid();
pw_hash := crypt('Password123!', gen_salt('bf'));
-- 3. Insert into auth.users (Using hardcoded instance_id for local/hosted default)
INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        recovery_sent_at,
        last_sign_in_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        created_at,
        updated_at,
        phone,
        phone_confirmed_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    )
VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_user_id,
        'authenticated',
        'authenticated',
        eml,
        pw_hash,
        NOW(),
        NOW(),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        '{"full_name":"Zbigniew Twardowski"}',
        FALSE,
        NOW(),
        NOW(),
        NULL,
        NULL,
        '',
        '',
        '',
        ''
    );
-- 4. Insert into public.profiles (Ensure Admin Role)
INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        current_status,
        skills,
        experience_years
    )
VALUES (
        new_user_id,
        eml,
        'Zbigniew Twardowski',
        'administrator',
        'open',
        '{}',
        0
    ) ON CONFLICT (id) DO
UPDATE
SET role = 'administrator',
    email = EXCLUDED.email;
RAISE NOTICE 'User created successfully with ID: %',
new_user_id;
RAISE NOTICE 'Temporary Password: Password123!';
END $$;