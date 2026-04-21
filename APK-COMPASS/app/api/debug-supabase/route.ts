import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export async function GET() {
    try {
        const cookieStore = cookies()
        const emergencyUser = cookieStore.get('emergency_auth_user')?.value
        const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL
        const hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
        const serviceKeyPrefix = process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 10) || 'NOT SET'
        const allowBypass = process.env.ALLOW_BYPASS_LOGIN

        const supabase = createClient()

        // Test auth
        const { data: authData, error: authError } = await supabase.auth.getUser()

        // Test candidates query
        const { data: candidates, error: candError, count } = await supabase
            .from('candidates')
            .select('id, full_name', { count: 'exact' })
            .limit(3)

        // Test profiles query
        const { data: profiles, error: profError } = await supabase
            .from('profiles')
            .select('id, email, role')
            .limit(3)

        return NextResponse.json({
            env: {
                hasSupabaseUrl,
                hasAnonKey,
                hasServiceKey,
                serviceKeyPrefix,
                allowBypass,
            },
            auth: {
                emergencyUser,
                user: authData?.user?.email || null,
                userId: authData?.user?.id || null,
                authError: authError?.message || null,
            },
            candidates: {
                count,
                sample: candidates?.map(c => ({ id: c.id?.substring(0, 8), name: c.full_name })) || [],
                error: candError?.message || null,
            },
            profiles: {
                sample: profiles?.map(p => ({ email: p.email, role: p.role })) || [],
                error: profError?.message || null,
            },
        })
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
