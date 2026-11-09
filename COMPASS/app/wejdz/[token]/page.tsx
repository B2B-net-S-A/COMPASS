import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Compass } from 'lucide-react'
import { LearnerInfoNotice } from '@/components/academy/LearnerInfoNotice'
import { LearnerPassForm } from '@/components/academy/LearnerPassForm'
import { maskLearnerEmail, resolveLearnerPass, type LearnerPassResolution } from '@/lib/academy/learner-entry'
import { logger } from '@/lib/logger'
import { CURRENT_LEARNER_INFO_VERSION } from '@/lib/academy/learner-info'
import { createServiceClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Wejście do Akademii | COMPASS',
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
}

function validUntil(expiresAt: number): string {
    return new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Warsaw' }).format(new Date(expiresAt * 1000))
}

/** Tylko odczyt: skanery poczty otwierają linki, więc konto powstaje dopiero po POST. */
export default async function LearnerPassPage({ params }: { params: { token: string } }) {
    // Brak konfiguracji albo awaria bazy wygląda tak samo jak nieważny link.
    const resolved = await (async () => resolveLearnerPass(createServiceClient() as unknown as SupabaseClient, params.token))()
        .catch((error: unknown): LearnerPassResolution => {
            logger.error({ event: 'academy.learner_entry.resolve_failed', error })
            return { status: 'not_found' }
        })
    if (resolved.status === 'not_found') notFound()

    return (
        <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-10">
            <section className="w-full space-y-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Compass className="h-6 w-6" aria-hidden="true" />
                </div>
                {resolved.status === 'used' ? (
                    <>
                        <h1 className="text-xl font-bold">Ten link został już użyty</h1>
                        <p className="text-sm text-muted-foreground">Link działa tylko raz. Podaj swój adres, a dostaniesz nowy.</p>
                        <Link href="/wejdz" className="text-sm font-medium text-primary underline underline-offset-2">Poproś o nowy link</Link>
                    </>
                ) : (
                    <>
                        <div className="space-y-2">
                            <h1 className="text-xl font-bold">Cześć, to Twoje miejsce w Akademii COMPASS</h1>
                            <p className="text-sm text-muted-foreground">Konto dla {maskLearnerEmail(resolved.account.email)}. Otwarcie linku niczego nie zapisuje.</p>
                        </div>
                        <LearnerInfoNotice />
                        <LearnerPassForm token={params.token} version={CURRENT_LEARNER_INFO_VERSION} />
                        <p className="text-xs text-muted-foreground">Link osobisty, ważny do {validUntil(resolved.claims.expiresAt)}</p>
                    </>
                )}
            </section>
        </main>
    )
}
