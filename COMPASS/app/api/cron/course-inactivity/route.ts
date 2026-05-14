import { logCompat } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { sendCourseInactivityReminder } from '@/lib/email'
import { withCronAuth } from '@/lib/api/with-auth'

export const dynamic = 'force-dynamic'

/**
 * A1.5: Course inactivity reminder cron.
 *
 * Trigger: codziennie o 09:00 (configure in Coolify cron).
 *   curl -X GET "https://compass.dynaminds.pl/api/cron/course-inactivity?secret=$CRON_SECRET"
 *
 * Logic:
 *  - Foreach active enrollment (completed_at IS NULL, progress > 0%)
 *  - Jeśli last_accessed_at < now() - 3 days AND (last_inactivity_email_at < now() - 7 days OR NULL)
 *  - Wyślij reminder email + zapisz last_inactivity_email_at
 *
 * Anty-spam: max 1 email / enrollment / tydzień.
 * Anty-noise: tylko enrollments z >0% progress (nie polecaj kursu który user nigdy nie tknął).
 */
export const GET = withCronAuth(async (_request, { admin }) => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://compass.dynaminds.pl'

    // Pull active enrollments z last_accessed_at < 3 dni temu i wysłany email > 7 dni temu (lub null)
    const { data: enrollments, error: enrErr } = await admin
        .from('course_enrollments')
        .select(
            'id, user_id, course_id, completed_lessons, last_accessed_at, last_inactivity_email_at, course:courses(id, title, slug, status)',
        )
        .is('completed_at', null)
        .not('last_accessed_at', 'is', null)
        .lt('last_accessed_at', threeDaysAgo)
        .or(`last_inactivity_email_at.is.null,last_inactivity_email_at.lt.${sevenDaysAgo}`)
        .limit(500) // safety cap
    if (enrErr) {
        logCompat.error('[course-inactivity] enrollments fetch error:', enrErr)
        return NextResponse.json({ error: enrErr.message }, { status: 500 })
    }

    type EnrollmentRow = {
        id: string
        user_id: string
        course_id: string
        completed_lessons: string[] | null
        last_accessed_at: string | null
        last_inactivity_email_at: string | null
        // Supabase zwraca relację 1-to-1 jako tablicę kiedy nie ma `.single()`
        course: { id: string; title: string; slug: string; status: string }[] | null
    }
    const eligibleRaw = (enrollments ?? []) as unknown as EnrollmentRow[]

    // Normalize course (array → single object)
    type EnrollmentNormalized = Omit<EnrollmentRow, 'course'> & {
        course: { id: string; title: string; slug: string; status: string } | null
    }
    const eligible: EnrollmentNormalized[] = eligibleRaw.map((e) => ({
        ...e,
        course: Array.isArray(e.course) ? (e.course[0] ?? null) : e.course,
    }))

    // Filter: kurs published + completed_lessons.length > 0 (anty-noise)
    const activeWithProgress = eligible.filter(
        (e) => e.course?.status === 'published' && (e.completed_lessons?.length ?? 0) > 0,
    )

    if (activeWithProgress.length === 0) {
        return NextResponse.json({ ok: true, sent: 0, skipped: 0, total_eligible: 0 })
    }

    // Pull total lessons per course (one query)
    const courseIds = Array.from(new Set(activeWithProgress.map((e) => e.course_id)))
    const { data: lessonCounts } = await admin
        .from('course_lessons')
        .select('course_id')
        .in('course_id', courseIds)
    const lessonCountMap = new Map<string, number>()
    for (const l of (lessonCounts ?? []) as Array<{ course_id: string }>) {
        lessonCountMap.set(l.course_id, (lessonCountMap.get(l.course_id) ?? 0) + 1)
    }

    // Pull profile contacts
    const userIds = Array.from(new Set(activeWithProgress.map((e) => e.user_id)))
    const { data: profiles } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
    const profileMap = new Map<string, { full_name: string | null; email: string }>()
    for (const p of (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string }>) {
        profileMap.set(p.id, { full_name: p.full_name, email: p.email })
    }

    let sent = 0
    let failed = 0
    let skipped = 0

    for (const e of activeWithProgress) {
        const profile = profileMap.get(e.user_id)
        if (!profile?.email || !e.course) {
            skipped += 1
            continue
        }
        const totalLessons = lessonCountMap.get(e.course_id) ?? 0
        const completedLessons = e.completed_lessons?.length ?? 0
        if (totalLessons === 0) {
            skipped += 1
            continue
        }
        const progress = Math.min(100, Math.round((completedLessons / totalLessons) * 100))
        const lastAccess = e.last_accessed_at ? new Date(e.last_accessed_at) : null
        const daysAgo = lastAccess ? Math.floor((Date.now() - lastAccess.getTime()) / (24 * 60 * 60 * 1000)) : 0

        const result = await sendCourseInactivityReminder(profile.email, profile.full_name ?? profile.email, {
            courseTitle: e.course.title,
            courseSlug: e.course.slug,
            progressPercent: progress,
            completedLessons,
            totalLessons,
            lastAccessDaysAgo: daysAgo,
            appUrl,
        })

        if (result.success) {
            sent += 1
            // Mark email sent timestamp
            await admin
                .from('course_enrollments')
                .update({ last_inactivity_email_at: new Date().toISOString() })
                .eq('id', e.id)
        } else {
            failed += 1
        }
    }

    return NextResponse.json({
        ok: true,
        total_eligible: activeWithProgress.length,
        sent,
        failed,
        skipped,
    })
})
