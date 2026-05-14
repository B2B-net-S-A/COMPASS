const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

// Try to use DATABASE_URL, or construct from Supabase credentials if needed
// Usually Supabase projects have a direct connection string (Transaction or Session mode)
// If DATABASE_URL is not set, we might fail unless we can use Supabase JS client to run SQL (not possible usually).
// Let's assume DATABASE_URL exists as it's standard for Next.js + Prism/Drizzle/etc, even if using Supabase-js.
// If not, we might need the user to provide it or use the Session Pool URL.

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
    console.error('Error: DATABASE_URL or POSTGRES_URL environment variable is not defined.');
    console.log('Available keys:', Object.keys(process.env));
    process.exit(1);
}

const pool = new Pool({
    connectionString,
    ssl: {
        rejectUnauthorized: false
    }
});

const createTableSQL = `
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

-- Create policy to allow read for everyone (authenticated)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'loyalty_rules' AND policyname = 'Enable read access for all users'
    ) THEN
        CREATE POLICY "Enable read access for all users" ON loyalty_rules FOR SELECT USING (auth.role() = 'authenticated');
    END IF;
END
$$;

-- Create policy to allow write only for admins/centrala
-- Note: 'admin' might be a claim or a profile role. 
-- RLS checks against auth.uid().
-- For simplicity in this script, we'll allow insert/update if the user has specific role, 
-- BUT creating policies usually requires being a superuser or owner.
-- This script runs as the db owner (usually), so we can create policies.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'loyalty_rules' AND policyname = 'Enable write access for admins'
    ) THEN
        -- Checks profile role via a subquery is expensive but standard for Supabase
        CREATE POLICY "Enable write access for admins" ON loyalty_rules 
        FOR ALL 
        USING (
            EXISTS (
                SELECT 1 FROM profiles 
                WHERE profiles.id = auth.uid() 
                AND (profiles.role IN ('admin', 'administrator', 'centrala'))
            )
        );
    END IF;
END
$$;
`;

const defaultRules = [
    { code: 'referral_hired', name: 'Referral (Zatrudnienie)', points: 1000, category: 'Recruitment', description: 'Zatrudnienie osoby poleconej' },
    { code: 'role_ambassador', name: 'Rola Compass: Ambasador', points: 200, category: 'Compass', description: 'Miesięczny bonus za rolę' },
    { code: 'role_verifier', name: 'Rola Compass: Weryfikator', points: 100, category: 'Compass', description: 'Miesięczny bonus za rolę' },
    { code: 'role_sales', name: 'Rola Compass: Wsparcie Sprzedaży', points: 300, category: 'Compass', description: 'Miesięczny bonus za rolę' },
    { code: 'anniversary', name: 'Rocznica zatrudnienia', points: 500, category: 'Loyalty', description: 'Nagroda roczna' },
    { code: 'contract_extension', name: 'Przedłużenie umowy (Annex)', points: 500, category: 'Loyalty', description: 'Za każdy aneks' },
    { code: 'smooth_transition', name: 'Gładkie przejście', points: 300, category: 'Loyalty', description: 'Gap między projektami ≤ 14 dni' },
    { code: 'positive_feedback', name: 'Pozytywna ankieta kwartalna', points: 200, category: 'Quality', description: 'Rating ≥ 4.5' },
    { code: 'certification', name: 'Nowa certyfikacja', points: 150, category: 'Development', description: 'Uzyskanie certyfikatu (np. AWS, Azure)' },
    { code: 'perfect_attendance', name: 'Pełny miesiąc na projekcie', points: 100, category: 'Performance', description: 'Frekwencja ≥ 90%' },
];

async function run() {
    const client = await pool.connect();
    try {
        console.log('Creating table...');
        await client.query(createTableSQL);
        console.log('Table created or already exists.');

        console.log('Seeding default rules...');
        for (const rule of defaultRules) {
            const sql = `
            INSERT INTO loyalty_rules (code, name, points, category, description)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (code) DO UPDATE 
            SET points = EXCLUDED.points,
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                category = EXCLUDED.category;
        `;
            await client.query(sql, [rule.code, rule.name, rule.points, rule.category, rule.description]);
        }
        console.log('Seeding complete.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
        pool.end();
    }
}

run();
