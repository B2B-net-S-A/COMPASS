'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Course, CourseListItem, ActionResult } from '@/lib/types/learning'

// ============================================================
// Helpers
// ============================================================
async function requireAdmin(supabase: ReturnType<typeof createClient>): Promise<{ userId: string } | { error: string }> {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Brak autoryzacji' }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const role = profile?.role || ''
    if (!['admin'].includes(role)) {
        return { error: 'Niewystarczające uprawnienia' }
    }
    return { userId: user.id }
}

// ============================================================
// Server actions — admin moderation
// ============================================================

/**
 * Lista kursów oczekujących moderacji (status = pending_review).
 * Zwraca courses + dane autora (full_name, avatar_url).
 */
export async function getReviewQueue(): Promise<ActionResult<CourseListItem[]>> {
    try {
        const supabase = createClient()
        const auth = await requireAdmin(supabase)
        if ('error' in auth) return { success: false, error: auth.error }

        const { data, error } = await supabase
            .from('courses')
            .select('*')
            .eq('status', 'pending_review')
            .order('updated_at', { ascending: true })

        if (error) throw error
        const courses = (data ?? []) as Course[]

        const authorIds = Array.from(new Set(courses.map((c) => c.author_id)))
        const authorMap = new Map<string, { full_name: string | null; avatar_url: string | null }>()
        if (authorIds.length > 0) {
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, full_name, avatar_url')
                .in('id', authorIds)
            for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null }>) {
                authorMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url })
            }
        }

        const items: CourseListItem[] = courses.map((c) => ({
            ...c,
            author_name: authorMap.get(c.author_id)?.full_name ?? null,
            author_avatar_url: authorMap.get(c.author_id)?.avatar_url ?? null,
        }))

        return { success: true, data: items }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd pobierania kolejki moderacji'
        console.error('[getReviewQueue]', error)
        return { success: false, error: msg }
    }
}

/**
 * Zatwierdza kurs do publikacji: status='published', published_at=NOW(),
 * reviewed_by, reviewed_at. Po sukcesie wywołuje RPC `award_first_publish_bonus`
 * — jeśli to pierwsza publikacja autora, dostaje +100 pkt (idempotentne).
 */
export async function approveCourse(courseId: string): Promise<ActionResult<{ firstPublishBonus: boolean }>> {
    try {
        const supabase = createClient()
        const auth = await requireAdmin(supabase)
        if ('error' in auth) return { success: false, error: auth.error }

        const { data: course, error: fetchErr } = await supabase
            .from('courses')
            .select('id, author_id, slug, status')
            .eq('id', courseId)
            .single()
        if (fetchErr || !course) return { success: false, error: 'Kurs nie istnieje' }

        if (course.status !== 'pending_review') {
            return { success: false, error: `Nie można zatwierdzić — aktualny status: ${course.status}` }
        }

        const now = new Date().toISOString()
        const { error: updErr } = await supabase
            .from('courses')
            .update({
                status: 'published',
                published_at: now,
                reviewed_by: auth.userId,
                reviewed_at: now,
                rejection_reason: null,
                updated_at: now,
            })
            .eq('id', courseId)
        if (updErr) throw updErr

        // RPC first-publish bonus (idempotent — sprawdza czy autor ma już published kursy poza tym)
        let firstPublishBonus = false
        const { data: rpcResult } = await supabase.rpc('award_first_publish_bonus', { p_course_id: courseId })
        if (rpcResult === 'awarded') firstPublishBonus = true

        revalidatePath('/admin/learning')
        revalidatePath('/learning')
        revalidatePath(`/learning/${course.slug}`)
        revalidatePath('/learning/tworze')
        return { success: true, data: { firstPublishBonus } }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd zatwierdzania kursu'
        console.error('[approveCourse]', error)
        return { success: false, error: msg }
    }
}

/**
 * Odrzuca kurs — status=rejected + rejection_reason. Autor dostaje notyfikację
 * (course_rejected) z powodem.
 */
export async function rejectCourse(courseId: string, reason: string): Promise<ActionResult<void>> {
    try {
        const supabase = createClient()
        const auth = await requireAdmin(supabase)
        if ('error' in auth) return { success: false, error: auth.error }

        if (!reason || reason.trim().length < 5) {
            return { success: false, error: 'Powód odrzucenia musi mieć co najmniej 5 znaków' }
        }

        const { data: course, error: fetchErr } = await supabase
            .from('courses')
            .select('id, author_id, title, slug, status')
            .eq('id', courseId)
            .single()
        if (fetchErr || !course) return { success: false, error: 'Kurs nie istnieje' }

        if (course.status !== 'pending_review') {
            return { success: false, error: `Nie można odrzucić — aktualny status: ${course.status}` }
        }

        const now = new Date().toISOString()
        const { error: updErr } = await supabase
            .from('courses')
            .update({
                status: 'rejected',
                rejection_reason: reason.trim(),
                reviewed_by: auth.userId,
                reviewed_at: now,
                updated_at: now,
            })
            .eq('id', courseId)
        if (updErr) throw updErr

        // Notification to author
        await supabase.rpc('create_notification', {
            p_user_id: course.author_id,
            p_type: 'course_rejected',
            p_title_pl: 'Szkolenie odrzucone',
            p_title_en: 'Course rejected',
            p_body_pl: `${course.title} — ${reason.trim().slice(0, 200)}`,
            p_body_en: `${course.title} — ${reason.trim().slice(0, 200)}`,
            p_action_url: `/learning/tworze/${course.id}/edit`,
            p_priority: 'normal',
        })

        revalidatePath('/admin/learning')
        revalidatePath('/learning/tworze')
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd odrzucania kursu'
        console.error('[rejectCourse]', error)
        return { success: false, error: msg }
    }
}

/**
 * Archiwizuje kurs — admin lub autor może. Status -> archived.
 * Nie usuwa danych; archived nie pojawia się w katalogu ani w "moich".
 */
export async function archiveCourse(courseId: string): Promise<ActionResult<void>> {
    try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return { success: false, error: 'Brak autoryzacji' }

        const { data: course } = await supabase
            .from('courses')
            .select('id, author_id, slug, status')
            .eq('id', courseId)
            .single()
        if (!course) return { success: false, error: 'Kurs nie istnieje' }

        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
        const isAdmin = ['admin'].includes(profile?.role || '')
        if (course.author_id !== user.id && !isAdmin) {
            return { success: false, error: 'Brak uprawnień' }
        }

        const { error } = await supabase
            .from('courses')
            .update({ status: 'archived', updated_at: new Date().toISOString() })
            .eq('id', courseId)
        if (error) throw error

        revalidatePath('/learning')
        revalidatePath('/learning/tworze')
        revalidatePath('/admin/learning')
        revalidatePath(`/learning/${course.slug}`)
        return { success: true, data: undefined }
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Błąd archiwizacji'
        console.error('[archiveCourse]', error)
        return { success: false, error: msg }
    }
}
