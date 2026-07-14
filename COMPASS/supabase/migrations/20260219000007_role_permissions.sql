-- ============================================================
-- Migration: Role Permissions Table
-- Date: 2026-02-19
-- Description: Per-role feature access configuration table,
--   editable by Administrator through the Settings panel.
--   Administrator always has full access (not stored here).
--   Roles stored: recruiter, delivery_lead, finance, consultant
--   Values: 'true' | 'false' | 'portfolio' | 'full' | 'readonly'
-- ============================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role TEXT NOT NULL,
    feature TEXT NOT NULL,
    value TEXT NOT NULL DEFAULT 'false',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by UUID REFERENCES profiles(id),
    UNIQUE(role, feature)
);
-- Indexes
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
-- RLS
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
-- Admins manage everything
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'role_permissions'
        AND policyname = 'Admins manage role permissions'
) THEN CREATE POLICY "Admins manage role permissions" ON role_permissions FOR ALL USING (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'admin')
    )
);
END IF;
END $$;
-- All authenticated users can read permissions (needed to enforce them client-side)
DO $$ BEGIN IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE tablename = 'role_permissions'
        AND policyname = 'Authenticated users read permissions'
) THEN CREATE POLICY "Authenticated users read permissions" ON role_permissions FOR
SELECT USING (auth.uid() IS NOT NULL);
END IF;
END $$;
-- ============================================================
-- Default permissions
-- ============================================================
INSERT INTO role_permissions (role, feature, value)
VALUES -- RECRUITER
    ('recruiter', 'dashboard', 'true'),
    ('recruiter', 'projects', 'portfolio'),
    ('recruiter', 'candidates', 'portfolio'),
    ('recruiter', 'service_hub', 'true'),
    ('recruiter', 'messages', 'true'),
    ('recruiter', 'documents', 'true'),
    ('recruiter', 'loyalty', 'true'),
    ('recruiter', 'development', 'true'),
    ('recruiter', 'import', 'false'),
    ('recruiter', 'referrals', 'true'),
    ('recruiter', 'ai_assistant', 'portfolio'),
    ('recruiter', 'settings', 'false'),
    -- DELIVERY LEAD
    ('delivery_lead', 'dashboard', 'true'),
    ('delivery_lead', 'projects', 'portfolio'),
    ('delivery_lead', 'candidates', 'portfolio'),
    ('delivery_lead', 'service_hub', 'true'),
    ('delivery_lead', 'messages', 'true'),
    ('delivery_lead', 'documents', 'true'),
    ('delivery_lead', 'loyalty', 'true'),
    ('delivery_lead', 'development', 'true'),
    ('delivery_lead', 'import', 'false'),
    ('delivery_lead', 'referrals', 'true'),
    ('delivery_lead', 'ai_assistant', 'portfolio'),
    ('delivery_lead', 'settings', 'false'),
    -- FINANCE
    ('finance', 'dashboard', 'true'),
    ('finance', 'projects', 'full'),
    ('finance', 'candidates', 'readonly'),
    ('finance', 'service_hub', 'true'),
    ('finance', 'messages', 'true'),
    ('finance', 'documents', 'true'),
    ('finance', 'loyalty', 'true'),
    ('finance', 'development', 'true'),
    ('finance', 'import', 'false'),
    ('finance', 'referrals', 'true'),
    ('finance', 'ai_assistant', 'portfolio'),
    ('finance', 'settings', 'false'),
    -- CONSULTANT
    ('consultant', 'dashboard', 'true'),
    ('consultant', 'projects', 'full'),
    ('consultant', 'candidates', 'false'),
    ('consultant', 'service_hub', 'true'),
    ('consultant', 'messages', 'true'),
    ('consultant', 'documents', 'true'),
    ('consultant', 'loyalty', 'true'),
    ('consultant', 'development', 'true'),
    ('consultant', 'import', 'false'),
    ('consultant', 'referrals', 'true'),
    ('consultant', 'ai_assistant', 'full'),
    ('consultant', 'settings', 'false') ON CONFLICT (role, feature) DO NOTHING;