-- ============================================================
-- MIGRATION: Create missing tables for ComPass/AK-Qualrix
-- Date: 2026-02-19
-- Tables: audit_logs, compass_assist_tickets, loyalty_transactions, verification_codes
-- ============================================================

-- ============================================================
-- 1. AUDIT_LOGS - Logi audytowe (login, MFA, role changes)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    ip_address TEXT DEFAULT 'unknown',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all audit logs
CREATE POLICY "Admins can read audit logs" ON audit_logs
    FOR SELECT TO authenticated
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'administrator', 'centrala')
    );

-- Authenticated users can insert audit logs (system writes)
CREATE POLICY "Authenticated can insert audit logs" ON audit_logs
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Index for querying by user and date
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================
-- 2. COMPASS_ASSIST_TICKETS - Zgłoszenia z AI asystenta
-- ============================================================
CREATE TABLE IF NOT EXISTS compass_assist_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    chat_id TEXT,
    category TEXT NOT NULL,
    summary TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    priority TEXT NOT NULL DEFAULT 'normal',
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE compass_assist_tickets ENABLE ROW LEVEL SECURITY;

-- Users can read their own tickets
CREATE POLICY "Users can read own tickets" ON compass_assist_tickets
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());

-- Users can create tickets
CREATE POLICY "Users can create tickets" ON compass_assist_tickets
    FOR INSERT TO authenticated
    WITH CHECK (profile_id = auth.uid());

-- Admins can manage all tickets
CREATE POLICY "Admins can manage all tickets" ON compass_assist_tickets
    FOR ALL TO authenticated
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'administrator', 'centrala')
    )
    WITH CHECK (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'administrator', 'centrala')
    );

CREATE INDEX IF NOT EXISTS idx_tickets_profile_id ON compass_assist_tickets(profile_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON compass_assist_tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON compass_assist_tickets(created_at DESC);

-- ============================================================
-- 3. LOYALTY_TRANSACTIONS - Historia transakcji punktów
-- ============================================================
CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    points INTEGER NOT NULL,
    source_type TEXT NOT NULL,
    description TEXT,
    source_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- Users can read their own transactions
CREATE POLICY "Users can read own loyalty transactions" ON loyalty_transactions
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- Admins can manage all transactions
CREATE POLICY "Admins can manage loyalty transactions" ON loyalty_transactions
    FOR ALL TO authenticated
    USING (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'administrator', 'centrala')
    )
    WITH CHECK (
        (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'administrator', 'centrala')
    );

CREATE INDEX IF NOT EXISTS idx_loyalty_tx_user_id ON loyalty_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_created_at ON loyalty_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loyalty_tx_source_type ON loyalty_transactions(source_type);

-- Trigger: Auto-update profile loyalty_points after transaction
CREATE OR REPLACE FUNCTION update_loyalty_points()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE profiles
    SET loyalty_points = COALESCE(loyalty_points, 0) + NEW.points
    WHERE id = NEW.user_id;

    -- Auto-update tier based on points
    UPDATE profiles
    SET loyalty_tier = CASE
        WHEN COALESCE(loyalty_points, 0) + NEW.points >= 6000 THEN 'platinum'
        WHEN COALESCE(loyalty_points, 0) + NEW.points >= 2000 THEN 'gold'
        WHEN COALESCE(loyalty_points, 0) + NEW.points >= 500 THEN 'silver'
        ELSE 'bronze'
    END
    WHERE id = NEW.user_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_update_loyalty_points ON loyalty_transactions;
CREATE TRIGGER trg_update_loyalty_points
    AFTER INSERT ON loyalty_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_loyalty_points();

-- ============================================================
-- 4. VERIFICATION_CODES - Kody MFA
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'MFA',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE verification_codes ENABLE ROW LEVEL SECURITY;

-- Users can read their own codes (for verification)
CREATE POLICY "Users can read own verification codes" ON verification_codes
    FOR SELECT TO authenticated
    USING (user_id = auth.uid());

-- System can insert codes
CREATE POLICY "Authenticated can insert verification codes" ON verification_codes
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- System can update codes (mark as used)
CREATE POLICY "Authenticated can update own verification codes" ON verification_codes
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_verification_codes_user_id ON verification_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_verification_codes_expires_at ON verification_codes(expires_at);

-- Auto-cleanup expired codes (optional: run periodically)
-- DELETE FROM verification_codes WHERE expires_at < now() - interval '1 hour';

-- ============================================================
-- 5. Ensure loyalty columns exist on profiles
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'loyalty_points') THEN
        ALTER TABLE profiles ADD COLUMN loyalty_points INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'loyalty_tier') THEN
        ALTER TABLE profiles ADD COLUMN loyalty_tier TEXT DEFAULT 'bronze';
    END IF;
END $$;
