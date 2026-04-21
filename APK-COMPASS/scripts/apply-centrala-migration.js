const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Same connection as migrate.js (Pooler, port 6543)
const connectionString = 'postgres://postgres.txzflesacqvlyhxwfjxk:W10lett%401976Twardowska@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

const client = new Client({ connectionString });

async function runMigration() {
    try {
        console.log('🔌 Connecting to Supabase database...');
        await client.connect();
        console.log('✅ Connected!');

        const sqlPath = path.join(__dirname, '../supabase/migrations/20260219_centrala_management.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('📦 Applying centrala management migration...');
        await client.query(sql);
        console.log('✅ Migration applied successfully!');

        // Verify tables
        const { rows: columns } = await client.query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'consultant_assignments'
            ORDER BY ordinal_position
        `);
        console.log('\n📋 consultant_assignments table columns:');
        columns.forEach(c => console.log(`   - ${c.column_name} (${c.data_type})`));

        const { rows: newCols } = await client.query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'centrala_access_list'
            AND column_name IN ('centrala_role', 'access_mode', 'full_name')
            ORDER BY ordinal_position
        `);
        console.log('\n📋 New columns in centrala_access_list:');
        newCols.forEach(c => console.log(`   - ${c.column_name} (${c.data_type}) default: ${c.column_default || 'none'}`));

    } catch (err) {
        if (err.message && err.message.includes('already exists')) {
            console.log('⚠️  Objects already exist, migration likely already applied.');
        } else {
            console.error('❌ Error applying migration:', err.message || err);
        }
    } finally {
        await client.end();
        console.log('\n🔒 Connection closed.');
    }
}

runMigration();
