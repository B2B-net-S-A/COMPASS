import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
    const supabase = createClient()

    // 1. Check current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (!user || authError) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // 2. Get user profile/role
    const { data: profile } = await supabase
        .from('profiles')
        .select('id, role, full_name')
        .eq('id', user.id)
        .single()

    // 3. Try to read from knowledge table
    const { data: docs, error: readErr } = await supabase
        .from('compass_assist_knowledge')
        .select('id, content, category, metadata, created_at')
        .limit(5)

    // 4. Try a test insert
    let insertResult = null
    let insertError = null
    try {
        const { data: inserted, error: insErr } = await supabase
            .from('compass_assist_knowledge')
            .insert({
                content: '__TEST_DIAGNOSTIC__',
                category: 'ogolne',
                metadata: { test: true },
            })
            .select('id')
            .single()

        if (insErr) {
            insertError = { message: insErr.message, code: insErr.code, details: insErr.details }
        } else {
            insertResult = inserted
            // Clean up test record
            if (inserted?.id) {
                await supabase.from('compass_assist_knowledge').delete().eq('id', inserted.id)
            }
        }
    } catch (e: any) {
        insertError = { message: e.message }
    }

    return NextResponse.json({
        user: { email: user.email, id: user.id },
        profile: profile,
        knowledge: {
            readCount: docs?.length || 0,
            readError: readErr?.message || null,
            docs: docs?.map(d => ({ id: d.id, category: d.category, content: d.content?.substring(0, 80), metadata: d.metadata })),
        },
        insertTest: {
            success: !!insertResult,
            error: insertError,
            result: insertResult
        }
    })
}
