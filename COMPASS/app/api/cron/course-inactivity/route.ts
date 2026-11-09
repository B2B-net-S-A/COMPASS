import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logCompat } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { holdAcademyMail } from '@/lib/academy/outbound'
import { buildCourseInactivityEmail } from '@/lib/email'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'
import { selectInChunks } from '@/lib/supabase/select-in-chunks'

export const dynamic = 'force-dynamic'

const REMINDER_PERIOD_MS = 7 * 86_400_000
// Przypomnienie zostaje `held`, więc last_inactivity_email_at się nie zmienia i ten sam zapis
// kwalifikuje się w każdym przebiegu. Dlatego czytamy stronami po id (kursor w obrębie
// przebiegu), a zapisy z przypomnieniem z tego tygodnia odsiewamy przed bramką. Nowych
// wiadomości na przebieg jest najwyżej MAX_HOLDS_PER_RUN; resztę bierze kolejny przebieg,
// bo te już wstrzymane odpadną w odsiewie.
const PAGE_SIZE = 500
const MAX_HOLDS_PER_RUN = 500
/** Bezpiecznik pętli: 200 stron to 100 000 zapisów. Dojście do niego to alarm, nie norma. */
const MAX_PAGES = 200
/** Klucz ma około 60 znaków, więc 30 kluczy to około 2 kB query stringu. */
const DEDUPE_KEY_CHUNK = 30

interface InactiveEnrollment {
    id: string; user_id: string; course_id: string; version_id: string; run_id: string | null
    completed_lessons: string[] | null; last_accessed_at: string; last_inactivity_email_at: string | null
}
interface Eligibility {
    courses: Array<{ id: string; slug: string; status: string }>
    versions: Array<{ id: string; status: string; metadata: { title?: string } | null }>
    lessons: Array<{ id: string; version_id: string }>
    profiles: Array<{ id: string; full_name: string | null; email: string | null; role: string; is_external: boolean | null; employment_status: string | null }>
    runs: Array<{ id: string; status: string }>
    registrations: Array<{ enrollment_id: string; user_id: string; run_id: string; status: string }>
}

async function readEligibility(client: SupabaseClient, enrollments: InactiveEnrollment[]): Promise<Eligibility> {
    const versionIds = enrollments.map(enrollment => enrollment.version_id)
    const runIds = enrollments.flatMap(enrollment => enrollment.run_id ? [enrollment.run_id] : [])
    const [courses, versions, lessons, profiles, runs, registrations] = await Promise.all([
        selectInChunks<Eligibility['courses'][number]>({ source: 'courses', column: 'id', ids: enrollments.map(enrollment => enrollment.course_id), query: () => client.from('courses').select('id,slug,status') }),
        selectInChunks<Eligibility['versions'][number]>({ source: 'course_versions', column: 'id', ids: versionIds, query: () => client.from('course_versions').select('id,status,metadata') }),
        selectInChunks<Eligibility['lessons'][number]>({ source: 'course_lessons', column: 'version_id', ids: versionIds, query: () => client.from('course_lessons').select('id,version_id') }),
        selectInChunks<Eligibility['profiles'][number]>({ source: 'profiles', column: 'id', ids: enrollments.map(enrollment => enrollment.user_id), query: () => client.from('profiles').select('id,full_name,email,role,is_external,employment_status') }),
        selectInChunks<Eligibility['runs'][number]>({ source: 'course_runs', column: 'id', ids: runIds, query: () => client.from('course_runs').select('id,status') }),
        selectInChunks<Eligibility['registrations'][number]>({ source: 'course_run_registrations', column: 'run_id', ids: runIds, query: () => client.from('course_run_registrations').select('enrollment_id,user_id,run_id,status') }),
    ])
    return { courses, versions, lessons, profiles, runs, registrations }
}

/** Klucze już obecne w kolejce. Przy błędzie odczytu pusty zbiór: powtórkę i tak zatrzyma UNIQUE(dedupe_key). */
async function heldKeys(client: SupabaseClient, keys: string[]): Promise<ReadonlySet<string>> {
    try {
        const rows = await selectInChunks<{ dedupe_key: string }>({
            source: 'academy_outbox', column: 'dedupe_key', ids: keys, chunkSize: DEDUPE_KEY_CHUNK,
            query: () => client.from('academy_outbox').select('dedupe_key'),
        })
        return new Set(rows.map(row => row.dedupe_key))
    } catch (error) {
        logCompat.error('[course-inactivity] outbox read failed, relying on dedupe_key:', error)
        return new Set()
    }
}

/** Remind active participants about their exact enrollment, at most weekly.
 * Service reads count every lesson in its immutable version, including drip content.
 */
