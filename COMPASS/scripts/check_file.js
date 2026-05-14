
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
    console.log('Checking last candidate...');
    const { data: candidate, error } = await supabase
        .from('candidates')
        .select('id, full_name, cv_url')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error) {
        console.error('DB Error:', error);
        return;
    }

    console.log('Candidate:', candidate.full_name);
    console.log('CV URL (DB):', candidate.cv_url);

    if (!candidate.cv_url) {
        console.log('No CV URL found for this candidate.');
        return;
    }

    // Check if file exists in storage
    const { data: files, error: storageError } = await supabase.storage
        .from('documents')
        .list(candidate.cv_url.split('/')[0]); // list root or subfolder

    if (storageError) {
        console.error('Storage List Error:', storageError);
    } else {
        // Attempt to find the specific file
        // Note: .list() lists files in a folder. candidate.cv_url includes folder.
        // e.g. candidates/timestamp.pdf
        const folder = candidate.cv_url.split('/')[0];
        const filename = candidate.cv_url.split('/')[1];

        // If it's in a subfolder, we listed the subfolder contents
        const found = files.find(f => f.name === filename);

        if (found) {
            console.log('✅ File found in storage:', found.name, 'Size:', found.metadata.size);

            // Generate Public URL
            const { data: publicUrlData } = supabase.storage
                .from('documents')
                .getPublicUrl(candidate.cv_url);

            console.log('Public URL:', publicUrlData.publicUrl);
        } else {
            console.log('❌ File NOT found in storage folder:', folder);
            console.log('Files in folder:', files.map(f => f.name));
        }
    }
}

run();
