const { Client } = require('pg');

const PASSWORD = 'W10lett@';
const PROJECT_REF = 'txzflesacqvlyhxwfjxk';

// SQL to fix the database
const SQL_FIX = `
-- 1. Fix Profiles (Add missing columns)
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS skills TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'open',
ADD COLUMN IF NOT EXISTS project_sentiment TEXT DEFAULT 'neutral',
ADD COLUMN IF NOT EXISTS verifier_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS ambassador_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS sales_support_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS previous_clients TEXT[] DEFAULT '{}';

-- 2. Fix Candidates (Add user_id and missing columns)
ALTER TABLE candidates
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL UNIQUE,
ADD COLUMN IF NOT EXISTS current_status TEXT DEFAULT 'open',
ADD COLUMN IF NOT EXISTS experience_years INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS project_sentiment TEXT DEFAULT 'neutral',
ADD COLUMN IF NOT EXISTS verifier_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS ambassador_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS sales_support_status TEXT DEFAULT 'none',
ADD COLUMN IF NOT EXISTS previous_clients TEXT[] DEFAULT '{}';

-- 3. Rename status to current_status if needed
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'status') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'candidates' AND column_name = 'current_status') THEN
        ALTER TABLE candidates RENAME COLUMN status TO current_status;
    END IF;
END $$;
`;

async function runFixed() {
    console.log('--- Auto Database Repair ---');
    console.log('Target Project:', PROJECT_REF);

    const encodedPassword = encodeURIComponent(PASSWORD);

    // Config objects are safer than strings for special chars
    const configs = [
        // 1. Direct Connection (Standard)
        {
            host: `db.${PROJECT_REF}.supabase.co`,
            port: 5432,
            user: 'postgres',
            password: PASSWORD,
            database: 'postgres'
        },
        // 2. Pooler - EU Central (Frankfurt) - Transaction
        {
            host: 'aws-0-eu-central-1.pooler.supabase.com',
            port: 6543,
            user: `postgres.${PROJECT_REF}`,
            password: PASSWORD,
            database: 'postgres'
        },
        // 3. Pooler - EU West 1 (Ireland)
        {
            host: 'aws-0-eu-west-1.pooler.supabase.com',
            port: 6543,
            user: `postgres.${PROJECT_REF}`,
            password: PASSWORD,
            database: 'postgres'
        },
        // 4. Pooler - US East 1 (N. Virginia)
        {
            host: 'aws-0-us-east-1.pooler.supabase.com',
            port: 6543,
            user: `postgres.${PROJECT_REF}`,
            password: PASSWORD,
            database: 'postgres'
        },
        // 5. Pooler - EU West 2 (London)
        {
            host: 'aws-0-eu-west-2.pooler.supabase.com',
            port: 6543,
            user: `postgres.${PROJECT_REF}`,
            password: PASSWORD,
            database: 'postgres'
        }
    ];

    for (const config of configs) {
        console.log(`\nTrying connection to ${config.host}:${config.port} as ${config.user}...`);

        const client = new Client({
            ...config,
            ssl: { rejectUnauthorized: false }
        });

        try {
            await client.connect();
            console.log('✅ Connected! Applying fix...');

            await client.query(SQL_FIX);
            console.log('✅ Fix Applied Successfully!');
            await client.end();
            process.exit(0);
        } catch (err) {
            console.error(`❌ Failed: ${err.message}`);
            await client.end().catch(() => { });
        }
    }

    console.error('\nAll connection attempts failed. The project might be paused or the password incorrect.');
    process.exit(1);
}

runFixed();
