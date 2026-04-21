const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

try { require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') }); } catch {}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    console.error('ERROR: DATABASE_URL is not set.');
    console.error('Add it to .env.local or pass as environment variable.');
    process.exit(1);
}

const migrationFile = process.argv[2];

if (!migrationFile) {
    console.error('Uzycie: node scripts/run-migration.js <nazwa_pliku.sql>');
    console.error('Przyklad: node scripts/run-migration.js 20260222_etap1_fixes.sql');
    process.exit(1);
}

const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', migrationFile);

if (!fs.existsSync(sqlPath)) {
    console.error('Plik nie istnieje:', sqlPath);
    process.exit(1);
}

async function run() {
    const client = new Client({ connectionString });
    try {
        console.log('[MIGRATION] Laczenie z baza...');
        await client.connect();
        console.log('[MIGRATION] Polaczono.');

        const sql = fs.readFileSync(sqlPath, 'utf8');
        const statements = sql.length;
        console.log(`[MIGRATION] Wykonywanie: ${migrationFile} (${statements} znakow)`);

        await client.query(sql);
        console.log(`[MIGRATION] Sukces: ${migrationFile}`);
    } catch (err) {
        if (err.message && err.message.includes('already exists')) {
            console.warn(`[MIGRATION] Ostrzezenie (already exists): ${err.message}`);
            console.log(`[MIGRATION] Kontynuacja -- obiekty juz istnieja.`);
        } else {
            console.error(`[MIGRATION] BLAD: ${err.message}`);
            process.exit(1);
        }
    } finally {
        await client.end();
        console.log('[MIGRATION] Polaczenie zamkniete.');
    }
}

run();
