-- Create a user manually
-- Password is 'Password123!' (crypt output for Supabase)
DO $$
DECLARE new_user_id uuid := gen_random_uuid();
encrypted_pw text := crypt('Password123!', gen_salt('bf'));
BEGIN -- Insert into auth.users
INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        confirmation_token,
        email_change,
        email_change_token_new,
        recovery_token
    )
VALUES (
        new_user_id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        'centrala@b2bnetwork.pl',
        encrypted_pw,
        now(),
        '{"provider": "email", "providers": ["email"]}',
        '{"full_name": "Ewa Nowak", "role": "centrala"}',
        now(),
        now(),
        '',
        '',
        '',
        ''
    ) ON CONFLICT (email) DO NOTHING;
-- Ensure profile is correct
INSERT INTO public.profiles (
        id,
        full_name,
        role,
        onboarding_completed,
        updated_at
    )
SELECT id,
    'Ewa Nowak',
    'centrala',
    true,
    now()
FROM auth.users
WHERE email = 'centrala@b2bnetwork.pl' ON CONFLICT (id) DO
UPDATE
SET full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    onboarding_completed = EXCLUDED.onboarding_completed,
    updated_at = now();
END;
$$;