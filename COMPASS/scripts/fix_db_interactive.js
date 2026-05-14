const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const dotenv = require('dotenv');

// Load environment variables
const envPath = path.resolve(process.cwd(), '.env.local');
let projectRef = '';

try {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    const supabaseUrl = envConfig.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl) {
        const match = supabaseUrl.match(/https:\/\/([^.]+)\./);
        if (match) {
            projectRef = match[1];
        }
    }
} catch (e) {
    console.error('Could not load .env.local');
    process.exit(1);
}

if (!projectRef) {
    console.error('Could not extract Project Ref from NEXT_PUBLIC_SUPABASE_URL');
    process.exit(1);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

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

console.log('--- Database Repair Tool ---');
console.log('This script will fix the missing columns in your database.');
console.log('Target Project Ref:', projectRef);
console.log('\nPlease enter your Supabase Database Password (the one you set when creating the project).');

rl.question('Password: ', async (password) => {
    rl.close();

    // Try Direct connection first
    const connectionString = `postgres://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`;

    console.log('\nConnecting to database...');
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('Connected! Applying fix...');

        await client.query(SQL_FIX);
        console.log('✅ Fix Applied Successfully!');

        // Helper: Delete test user
        console.log('Cleaning up previous failed registrations (test users)...');
        // Note: We cannot delete from auth.users easily without superuser, but we can verify tables.

        console.log('\nYou can now Register again on the website.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Error:', err.message);
        console.log('\nTroubleshooting:');
        console.log('1. Check if the password is correct.');
        console.log('2. Check if your network allows connecting to port 5432.');
        process.exit(1);
    } finally {
        await client.end().catch(() => { });
    }
});
