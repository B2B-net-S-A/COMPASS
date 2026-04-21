const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Trying Pooler connection (Transaction mode, port 6543)
// Region: aws-0-eu-central-1 (Likely for "Europe")
// User: postgres.[project-ref]
// Password: [encoded_password]
const connectionString = 'postgres://postgres.txzflesacqvlyhxwfjxk:W10lett%401976Twardowska@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

const client = new Client({
    connectionString: connectionString,
});

async function runMigration() {
    try {
        console.log('Connecting to database (Pooler)...');
        await client.connect();
        console.log('Connected!');

        const sqlPath = path.join(__dirname, '../supabase/migrations/20240502000000_initial_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Executing migration...');
        await client.query(sql);
        console.log('Migration applied successfully!');

    } catch (err) {
        if (err.message && err.message.includes('already exists')) {
            console.log('Table likely already exists, skipping.');
        } else {
            console.error('Error applying migration:', err);
        }
    } finally {
        await client.end();
    }
}

runMigration();
