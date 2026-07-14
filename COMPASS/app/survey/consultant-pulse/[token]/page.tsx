import type { Metadata } from 'next'
import { Compass } from 'lucide-react'
import { PulseSurveyForm } from '@/components/consultant-success/PulseSurveyForm'
import { isPulseTokenAvailable, PULSE_UNAVAILABLE_MESSAGE } from '@/lib/consultant-success-public'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
    title: 'Ankieta współpracy | Compass',
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
}

export default async function ConsultantPulsePage({ params }: { params: { token: string } }) {
    const available = await isPulseTokenAvailable(params.token)

    return (
        <main className="relative mx-auto flex min-h-screen w-full max-w-2xl items-center px-4 py-10 sm:px-6">
            <section className="w-full rounded-2xl border bg-card p-6 shadow-sm sm:p-10">
                <header className="mb-8 space-y-4 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Compass className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">Krótka ankieta współpracy</h1>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                            Odpowiedź jest przypisana do Twojej kartoteki konsultanta i będzie widoczna wyłącznie dla zespołu Talent Community oraz administratorów Compass. Ankieta nie jest anonimowa.
                        </p>
                    </div>
                </header>

                {available ? (
                    <PulseSurveyForm token={params.token} />
                ) : (
                    <p className="rounded-md border bg-muted/40 p-6 text-center text-sm text-muted-foreground" role="status">
                        {PULSE_UNAVAILABLE_MESSAGE}
                    </p>
                )}
            </section>
        </main>
    )
}
