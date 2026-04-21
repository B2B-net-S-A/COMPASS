import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function checkProjectsRpc() {
    const { data, error } = await supabase.rpc('get_projects_count')

    if (error) {
        console.error('RPC Error:', error.message)
    } else {
        console.log('Project Count (RPC):', data)
    }
}

checkProjectsRpc()
