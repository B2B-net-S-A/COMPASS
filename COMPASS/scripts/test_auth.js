const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function testAuth() {
    const email = `test_${Date.now()}@b2bnetwork.pl`
    const password = 'Password123!'

    console.log(`Attempting signup for ${email}...`)

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: { full_name: 'Test User' } // Missing gdpr_consent here, but let's see if auth even works
        }
    })

    if (signUpError) {
        console.error('Signup Error:', signUpError.message)
        return
    }

    console.log('Signup successful.')
    console.log('Session present?', !!signUpData.session)
    console.log('User confirmed_at:', signUpData.user?.confirmed_at)
    console.log('User id:', signUpData.user?.id)

    if (!signUpData.session) {
        console.log('No session returned. Email confirmation is likely REQUIRED.')

        console.log('Attempting login immediately...')
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email,
            password
        })

        if (loginError) {
            console.error('Immediate Login Error:', loginError.message)
        } else {
            console.log('Login successful (Unexpected if confirmation required).')
        }
    } else {
        console.log('Session returned. Email confirmation is NOT required.')
    }
}

testAuth()
