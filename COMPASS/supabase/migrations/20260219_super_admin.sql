-- ============================================================
-- Migration: Super Admin + Admin access list
-- ============================================================
-- Introduces a distinction between:
-- - super_admin: hardcoded (Zbigniew, Igor), can manage admins
-- - administrator: managed by super_admins via admin_access_list
-- ============================================================

-- Table of administrators managed by super_admins
CREATE TABLE IF NOT EXISTS admin_access_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    added_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: only super_admins can read/write this table
ALTER TABLE admin_access_list ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read (the check for super_admin happens in app logic)
CREATE POLICY "Authenticated users can read admin_access_list"
ON admin_access_list FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to insert/update/delete (app enforces super_admin check)
CREATE POLICY "Authenticated users can modify admin_access_list"
ON admin_access_list FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
