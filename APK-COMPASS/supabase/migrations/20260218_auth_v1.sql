-- 1. Ensure Roles functionality
-- We assume 'role' column exists in profiles. We will add a check constraint for valid roles if not present.
DO $$ BEGIN
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles
ADD CONSTRAINT profiles_role_check CHECK (
        role IN (
            'consultant',
            'team_lead',
            'centrala',
            'administrator',
            'admin'
        )
    );
-- Keeping 'admin' for backward compatibility during migration
END $$;
-- 2. Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE
    SET NULL,
        action TEXT NOT NULL,
        -- 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'REGISTER', 'PASSWORD_RESET', 'ROLE_CHANGE', 'BLOCK_USER', 'UNBLOCK_USER', 'DELETE_USER', 'MFA_VERIFY'
        details JSONB,
        -- Flexible storage for details (e.g. target_user_id, reason, ip_address)
        ip_address TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Index for faster querying of logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
-- Enable RLS on audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
-- Policy: Administrators and Centrala can view audit logs
CREATE POLICY "Centrala and Admins can view audit logs" ON audit_logs FOR
SELECT USING (
        EXISTS (
            SELECT 1
            FROM profiles
            WHERE profiles.id = auth.uid()
                AND profiles.role IN ('centrala', 'administrator', 'admin')
        )
    );
-- Policy: System can insert logs (or verified users)
-- Since we usually insert via Service Role in server actions, RLS might not block us, 
-- but we should allow insert for authenticated users for self-actions if needed.
-- Ideally, usage of `postgres` or `service_role` bypasses RLS. 
-- For safety, let's allow insert for authenticated users (they can only log their own actions usually? 
-- actually audit logs are often system level).
-- We'll rely on Server Actions using Service Role for critical logs, or just allow Insert for auth users.
CREATE POLICY "Authenticated users can insert audit logs" ON audit_logs FOR
INSERT WITH CHECK (
        auth.uid() = user_id
        OR auth.uid() IS NOT NULL
    );
-- 3. Login Attempts Table (for Rate Limiting)
CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    attempt_time TIMESTAMPTZ DEFAULT NOW(),
    success BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_ip ON login_attempts(email, ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(attempt_time);
-- 4. Verification Codes (for Custom MFA)
CREATE TABLE IF NOT EXISTS verification_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    type TEXT NOT NULL,
    -- 'MFA', 'PASSWORD_RESET'
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id ON verification_codes(user_id);
-- 5. Centrala List (for Administrator to manage who gets Centrala role)
-- This table stores emails that SHOULD have Centrala role.
CREATE TABLE IF NOT EXISTS centrala_access_list (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    added_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- Enable RLS
ALTER TABLE centrala_access_list ENABLE ROW LEVEL SECURITY;
-- Only Administrators can manage this list
CREATE POLICY "Administrators can manage centrala access list" ON centrala_access_list USING (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid()
            AND profiles.role IN ('administrator', 'admin')
    )
);
-- 6. Initial Master Admin Seed (Optional - executed conditionally)
-- We cannot easily seed users here because auth.users is protected. 
-- But we can seed the centrala_access_list if needed.