-- FIX AND ENABLE SYNC (v3)
-- This script fixes schema, ensures UNIQUE constraint on user_id, and re-enables sync.
-- 1. Enable Vector Extension (for embeddings)
CREATE EXTENSION IF NOT EXISTS vector;
-- 2. Clean up duplicates (Just in case)
DELETE FROM candidates a USING candidates b
WHERE a.id < b.id
    AND a.user_id = b.user_id;
-- 3. Ensure user_id is UNIQUE (Critical for ON CONFLICT)
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'candidates_user_id_key'
) THEN
ALTER TABLE candidates
ADD CONSTRAINT candidates_user_id_key UNIQUE (user_id);
END IF;
END $$;
-- 4. Fix PROFILES Table (Add missing updated_at)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
-- 5. Fix CANDIDATES Table (Add ALL possible columns from Profile)
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS bio TEXT,
    ADD COLUMN IF NOT EXISTS skills TEXT [] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'open',
    ADD COLUMN IF NOT EXISTS capacity_percentage INTEGER DEFAULT 100,
    ADD COLUMN IF NOT EXISTS project_sentiment TEXT DEFAULT 'neutral',
    ADD COLUMN IF NOT EXISTS verifier_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS ambassador_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS sales_support_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS previous_clients TEXT [] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS cv_url TEXT,
    ADD COLUMN IF NOT EXISTS embedding VECTOR(1536),
    -- Assuming OpenAI embedding size
ADD COLUMN IF NOT EXISTS available_from DATE,
    ADD COLUMN IF NOT EXISTS fte_status TEXT DEFAULT 'available',
    ADD COLUMN IF NOT EXISTS max_monthly_hours INTEGER DEFAULT 160,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
-- 6. Recreate Sync Function
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
-- 7. Re-enable Triggers
DROP TRIGGER IF EXISTS on_profile_update_sync_candidate ON public.profiles;
CREATE TRIGGER on_profile_update_sync_candidate
AFTER
UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_profile_to_candidate();
DROP TRIGGER IF EXISTS on_profile_insert_sync_candidate ON public.profiles;
CREATE TRIGGER on_profile_insert_sync_candidate
AFTER
INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_profile_to_candidate();
-- 8. Force Sync for You (Now verified)
UPDATE profiles
SET updated_at = NOW()
WHERE email = 'zbigniew.twardowski@b2bnetwork.pl';