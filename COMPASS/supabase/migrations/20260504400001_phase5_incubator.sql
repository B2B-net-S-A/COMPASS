-- ============================================================
-- Phase 5 — Inkubator (pitches + internal projects + applications)
-- Date: 2026-05-04
--
-- 3 tables:
--   incubator_pitches    — flow A: konsultant zgłasza pomysł, NDA-gated
--   incubator_projects   — flow B: admin wystawia wewnętrzny projekt
--   incubator_applications — konsultant aplikuje do internal project
--
-- RLS:
--   pitches: submitter + reviewer + admin (NDA must be accepted on insert)
--   projects: open/in_progress visible to all auth; admin write
--   applications: applicant + admin
--
-- Notification CHECK extended.
-- Idempotent.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS incubator_pitches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submitter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    description_md TEXT NOT NULL,
    attachment_urls TEXT[] DEFAULT '{}',
    equity_ask TEXT,
    investment_ask_pln INTEGER,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','under_review','in_negotiation','accepted','rejected')),
    nda_accepted_at TIMESTAMPTZ NOT NULL,
    reviewer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    review_notes_md TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incubator_pitches_submitter ON incubator_pitches(submitter_id, status);
CREATE INDEX IF NOT EXISTS idx_incubator_pitches_status ON incubator_pitches(status);

CREATE TABLE IF NOT EXISTS incubator_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES profiles(id),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description_md TEXT NOT NULL,
    tech_stack TEXT[] DEFAULT '{}',
    compensation_model TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','cancelled')),
    opens_at TIMESTAMPTZ,
    closes_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incubator_projects_status ON incubator_projects(status);

CREATE TABLE IF NOT EXISTS incubator_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES incubator_projects(id) ON DELETE CASCADE,
    applicant_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    motivation_md TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','shortlisted','accepted','rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS idx_incubator_applications_project ON incubator_applications(project_id, status);
CREATE INDEX IF NOT EXISTS idx_incubator_applications_applicant ON incubator_applications(applicant_id);

DROP TRIGGER IF EXISTS incubator_pitches_updated_at ON incubator_pitches;
CREATE TRIGGER incubator_pitches_updated_at BEFORE UPDATE ON incubator_pitches
    FOR EACH ROW EXECUTE FUNCTION public.support_set_updated_at();

DROP TRIGGER IF EXISTS incubator_projects_updated_at ON incubator_projects;
CREATE TRIGGER incubator_projects_updated_at BEFORE UPDATE ON incubator_projects
    FOR EACH ROW EXECUTE FUNCTION public.support_set_updated_at();

DROP TRIGGER IF EXISTS incubator_applications_updated_at ON incubator_applications;
CREATE TRIGGER incubator_applications_updated_at BEFORE UPDATE ON incubator_applications
    FOR EACH ROW EXECUTE FUNCTION public.support_set_updated_at();

ALTER TABLE incubator_pitches ENABLE ROW LEVEL SECURITY;
ALTER TABLE incubator_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE incubator_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "incubator_pitches_select_own_or_admin" ON incubator_pitches;
CREATE POLICY "incubator_pitches_select_own_or_admin" ON incubator_pitches
    FOR SELECT TO authenticated
    USING (submitter_id = auth.uid() OR reviewer_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "incubator_pitches_insert_own_with_nda" ON incubator_pitches;
CREATE POLICY "incubator_pitches_insert_own_with_nda" ON incubator_pitches
    FOR INSERT TO authenticated
    WITH CHECK (submitter_id = auth.uid() AND nda_accepted_at IS NOT NULL);

DROP POLICY IF EXISTS "incubator_pitches_update_own_or_admin" ON incubator_pitches;
CREATE POLICY "incubator_pitches_update_own_or_admin" ON incubator_pitches
    FOR UPDATE TO authenticated
    USING (submitter_id = auth.uid() OR is_admin())
    WITH CHECK (submitter_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "incubator_pitches_delete_admin" ON incubator_pitches;
CREATE POLICY "incubator_pitches_delete_admin" ON incubator_pitches
    FOR DELETE TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "incubator_projects_select_open_or_admin" ON incubator_projects;
CREATE POLICY "incubator_projects_select_open_or_admin" ON incubator_projects
    FOR SELECT TO authenticated USING (status IN ('open','in_progress') OR is_admin());

DROP POLICY IF EXISTS "incubator_projects_admin_write" ON incubator_projects;
CREATE POLICY "incubator_projects_admin_write" ON incubator_projects
    FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "incubator_applications_select_own_or_admin" ON incubator_applications;
CREATE POLICY "incubator_applications_select_own_or_admin" ON incubator_applications
    FOR SELECT TO authenticated USING (applicant_id = auth.uid() OR is_admin());

DROP POLICY IF EXISTS "incubator_applications_insert_own" ON incubator_applications;
CREATE POLICY "incubator_applications_insert_own" ON incubator_applications
    FOR INSERT TO authenticated WITH CHECK (applicant_id = auth.uid());

DROP POLICY IF EXISTS "incubator_applications_update_admin" ON incubator_applications;
CREATE POLICY "incubator_applications_update_admin" ON incubator_applications
    FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'contract_ending', 'health_score_low', 'new_project_match',
        'loyalty_tier_up', 'referral_update', 'document_uploaded',
        'system_announcement', 'payment_received', 'course_completed',
        'course_approved', 'course_rejected',
        'support_ticket_assigned', 'support_ticket_replied', 'support_ticket_resolved',
        'news_published',
        'incubator_pitch_status_changed', 'incubator_application_received', 'incubator_application_status_changed'
    ));

COMMIT;
