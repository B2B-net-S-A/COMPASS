import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
    certificateFilename,
    computeCertificateHash,
    generateCertificatePdf,
} from '@/lib/pdf/certificate'

export const dynamic = 'force-dynamic'

/**
 * A1.2: GET /api/akademia/certificate?courseId=<uuid>
 *
 * Generuje PDF certyfikatu ukończenia kursu dla zalogowanego użytkownika.
 * Wymagania:
 *  - User zalogowany
 *  - Enrollment istnieje + completed_at != NULL (kurs zaliczony)
 * Side effect:
 *  - Pierwsze pobranie: zapisuje certificate_issued_at + certificate_hash w course_enrollments
 *  - Kolejne: reużywa zapisanego hasha (deterministyczny — to samo PDF)
 */
export async function GET(request: NextRequest) {
    const courseId = request.nextUrl.searchParams.get('courseId')
    if (!courseId) {
        return new Response('Brak parametru courseId', { status: 400 })
    }

    const supabase = createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    if (!user) return new Response('Unauthorized', { status: 401 })

    // Pull enrollment + course + author w jednym query
    const { data: enrollment, error: enrErr } = await supabase
        .from('course_enrollments')
        .select(
            'id, completed_at, certificate_issued_at, certificate_hash, course:courses(id, title, author_id)',
        )
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .maybeSingle<{
            id: string
            completed_at: string | null
            certificate_issued_at: string | null
            certificate_hash: string | null
            course: { id: string; title: string; author_id: string } | null
        }>()
    if (enrErr || !enrollment) {
        return new Response('Nie jesteś zapisany na ten kurs', { status: 404 })
    }
    if (!enrollment.completed_at) {
        return new Response('Kurs musi być ukończony aby pobrać certyfikat', { status: 400 })
    }
    if (!enrollment.course) {
        return new Response('Kurs nie istnieje', { status: 404 })
    }

    // Pobierz dane usera (full_name) + autora kursu
    const [profileRes, authorRes] = await Promise.all([
        supabase.from('profiles').select('full_name, email').eq('id', user.id).single<{
            full_name: string | null
            email: string
        }>(),
        supabase
            .from('profiles')
            .select('full_name')
            .eq('id', enrollment.course.author_id)
            .maybeSingle<{ full_name: string | null }>(),
    ])

    if (!profileRes.data) {
        return new Response('Profile missing', { status: 500 })
    }

    const fullName = profileRes.data.full_name || profileRes.data.email
    const certHash =
        enrollment.certificate_hash ??
        computeCertificateHash(user.id, courseId, enrollment.completed_at)

    // First-time generation: zapisz cert metadata
    if (!enrollment.certificate_issued_at) {
        await supabase
            .from('course_enrollments')
            .update({
                certificate_issued_at: new Date().toISOString(),
                certificate_hash: certHash,
            })
            .eq('id', enrollment.id)
    }

    const pdfBytes = await generateCertificatePdf({
        fullName,
        courseTitle: enrollment.course.title,
        courseAuthorName: authorRes.data?.full_name ?? null,
        completedAt: enrollment.completed_at,
        certificateHash: certHash,
    })

    const filename = certificateFilename(enrollment.course.title, fullName)
    return new Response(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'private, no-cache',
        },
    })
}
