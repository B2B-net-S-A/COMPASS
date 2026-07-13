-- Contracts Table for M1 Dashboard and M4 Health Score
-- This is a comprehensive contracts schema for tracking consultant assignments
CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Consultant reference
    consultant_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    -- Contract details
    contract_number TEXT,
    -- e.g. "B2B/2024/001"
    client_name TEXT NOT NULL,
    project_name TEXT NOT NULL,
    position TEXT NOT NULL,
    -- e.g. "Senior Java Developer"
    -- Dates
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    original_end_date DATE,
    -- For tracking extensions
    extension_count INT DEFAULT 0,
    -- Financial
    hourly_rate DECIMAL(10, 2),
    -- PLN per hour
    monthly_rate DECIMAL(10, 2),
    -- Fixed monthly rate (if applicable)
    currency TEXT DEFAULT 'PLN',
    -- Work arrangement
    work_mode TEXT CHECK (work_mode IN ('remote', 'hybrid', 'onsite')),
    work_location TEXT,
    -- City or office location
    hours_per_week INT DEFAULT 40,
    -- Status
    status TEXT NOT NULL DEFAULT 'active' CHECK (
        status IN (
            'draft',
            -- Contract being prepared
            'active',
            -- Current ongoing contract
            'ending_soon',
            -- < 30 days to end_date
            'extended',
            -- Contract was extended
            'completed',
            -- Successfully finished
            'terminated',
            -- Ended early
            'cancelled' -- Cancelled before start
        )
    ),
    -- Health & Performance (for M4)
    health_score DECIMAL(5, 2) DEFAULT 85.00,
    -- 0-100%
    last_health_check TIMESTAMPTZ,
    -- Metadata
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    -- Soft delete
    deleted_at TIMESTAMPTZ
);
-- Indexes
CREATE INDEX IF NOT EXISTS idx_contracts_consultant ON contracts(consultant_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_health ON contracts(health_score);
-- Enable RLS
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
-- RLS Policies
-- Consultants can view their own contracts
CREATE POLICY "Consultants can view own contracts" ON contracts FOR
SELECT TO authenticated USING (auth.uid() = consultant_id);
-- Admins can view all contracts
CREATE POLICY "Admins can view all contracts" ON contracts FOR
SELECT TO authenticated USING (
        EXISTS (
            SELECT 1
            FROM profiles
            WHERE profiles.id = auth.uid()
                AND profiles.role = 'admin'
        )
    );
-- Admins can manage all contracts
CREATE POLICY "Admins can manage contracts" ON contracts FOR ALL TO authenticated USING (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
    )
) WITH CHECK (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
    )
);
-- Auto-update trigger for updated_at
CREATE OR REPLACE FUNCTION update_contracts_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER contracts_updated_at BEFORE
UPDATE ON contracts FOR EACH ROW EXECUTE FUNCTION update_contracts_updated_at();
-- Function to auto-update contract status based on dates
CREATE OR REPLACE FUNCTION update_contract_status() RETURNS void AS $$ BEGIN -- Mark as ending_soon if < 30 days
UPDATE contracts
SET status = 'ending_soon'
WHERE status = 'active'
    AND end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days';
-- Mark as completed if past end date
UPDATE contracts
SET status = 'completed'
WHERE status IN ('active', 'ending_soon')
    AND end_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql;
-- Grant execute
GRANT EXECUTE ON FUNCTION update_contract_status TO authenticated;
-- Mock data for testing (run this to populate sample contracts)
-- Replace the user_id with actual test user IDs from your database
-- First, let's get a test user ID (you'll need to replace this)
DO $$
DECLARE v_test_user_id UUID;
BEGIN -- Get first non-admin user
SELECT id INTO v_test_user_id
FROM profiles
WHERE role = 'consultant'
LIMIT 1;
-- If found, insert sample contracts
IF v_test_user_id IS NOT NULL THEN
INSERT INTO contracts (
        consultant_id,
        contract_number,
        client_name,
        project_name,
        position,
        start_date,
        end_date,
        hourly_rate,
        work_mode,
        work_location,
        status,
        health_score
    )
VALUES -- Active contract (healthy)
    (
        v_test_user_id,
        'B2B/2024/001',
        'PKO Bank Polski',
        'Core Banking System Migration',
        'Senior Java Developer',
        '2024-01-15',
        '2026-12-31',
        180.00,
        'hybrid',
        'Warszawa',
        'active',
        92.50
    ),
    -- Contract ending soon
    (
        v_test_user_id,
        'B2B/2023/042',
        'mBank',
        'Mobile Banking App',
        'React Native Developer',
        '2023-06-01',
        '2026-03-15',
        175.00,
        'remote',
        'Remote',
        'ending_soon',
        78.00
    ),
    -- Recently completed
    (
        v_test_user_id,
        'B2B/2023/015',
        'Pekao S.A.',
        'Payment Gateway Integration',
        'Backend Developer',
        '2023-01-10',
        '2025-12-20',
        165.00,
        'onsite',
        'Warszawa',
        'completed',
        88.00
    ),
    -- Extended contract
    (
        v_test_user_id,
        'B2B/2022/089',
        'ING Bank Śląski',
        'Data Warehouse Modernization',
        'Senior Data Engineer',
        '2022-03-01',
        '2027-06-30',
        195.00,
        'hybrid',
        'Katowice',
        'extended',
        95.00
    );
RAISE NOTICE 'Sample contracts created for user: %',
v_test_user_id;
ELSE RAISE NOTICE 'No consultant users found. Create a test user first.';
END IF;
END $$;
COMMENT ON TABLE contracts IS 'Consultant contracts for M1 Dashboard and M4 Health Score tracking';
COMMENT ON COLUMN contracts.status IS 'Contract lifecycle status, auto-updated based on dates';
COMMENT ON COLUMN contracts.health_score IS 'Overall contract health (0-100%), calculated by M4';