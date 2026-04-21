-- Create table for Project Referrals
CREATE TYPE referral_type AS ENUM ('external_person', 'self_referral');
CREATE TYPE referral_status AS ENUM (
    'new',
    'in_review',
    'accepted',
    'rejected',
    'hired',
    'withdrawn'
);
CREATE TYPE relationship_type AS ENUM (
    'coworker',
    'industry_contact',
    'former_project',
    'linkedin',
    'other'
);
CREATE TYPE engagement_type AS ENUM (
    'full_time',
    'half_time',
    '3_4_days',
    'to_be_discussed'
);
CREATE TYPE candidate_interested_status AS ENUM ('yes', 'no', 'not_asked');
CREATE TABLE IF NOT EXISTS public.project_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referral_type referral_type NOT NULL,
    status referral_status NOT NULL DEFAULT 'new',
    -- Path A: External Recommendation
    candidate_name VARCHAR(255),
    candidate_email VARCHAR(255),
    candidate_phone VARCHAR(50),
    candidate_linkedin VARCHAR(500),
    cv_file_url VARCHAR(1000),
    cv_file_name VARCHAR(255),
    relationship_type relationship_type,
    recommendation_note TEXT,
    candidate_interested candidate_interested_status,
    expected_rate DECIMAL(10, 2),
    gdpr_consent BOOLEAN DEFAULT FALSE,
    -- Path B: Self-referral
    desired_rate_min DECIMAL(10, 2),
    desired_rate_max DECIMAL(10, 2),
    available_from DATE,
    engagement_type engagement_type,
    cv_is_current BOOLEAN DEFAULT TRUE,
    self_referral_note TEXT,
    -- Admin fields
    rejection_reason TEXT,
    -- Meta
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    -- Restrictions
    UNIQUE(project_id, candidate_email) -- Deduplication on project level
);
-- RLS Policies
ALTER TABLE public.project_referrals ENABLE ROW LEVEL SECURITY;
-- 1. Referrers can view their own referrals
CREATE POLICY "Users can view their own referrals" ON public.project_referrals FOR
SELECT TO authenticated USING (auth.uid() = referrer_user_id);
-- 2. Admins can view all referrals
CREATE POLICY "Admins can view all referrals" ON public.project_referrals FOR
SELECT TO authenticated USING (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = auth.uid()
                AND role IN ('admin', 'consultant_manager')
        )
    );
-- 3. Referrers can submit referrals
CREATE POLICY "Users can submit referrals" ON public.project_referrals FOR
INSERT TO authenticated WITH CHECK (auth.uid() = referrer_user_id);
-- 4. Referrers can withdraw (update) their own referrals if status is 'new' or 'in_review'
CREATE POLICY "Users can withdraw their own referrals" ON public.project_referrals FOR
UPDATE TO authenticated USING (
        auth.uid() = referrer_user_id
        AND status IN ('new', 'in_review')
    ) WITH CHECK (
        auth.uid() = referrer_user_id
        AND status = 'withdrawn'
    );
-- 5. Admins can update status of all referrals
CREATE POLICY "Admins can update referrals" ON public.project_referrals FOR
UPDATE TO authenticated USING (
        EXISTS (
            SELECT 1
            FROM public.profiles
            WHERE id = auth.uid()
                AND role IN ('admin', 'consultant_manager')
        )
    );
-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now();
RETURN NEW;
END;
$$ language 'plpgsql';
CREATE TRIGGER update_project_referrals_updated_at BEFORE
UPDATE ON public.project_referrals FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();