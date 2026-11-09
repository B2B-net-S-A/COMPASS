import { z } from 'zod'
import { generateParticipationPdf, participationFilename } from '@/lib/pdf/certificate'
import { withAuth } from '@/lib/api/with-auth'
import { academyClient } from '@/lib/academy/server'
import { isMissingDatabaseObject, MIGRATION_PENDING_PL } from '@/lib/academy/migration-contract'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const snapshotSchema = z.object({
    course_title: z.string().min(1),
    participant_name: z.string().min(1),
    run_title: z.string().nullable(),
    issued_at: z.string().refine(value => Number.isFinite(Date.parse(value))),
    document_code: z.string().min(16),
    version_number: z.number().int().positive(),
})

/** Tylko zapisany dokument daje zaświadczenie; ten GET niczego nie zapisuje. */
export const GET = withAuth(async (request, { user }) => {
    const enrollmentId = request.nextUrl.searchParams.get('enrollmentId')
    if (!z.uuid().safeParse(enrollmentId).success) return new Response('Nieprawidłowy identyfikator zapisu.', { status: 400 })
    const { data, error } = await academyClient().from('academy_participation_documents')
        .select('snapshot').eq('enrollment_id', enrollmentId!).eq('user_id', user.id).maybeSingle()
    if (isMissingDatabaseObject(error)) return new Response(MIGRATION_PENDING_PL, { status: 503 })
    if (error || !data) return new Response('Zaświadczenie jest dostępne po potwierdzeniu obecności.', { status: 404 })
    const parsed = snapshotSchema.safeParse(data.snapshot)
    if (!parsed.success) {
        logger.error({ event: 'academy.participation.invalid_snapshot', enrollmentId })
        return new Response('Nie udało się odczytać zaświadczenia. Skontaktuj się z administratorem.', { status: 500 })
    }
    const snapshot = parsed.data
    const pdfBytes = await generateParticipationPdf({
        fullName: snapshot.participant_name, courseTitle: snapshot.course_title, runTitle: snapshot.run_title,
        issuedAt: snapshot.issued_at, documentCode: snapshot.document_code, versionNumber: snapshot.version_number,
    })
    return new Response(Buffer.from(pdfBytes), { headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${participationFilename(snapshot.course_title, snapshot.participant_name)}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
    } })
}, { role: ['consultant', 'admin', 'talent_community'] })
