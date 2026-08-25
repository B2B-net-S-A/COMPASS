-- Trigger function to sync profiles to candidates
CREATE OR REPLACE FUNCTION public.sync_profile_to_candidate() RETURNS TRIGGER AS $$ BEGIN
INSERT INTO public.candidates (
        user_id,
        email,
        full_name,
        bio,
        skills,
        experience_years,
        current_status,
        capacity_percentage,
        project_sentiment,
        verifier_status,
        ambassador_status,
        sales_support_status,
        previous_clients,
        avatar_url,
        cv_url,
        embedding,
        available_from,
        fte_status,
        max_monthly_hours,
        updated_at
    )
VALUES (
        NEW.id,
        NEW.email,
        NEW.full_name,
        NEW.bio,
        NEW.skills,
        NEW.experience_years,
        NEW.current_status,
        NEW.capacity_percentage,
        NEW.project_sentiment,
        NEW.verifier_status,
        NEW.ambassador_status,
        NEW.sales_support_status,
        NEW.previous_clients,
        NEW.avatar_url,
        NEW.cv_url,
        NEW.embedding,
        NEW.available_from,
        NEW.fte_status,
        NEW.max_monthly_hours,
        NOW()
    ) ON CONFLICT (user_id) DO
UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    bio = EXCLUDED.bio,
    skills = EXCLUDED.skills,
    experience_years = EXCLUDED.experience_years,
    current_status = EXCLUDED.current_status,
    capacity_percentage = EXCLUDED.capacity_percentage,
    project_sentiment = EXCLUDED.project_sentiment,
    verifier_status = EXCLUDED.verifier_status,
    ambassador_status = EXCLUDED.ambassador_status,
    sales_support_status = EXCLUDED.sales_support_status,
    previous_clients = EXCLUDED.previous_clients,
    avatar_url = EXCLUDED.avatar_url,
    cv_url = EXCLUDED.cv_url,
    embedding = EXCLUDED.embedding,
    available_from = EXCLUDED.available_from,
    fte_status = EXCLUDED.fte_status,
    max_monthly_hours = EXCLUDED.max_monthly_hours,
    updated_at = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- Create Trigger
DROP TRIGGER IF EXISTS on_profile_update_sync_candidate ON public.profiles;
CREATE TRIGGER on_profile_update_sync_candidate
AFTER
UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_profile_to_candidate();
-- Also sync on Insert (for handle_new_user)
DROP TRIGGER IF EXISTS on_profile_insert_sync_candidate ON public.profiles;
CREATE TRIGGER on_profile_insert_sync_candidate
AFTER
INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_profile_to_candidate();