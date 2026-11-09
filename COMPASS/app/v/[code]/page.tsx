import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PublicDocumentCard } from '@/components/academy/PublicDocumentCard'
import { allowVerifyRequest, resolvePublicDocument } from '@/lib/academy/document-verify'
import { clientIp } from '@/lib/academy/reentry-rate-limit'
import { logger } from '@/lib/logger'
import { createServiceClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Weryfikacja dokumentu | COMPASS',
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
}

/** Publiczna strona bez wyniku testu; nieznany kod i wyłączony przełącznik wyglądają tak samo. */
export default async function VerifyDocumentPage({ params }: { params: { code: string } }) {
    if (!allowVerifyRequest(clientIp(headers()))) {
        return <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-10"><p role="status" className="w-full rounded-2xl border bg-card p-6 text-center text-sm">Zbyt wiele sprawdzeń z tego adresu. Spróbuj ponownie za kilka minut.</p></main>
    }
    const document = await (async () => resolvePublicDocument(createServiceClient() as unknown as SupabaseClient, params.code))().catch((error: unknown) => {
        logger.error({ event: 'academy.document_verify.failed', error })
        return null
    })
    if (!document) notFound()
    return <PublicDocumentCard document={document} />
}
