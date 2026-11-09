import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { CERTIFICATE_EXPIRY_NOTICE_DAYS, formatValidityDate } from '@/lib/academy/certificate-validity'
import { isMissingDatabaseObject } from '@/lib/academy/migration-contract'
import { holdAcademyMail } from '@/lib/academy/outbound'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'
import { buildCertificateExpiryEmail } from '@/lib/email'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

interface ExpiringCertificate { completion_id: string; recipient: string; full_name: string | null; course_title: string; course_slug: string; valid_until: string }

/** Przypomnienie powstaje wyłącznie jako wiersz held. Termin wiersza to koniec ważności,
 * więc niewysłana wiadomość sama wygasa, a dedupe_key daje jedno przypomnienie na dokument. */
export const GET = withCronAuth(withCronHeartbeat('ACADEMY_CERTIFICATE_EXPIRY_RUN', async (_request, { admin }) => {
    const client = admin as unknown as SupabaseClient
    const { data, error } = await client.rpc('academy_certificates_expiring', { p_within_days: CERTIFICATE_EXPIRY_NOTICE_DAYS })
    if (isMissingDatabaseObject(error)) return NextResponse.json({ ok: true, migration_pending: true, held: 0 })
    if (error) {
        logger.error({ event: 'academy.certificate_expiry.read_failed', code: error.code })
        return NextResponse.json({ ok: false, error: 'Nie udało się odczytać certyfikatów.' }, { status: 500 })
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://compass.dynaminds.pl'
    const batchId = randomUUID()
    let held = 0, duplicate = 0, failed = 0
    for (const certificate of (data ?? []) as ExpiringCertificate[]) {
        const email = buildCertificateExpiryEmail(certificate.full_name ?? certificate.recipient, {
            courseTitle: certificate.course_title, courseSlug: certificate.course_slug, completionId: certificate.completion_id,
            validUntil: formatValidityDate(certificate.valid_until), appUrl,
        })
        const outcome = await holdAcademyMail(client, {
            kind: 'certificate_expiry', recipient: certificate.recipient, ...email, expiresAt: certificate.valid_until, batchId,
            dedupeKey: `certificate_expiry:${certificate.completion_id}`,
        })
        if (outcome.status === 'held') held++
        else if (outcome.status === 'duplicate') duplicate++
        else {
            failed++
            if (outcome.reason === 'migration_pending' || outcome.reason === 'write_failed') break
        }
    }
    const ok = failed === 0
    return NextResponse.json({ ok, sent: 0, held, duplicate, failed }, { status: ok ? 200 : 500 })
}))
