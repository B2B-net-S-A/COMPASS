import type { SupabaseClient } from '@supabase/supabase-js'
import { logCompat } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { sendCourseInactivityReminder } from '@/lib/email'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'

export const dynamic = 'force-dynamic'

interface InactiveEnrollment {
    id: string; user_id: string; course_id: string; version_id: string; run_id: string | null
    completed_lessons: string[] | null; last_accessed_at: string; last_inactivity_email_at: string | null
}

/** Remind active participants about their exact enrollment, at most weekly.
 * Service reads count every lesson in its immutable version, including drip content.
 */
export const GET = withCronAuth(withCronHeartbeat('COURSE_INACTIVITY_RUN', async (_request, { admin }) => {
    const client = admin as unknown as SupabaseClient
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString()
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://compass.dynaminds.pl'
    const { data, error } = await client.from('course_enrollments')
        .select('id,user_id,course_id,version_id,run_id,completed_lessons,last_accessed_at,last_inactivity_email_at')
        .is('completed_at', null).not('last_accessed_at', 'is', null).lt('last_accessed_at', threeDaysAgo)
        .or(`last_inactivity_email_at.is.null,last_inactivity_email_at.lt.${sevenDaysAgo}`)
        .order('last_accessed_at').order('id').limit(500)
    if (error) {
        logCompat.error('[course-inactivity] enrollment read failed:', error)
        return NextResponse.json({ ok: false, error: 'Nie udało się odczytać zapisów.' }, { status: 500 })
    }
    const enrollments = (data ?? []) as InactiveEnrollment[]
    if (!enrollments.length) return NextResponse.json({ ok: true, sent: 0, failed: 0, skipped: 0, total_eligible: 0 })
    const versionIds = [...new Set(enrollments.map(enrollment => enrollment.version_id))]
    const runIds = [...new Set(enrollments.flatMap(enrollment => enrollment.run_id ? [enrollment.run_id] : []))]
    const [courses, versions, lessons, profiles, runs, registrations] = await Promise.all([
        client.from('courses').select('id,slug,status').in('id', [...new Set(enrollments.map(enrollment => enrollment.course_id))]),
        client.from('course_versions').select('id,status,metadata').in('id', versionIds),
        client.from('course_lessons').select('id,version_id').in('version_id', versionIds),
        client.from('profiles').select('id,full_name,email,role,is_external,employment_status').in('id', [...new Set(enrollments.map(enrollment => enrollment.user_id))]),
        runIds.length ? client.from('course_runs').select('id,status').in('id', runIds) : Promise.resolve({ data: [], error: null }),
        runIds.length ? client.from('course_run_registrations').select('enrollment_id,user_id,run_id,status').in('run_id', runIds) : Promise.resolve({ data: [], error: null }),
    ])
    const readError = [courses, versions, lessons, profiles, runs, registrations].find(result => result.error)?.error
    if (readError) {
        logCompat.error('[course-inactivity] eligibility read failed:', readError)
        return NextResponse.json({ ok: false, error: 'Nie udało się potwierdzić aktywnych zapisów.' }, { status: 500 })
    }
    let sent = 0, failed = 0, skipped = 0, totalEligible = 0
    for (const enrollment of enrollments) {
        const course = courses.data?.find(row => row.id === enrollment.course_id)
        const version = versions.data?.find(row => row.id === enrollment.version_id)
        const profile = profiles.data?.find(row => row.id === enrollment.user_id)
        const runActive = !enrollment.run_id || (runs.data?.some(row => row.id === enrollment.run_id && row.status === 'published') && registrations.data?.some(row => row.enrollment_id === enrollment.id && row.user_id === enrollment.user_id && row.run_id === enrollment.run_id && row.status === 'confirmed'))
        if (!runActive || course?.status !== 'published' || version?.status !== 'published' || !version.metadata?.title || !profile?.email || profile.is_external || profile.employment_status === 'exited' || !['consultant', 'admin'].includes(profile.role)) { skipped++; continue }
        const lessonIds = new Set((lessons.data ?? []).filter(row => row.version_id === enrollment.version_id).map(row => row.id))
        const completedLessons = [...new Set(enrollment.completed_lessons ?? [])].filter(id => lessonIds.has(id)).length
        if (!completedLessons || !lessonIds.size) { skipped++; continue }
        totalEligible++
        const result = await sendCourseInactivityReminder(profile.email, profile.full_name ?? profile.email, {
            courseTitle: version.metadata.title,
            courseSlug: course.slug,
            enrollmentId: enrollment.id,
            progressPercent: Math.min(99, Math.round(completedLessons / lessonIds.size * 100)),
            completedLessons,
            totalLessons: lessonIds.size,
            lastAccessDaysAgo: Math.floor((Date.now() - Date.parse(enrollment.last_accessed_at)) / 86400000),
            appUrl,
        })
        if (!result.success) { failed++; continue }
        sent++
        const { error: timestampError } = await client.from('course_enrollments').update({ last_inactivity_email_at: new Date().toISOString() }).eq('id', enrollment.id)
        if (timestampError) {
            failed++
            logCompat.error('[course-inactivity] delivery timestamp failed:', timestampError)
        }
    }
    return NextResponse.json({ ok: failed === 0, total_eligible: totalEligible, sent, failed, skipped }, { status: failed ? 500 : 200 })
}))
