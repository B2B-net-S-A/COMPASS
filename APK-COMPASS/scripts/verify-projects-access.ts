import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function verifyAccess() {
    console.log('Testing anonymous access to projects...')
    const { data, error } = await supabase
        .from('projects')
        .select('id, title')
        .limit(5)

    if (error) {
        console.error('Access Denied or Error:', error.message)
    } else {
        console.log(`Success! Retrieved ${data.length} projects.`)
        if (data.length > 0) {
            console.log('Sample project:', data[0].title)
        }
    }
}

verifyAccess()
