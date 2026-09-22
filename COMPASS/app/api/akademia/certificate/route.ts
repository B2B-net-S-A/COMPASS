import { z } from 'zod'
import { certificateFilename, generateCertificatePdf } from '@/lib/pdf/certificate'
import { withAuth } from '@/lib/api/with-auth'
import { academyClient } from '@/lib/academy/server'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const certificateSnapshotSchema = z.object({
    course_title: z.string().min(1),
    participant_name: z.string().min(1),
    author_name: z.string().nullable(),
    completed_at: z.string().refine(value => Number.isFinite(Date.parse(value))),
    certificate_hash: z.string().min(16),
    version_number: z.number().int().positive(),
})

/** Only persisted completion evidence may issue a certificate; this GET never writes. */
export const GET = withAuth(async (request, { user }) => {
    const courseId = request.nextUrl.searchParams.get('courseId')
    const requestedEnrollment = request.nextUrl.searchParams.get('enrollmentId')
    if (!z.uuid().safeParse(courseId).success || (requestedEnrollment && !z.uuid().safeParse(requestedEnrollment).success)) {
        return new Response('Nieprawidłowy identyfikator szkolenia lub zapisu.', { status: 400 })
    }
    const client = academyClient()
    let query = client.from('course_enrollments').select('id').eq('user_id', user.id).eq('course_id', courseId!)
    query = requestedEnrollment ? query.eq('id', requestedEnrollment) : query.is('run_id', null)
    const { data: enrollment, error: enrollmentError } = await query.maybeSingle()
    if (enrollmentError || !enrollment) return new Response('Zapis jest niedostępny.', { status: 404 })
    const { data: completion, error } = await client.from('course_completions')
        .select('id,certificate_snapshot,revoked_at,revoked_reason').eq('enrollment_id', enrollment.id).eq('course_id', courseId!).eq('user_id', user.id).maybeSingle()
    if (error || !completion) return new Response('Certyfikat jest dostępny po ukończeniu szkolenia.', { status: 404 })
    if (completion.revoked_at) return new Response(`Certyfikat został unieważniony. Powód: ${completion.revoked_reason}`, { status: 410, headers: { 'Cache-Control': 'private, no-store' } })
    const parsed = certificateSnapshotSchema.safeParse(completion.certificate_snapshot)
    if (!parsed.success) {
        logger.error({ event: 'academy.certificate.invalid_snapshot', enrollmentId: enrollment.id })
        return new Response('Nie udało się odczytać certyfikatu. Skontaktuj się z administratorem.', { status: 500 })
    }
    const snapshot = parsed.data
    const pdfBytes = await generateCertificatePdf({
        fullName: snapshot.participant_name,
        courseTitle: snapshot.course_title,
        courseAuthorName: snapshot.author_name,
        completedAt: snapshot.completed_at,
        certificateHash: snapshot.certificate_hash,
        versionNumber: snapshot.version_number,
        verificationUrl: completion.id ? `${request.nextUrl.origin}/learning/certyfikaty/${completion.id}` : undefined,
    })
    return new Response(Buffer.from(pdfBytes), { headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${certificateFilename(snapshot.course_title, snapshot.participant_name)}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
    } })
}, { role: ['consultant', 'admin'] })
