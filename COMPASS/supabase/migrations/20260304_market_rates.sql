-- Market rates and rate verification tables for Stawki module
-- ROLLBACK: DROP TABLE IF EXISTS rate_verifications; DROP TABLE IF EXISTS market_rates;

-- Baza stawek rynkowych (uploadowana przez Administratora)
CREATE TABLE IF NOT EXISTS market_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    position_title TEXT NOT NULL,
    category TEXT,
    seniority TEXT,
    rate_min DECIMAL(10, 2) NOT NULL,
    rate_median DECIMAL(10, 2),
    rate_max DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'PLN',
    rate_type TEXT DEFAULT 'monthly_gross_uop',
    source TEXT,
    region TEXT DEFAULT 'Polska',
    valid_from DATE,
    valid_to DATE,
    tags TEXT[],
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Historia weryfikacji stawek
CREATE TABLE IF NOT EXISTS rate_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    verified_by UUID REFERENCES auth.users(id) NOT NULL,
    position_title TEXT NOT NULL,
    profile_description TEXT,
    expected_rate DECIMAL(10, 2) NOT NULL,
    currency TEXT DEFAULT 'PLN',
    rate_type TEXT DEFAULT 'hourly',
    market_rate_min DECIMAL(10, 2),
    market_rate_max DECIMAL(10, 2),
    market_rate_median DECIMAL(10, 2),
    market_sources TEXT[],
    compass_rate_min DECIMAL(10, 2),
    compass_rate_max DECIMAL(10, 2),
    compass_rate_avg DECIMAL(10, 2),
    compass_sample_size INT DEFAULT 0,
    verdict TEXT CHECK (verdict IN ('below_market', 'within_market', 'above_market')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE market_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_verifications ENABLE ROW LEVEL SECURITY;

-- market_rates: admins and centrala can read, only admins can write
DROP POLICY IF EXISTS "market_rates_select" ON market_rates;
CREATE POLICY "market_rates_select" ON market_rates FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('administrator', 'admin', 'centrala')
    )
);

DROP POLICY IF EXISTS "market_rates_insert" ON market_rates;
CREATE POLICY "market_rates_insert" ON market_rates FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('administrator', 'admin')
    )
);

DROP POLICY IF EXISTS "market_rates_update" ON market_rates;
CREATE POLICY "market_rates_update" ON market_rates FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('administrator', 'admin')
    )
);

DROP POLICY IF EXISTS "market_rates_delete" ON market_rates;
CREATE POLICY "market_rates_delete" ON market_rates FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('administrator', 'admin')
    )
);

-- rate_verifications: admins and centrala can read/write their own
DROP POLICY IF EXISTS "rate_verifications_select" ON rate_verifications;
CREATE POLICY "rate_verifications_select" ON rate_verifications FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('administrator', 'admin', 'centrala')
    )
);

DROP POLICY IF EXISTS "rate_verifications_insert" ON rate_verifications;
CREATE POLICY "rate_verifications_insert" ON rate_verifications FOR INSERT WITH CHECK (
    auth.uid() = verified_by
    AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role IN ('administrator', 'admin', 'centrala')
    )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_market_rates_position ON market_rates(position_title);
CREATE INDEX IF NOT EXISTS idx_market_rates_category ON market_rates(category);
CREATE INDEX IF NOT EXISTS idx_market_rates_source ON market_rates(source);
CREATE INDEX IF NOT EXISTS idx_rate_verifications_by ON rate_verifications(verified_by);
CREATE INDEX IF NOT EXISTS idx_rate_verifications_created ON rate_verifications(created_at DESC);

-- Add rates permission to role_permissions
INSERT INTO role_permissions (role, feature, value) VALUES
    ('recruiter', 'rates', 'true'),
    ('delivery_lead', 'rates', 'true'),
    ('finance', 'rates', 'true'),
    ('consultant', 'rates', 'false')
ON CONFLICT (role, feature) DO NOTHING;