export const GET = withCronAuth(withCronHeartbeat('COURSE_INACTIVITY_RUN', async (_request, { admin }) => {
    const client = admin as unknown as SupabaseClient
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000).toISOString()
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://compass.dynaminds.pl'
    // Przypomnienie powstaje jako wiersz wstrzymany. last_inactivity_email_at zostaje
    // nietknięte, bo nic nie wyszło; powtórkę tego samego tygodnia zatrzymuje dedupe_key.
    const batchId = randomUUID()
    const weekBucket = Math.floor(Date.now() / REMINDER_PERIOD_MS)
    const expiresAt = new Date(Date.now() + REMINDER_PERIOD_MS).toISOString()
    const dedupeKey = (enrollment: InactiveEnrollment) => `course_inactivity:${enrollment.id}:${weekBucket}`
    let held = 0, duplicate = 0, failed = 0, skipped = 0, totalEligible = 0, queueUnavailable = false
    let more = false, exhausted = false
    let cursor: string | null = null
    const result = (ok: boolean, extra: Record<string, unknown> = {}) =>
        NextResponse.json({ ok, total_eligible: totalEligible, sent: 0, held, duplicate, failed, skipped, more, ...extra }, { status: ok ? 200 : 500 })

    pages: for (let page = 0; page < MAX_PAGES; page++) {
        let query = client.from('course_enrollments')
            .select('id,user_id,course_id,version_id,run_id,completed_lessons,last_accessed_at,last_inactivity_email_at')
            .is('completed_at', null).not('last_accessed_at', 'is', null).lt('last_accessed_at', threeDaysAgo)
            .or(`last_inactivity_email_at.is.null,last_inactivity_email_at.lt.${sevenDaysAgo}`)
        if (cursor) query = query.gt('id', cursor)
        const { data, error } = await query.order('id').limit(PAGE_SIZE)
        if (error) {
            logCompat.error('[course-inactivity] enrollment read failed:', error)
            return result(false, { error: 'Nie udało się odczytać zapisów.' })
        }
        const enrollments = (data ?? []) as InactiveEnrollment[]
        if (!enrollments.length) { exhausted = true; break }
        cursor = enrollments[enrollments.length - 1].id

        let eligibility: Eligibility
        try {
            eligibility = await readEligibility(client, enrollments)
        } catch (readError) {
            logCompat.error('[course-inactivity] eligibility read failed:', readError)
            return result(false, { error: 'Nie udało się potwierdzić aktywnych zapisów.' })
        }
        const { courses, versions, lessons, profiles, runs, registrations } = eligibility
        const alreadyHeld = await heldKeys(client, enrollments.map(dedupeKey))
        for (const enrollment of enrollments) {
            const course = courses.find(row => row.id === enrollment.course_id)
            const version = versions.find(row => row.id === enrollment.version_id)
            const profile = profiles.find(row => row.id === enrollment.user_id)
            const runActive = !enrollment.run_id || (runs.some(row => row.id === enrollment.run_id && row.status === 'published') && registrations.some(row => row.enrollment_id === enrollment.id && row.user_id === enrollment.user_id && row.run_id === enrollment.run_id && row.status === 'confirmed'))
            if (!runActive || course?.status !== 'published' || version?.status !== 'published' || !version.metadata?.title || !profile?.email || profile.is_external || profile.employment_status === 'exited' || !['consultant', 'admin'].includes(profile.role)) { skipped++; continue }
            const lessonIds = new Set(lessons.filter(row => row.version_id === enrollment.version_id).map(row => row.id))
            const completedLessons = [...new Set(enrollment.completed_lessons ?? [])].filter(id => lessonIds.has(id)).length
            if (!completedLessons || !lessonIds.size) { skipped++; continue }
            if (alreadyHeld.has(dedupeKey(enrollment))) { totalEligible++; duplicate++; continue }
            if (held >= MAX_HOLDS_PER_RUN) { more = true; break pages }
            totalEligible++
            const email = buildCourseInactivityEmail(profile.full_name ?? profile.email, {
                courseTitle: version.metadata.title,
                courseSlug: course.slug,
                enrollmentId: enrollment.id,
                progressPercent: Math.min(99, Math.round(completedLessons / lessonIds.size * 100)),
                completedLessons,
                totalLessons: lessonIds.size,
                lastAccessDaysAgo: Math.floor((Date.now() - Date.parse(enrollment.last_accessed_at)) / 86400000),
                appUrl,
            })
            const outcome = await holdAcademyMail(client, {
                kind: 'course_inactivity', recipient: profile.email, ...email, expiresAt, batchId,
                dedupeKey: dedupeKey(enrollment), runId: enrollment.run_id ?? undefined,
            })
            if (outcome.status === 'held') held++
            else if (outcome.status === 'duplicate') duplicate++
            else {
                failed++
                // Kolejka niedostępna: kolejne próby tylko mnożyłyby zdarzenia w Sentry.
                if (outcome.reason === 'migration_pending' || outcome.reason === 'write_failed') { queueUnavailable = true; break pages }
            }
        }
        if (enrollments.length < PAGE_SIZE) { exhausted = true; break }
    }
    // Bezpiecznik zadziałał, zanim lista się skończyła: dalszych zapisów ten przebieg nie
    // przeczytał. To alarm (500), żeby nie zostało to po cichu.
    const truncated = !exhausted && !more && !queueUnavailable
    if (truncated) logCompat.error('[course-inactivity] page cap reached before the list ended:', MAX_PAGES)
    return result(failed === 0 && !queueUnavailable && !truncated, truncated ? { truncated: true } : {})
}))
