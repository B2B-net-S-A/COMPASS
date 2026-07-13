-- Drop Triggers created for Registration 2.0
DROP TRIGGER IF EXISTS on_profile_update_sync_candidate ON public.profiles;
DROP TRIGGER IF EXISTS on_profile_insert_sync_candidate ON public.profiles;
-- Drop Function
DROP FUNCTION IF EXISTS public.sync_profile_to_candidate();