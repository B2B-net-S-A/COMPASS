
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Checking candidates table schema...');

    // Try to select the 'avatar_url' column
    const { data, error } = await supabase
        .from('candidates')
        .select('id, avatar_url')
        .limit(1);

    if (error) {
        console.error('Schema Check Failed:', error.message);
        if (error.message.includes('column "avatar_url" does not exist') || error.code === '42703') {
            console.log('\n>>> CONFIRMED: The "avatar_url" column is MISSING. You MUST run the migration SQL. <<<');
        } else {
            console.log('Unknown error:', error);
        }
    } else {
        console.log('Schema Check Passed: "avatar_url" column exists.');
    }
}

checkSchema();
