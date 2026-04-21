-- Email Notifications System
-- Creates tables for system settings and benefit declarations
-- ============================================================
-- SYSTEM SETTINGS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_by UUID REFERENCES profiles(id)
);
-- Enable RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
-- Only admins can read/write system settings
CREATE POLICY "Admins can manage system settings" ON system_settings FOR ALL USING (
    (
        SELECT role
        FROM profiles
        WHERE id = auth.uid()
    ) IN ('admin', 'administrator', 'centrala')
);
-- Insert default notification email
INSERT INTO system_settings (key, value, description)
VALUES (
        'notification_email',
        'biurko2015@gmail.com',
        'Email address for equipment and benefit request notifications'
    ) ON CONFLICT (key) DO NOTHING;
-- ============================================================
-- BENEFIT DECLARATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS benefit_declarations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    benefit_type TEXT NOT NULL CHECK (benefit_type IN ('medical', 'sport')),
    variant_name TEXT NOT NULL,
    -- 'KOMFORT', 'OPTIMUM', 'KOMFORT PLUS', etc.
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE
);
-- Enable RLS
ALTER TABLE benefit_declarations ENABLE ROW LEVEL SECURITY;
-- Users can view their own declarations
CREATE POLICY "Users can view own benefit declarations" ON benefit_declarations FOR
SELECT USING (auth.uid() = profile_id);
-- Users can insert their own declarations
CREATE POLICY "Users can insert own benefit declarations" ON benefit_declarations FOR
INSERT WITH CHECK (auth.uid() = profile_id);
-- Admins can view and manage all declarations
CREATE POLICY "Admins can manage all benefit declarations" ON benefit_declarations FOR ALL USING (
    (
        SELECT role
        FROM profiles
        WHERE id = auth.uid()
    ) IN ('admin', 'administrator', 'centrala')
);
-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_benefit_declarations_profile_id ON benefit_declarations(profile_id);
CREATE INDEX IF NOT EXISTS idx_benefit_declarations_status ON benefit_declarations(status);