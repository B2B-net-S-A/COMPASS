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
        .select('id, title, content, category, tags, created_at')
        .limit(5)

    // 4. Try a test insert
    let insertResult: { id: string } | null = null
    let insertError: { message: string; code?: string; details?: string } | null = null
    try {
        const { data: inserted, error: insErr } = await supabase
            .from('compass_assist_knowledge')
            .insert({
                title: '__TEST_DIAGNOSTIC__',
                content: '__TEST_DIAGNOSTIC__',
                category: 'ogolne',
                tags: ['diagnostic'],
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
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        insertError = { message: msg }
    }

    return NextResponse.json({
        user: { email: user.email, id: user.id },
        profile: profile,
        knowledge: {
            readCount: docs?.length || 0,
            readError: readErr?.message || null,
            docs: docs?.map(d => ({
                id: d.id,
                title: d.title,
                category: d.category,
                content: d.content?.substring(0, 80),
                tags: d.tags,
            })),
        },
        insertTest: {
            success: !!insertResult,
            error: insertError,
            result: insertResult,
        },
    })
}
