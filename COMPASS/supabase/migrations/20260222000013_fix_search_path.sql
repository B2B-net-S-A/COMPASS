-- Fix: Supabase linter warning "function_search_path_mutable"
-- All 3 functions get SET search_path = '' to prevent search_path injection attacks.

-- 1. candidates_search_vector_update
CREATE OR REPLACE FUNCTION public.candidates_search_vector_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := to_tsvector('simple',
        COALESCE(NEW.full_name, '') || ' ' ||
        COALESCE(NEW.bio, '') || ' ' ||
        COALESCE(NEW.email, '') || ' ' ||
        array_to_string(COALESCE(NEW.skills, '{}'), ' ')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

-- 2. handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, gdpr_consent)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'avatar_url',
        COALESCE((NEW.raw_user_meta_data->>'gdpr_consent')::boolean, false)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';

-- 3. sync_profile_to_candidate
CREATE OR REPLACE FUNCTION public.sync_profile_to_candidate() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.candidates (
        user_id, email, full_name, bio, skills, experience_years,
        current_status, capacity_percentage, project_sentiment,
        verifier_status, ambassador_status, sales_support_status,
        previous_clients, avatar_url, cv_url, embedding,
        available_from, fte_status, max_monthly_hours,
        candidate_status, source, updated_at
    ) VALUES (
        NEW.id, NEW.email, NEW.full_name, NEW.bio, NEW.skills,
        NEW.experience_years, NEW.current_status, NEW.capacity_percentage,
        NEW.project_sentiment, NEW.verifier_status, NEW.ambassador_status,
        NEW.sales_support_status, NEW.previous_clients, NEW.avatar_url,
        NEW.cv_url, NEW.embedding, NEW.available_from, NEW.fte_status,
        NEW.max_monthly_hours, 'konsultant', 'self_registration', NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        email = EXCLUDED.email,
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
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = '';
