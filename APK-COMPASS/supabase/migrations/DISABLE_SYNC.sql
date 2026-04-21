-- DISABLE SYNC TRIGGER (Temporary Fix for Registration)
-- This script removes the trigger that copies data to Candidates table.
-- This will allow registration to succeed even if Candidates table is broken.
DROP TRIGGER IF EXISTS on_profile_insert_sync_candidate ON public.profiles;
DROP TRIGGER IF EXISTS on_profile_update_sync_candidate ON public.profiles;
-- Ensure handle_new_user exists and is simple
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger AS $$ BEGIN
INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
VALUES (
        new.id,
        new.email,
        new.raw_user_meta_data->>'full_name',
        new.raw_user_meta_data->>'avatar_url',
        'consultant'
    ) ON CONFLICT (id) DO NOTHING;
RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;