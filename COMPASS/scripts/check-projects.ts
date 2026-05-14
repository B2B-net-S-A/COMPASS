import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function checkProjects() {
    const { count, error } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })

    if (error) {
        console.error('Error:', error.message)
    } else {
        console.log('Project Count:', count)
    }
}

checkProjects()
