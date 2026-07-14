-- Create tables for Centrala Module
-- 1. Benefit Declarations (Medical & Sport)
CREATE TABLE IF NOT EXISTS centrala_benefit_declarations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT null,
    variant TEXT NOT NULL,
    declaration_type TEXT NOT NULL CHECK (declaration_type IN ('medical', 'sport')),
    family_members JSONB DEFAULT '[]'::jsonb,
    declaration_scan_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- 2. Referrals
CREATE TABLE IF NOT EXISTS centrala_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT null,
    candidate_name TEXT NOT NULL,
    candidate_position TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'weryfikacja' CHECK (
        status IN ('weryfikacja', 'zatrudniony', 'odrzucony')
    ),
    bonus_amount NUMERIC(10, 2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- 3. Equipment Requests
CREATE TABLE IF NOT EXISTS centrala_equipment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT null,
    item_name TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'w_toku' CHECK (status IN ('w_toku', 'dostarczono', 'odrzucony')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- 4. Invoices
CREATE TABLE IF NOT EXISTS centrala_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT null,
    invoice_number TEXT,
    amount NUMERIC(10, 2),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid')),
    file_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- RLS Policies
ALTER TABLE centrala_benefit_declarations ENABLE ROW LEVEL SECURITY;
ALTER TABLE centrala_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE centrala_equipment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE centrala_invoices ENABLE ROW LEVEL SECURITY;
-- Select policies (Users can see their own data, admins see everything)
CREATE POLICY "Users can view own benefit declarations" ON centrala_benefit_declarations FOR
SELECT USING (
        auth.uid() = profile_id
        OR (
            SELECT role
            FROM profiles
            WHERE id = auth.uid()
        ) = 'admin'
    );
CREATE POLICY "Users can view own referrals" ON centrala_referrals FOR
SELECT USING (
        auth.uid() = referrer_id
        OR (
            SELECT role
            FROM profiles
            WHERE id = auth.uid()
        ) = 'admin'
    );
CREATE POLICY "Users can view own equipment requests" ON centrala_equipment_requests FOR
SELECT USING (
        auth.uid() = profile_id
        OR (
            SELECT role
            FROM profiles
            WHERE id = auth.uid()
        ) = 'admin'
    );
CREATE POLICY "Users can view own invoices" ON centrala_invoices FOR
SELECT USING (
        auth.uid() = profile_id
        OR (
            SELECT role
            FROM profiles
            WHERE id = auth.uid()
        ) = 'admin'
    );
-- Insert policies (Users can insert their own data)
CREATE POLICY "Users can insert own benefit declarations" ON centrala_benefit_declarations FOR
INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "Users can insert own referrals" ON centrala_referrals FOR
INSERT WITH CHECK (auth.uid() = referrer_id);
CREATE POLICY "Users can insert own equipment requests" ON centrala_equipment_requests FOR
INSERT WITH CHECK (auth.uid() = profile_id);
CREATE POLICY "Users can insert own invoices" ON centrala_invoices FOR
INSERT WITH CHECK (auth.uid() = profile_id);
-- Update policies (Only admins can update status)
CREATE POLICY "Admins can update benefit status" ON centrala_benefit_declarations FOR
UPDATE USING (
        (
            SELECT role
            FROM profiles
            WHERE id = auth.uid()
        ) = 'admin'
    );
CREATE POLICY "Admins can update referral status" ON centrala_referrals FOR
UPDATE USING (
        (
            SELECT role
            FROM profiles
            WHERE id = auth.uid()
        ) = 'admin'
    );
CREATE POLICY "Admins can update equipment status" ON centrala_equipment_requests FOR
UPDATE USING (
        (
            SELECT role
            FROM profiles
            WHERE id = auth.uid()
        ) = 'admin'
    );
CREATE POLICY "Admins can update invoice status" ON centrala_invoices FOR
UPDATE USING (
        (
            SELECT role
            FROM profiles
            WHERE id = auth.uid()
        ) = 'admin'
    );