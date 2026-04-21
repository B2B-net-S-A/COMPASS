-- Create loyalty_rules table
CREATE TABLE IF NOT EXISTS loyalty_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    points INTEGER NOT NULL,
    category TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- Enable RLS
ALTER TABLE loyalty_rules ENABLE ROW LEVEL SECURITY;
-- Create policies
CREATE POLICY "Enable read access for all users" ON loyalty_rules FOR
SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable write access for admins" ON loyalty_rules FOR ALL USING (
    EXISTS (
        SELECT 1
        FROM profiles
        WHERE profiles.id = auth.uid()
            AND (
                profiles.role IN ('admin', 'administrator', 'centrala')
            )
    )
);
-- Seed default data
INSERT INTO loyalty_rules (code, name, points, category, description)
VALUES (
        'referral_hired',
        'Referral (Zatrudnienie)',
        1000,
        'Recruitment',
        'Zatrudnienie osoby poleconej'
    ),
    (
        'role_ambassador',
        'Rola Compass: Ambasador',
        200,
        'Compass',
        'Miesięczny bonus za rolę'
    ),
    (
        'role_verifier',
        'Rola Compass: Weryfikator',
        100,
        'Compass',
        'Miesięczny bonus za rolę'
    ),
    (
        'role_sales',
        'Rola Compass: Wsparcie Sprzedaży',
        300,
        'Compass',
        'Miesięczny bonus za rolę'
    ),
    (
        'anniversary',
        'Rocznica zatrudnienia',
        500,
        'Loyalty',
        'Nagroda roczna'
    ),
    (
        'contract_extension',
        'Przedłużenie umowy (Annex)',
        500,
        'Loyalty',
        'Za każdy aneks'
    ),
    (
        'smooth_transition',
        'Gładkie przejście',
        300,
        'Loyalty',
        'Gap między projektami ≤ 14 dni'
    ),
    (
        'positive_feedback',
        'Pozytywna ankieta kwartalna',
        200,
        'Quality',
        'Rating ≥ 4.5'
    ),
    (
        'certification',
        'Nowa certyfikacja',
        150,
        'Development',
        'Uzyskanie certyfikatu (np. AWS, Azure)'
    ),
    (
        'perfect_attendance',
        'Pełny miesiąc na projekcie',
        100,
        'Performance',
        'Frekwencja ≥ 90%'
    ) ON CONFLICT (code) DO
UPDATE
SET points = EXCLUDED.points,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    category = EXCLUDED.category;