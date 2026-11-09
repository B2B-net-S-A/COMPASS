import type { Metadata } from 'next'
import { Compass } from 'lucide-react'
import { LearnerReentryForm } from '@/components/academy/LearnerReentryForm'

export const metadata: Metadata = {
    title: 'Wejście do Akademii | COMPASS',
    robots: { index: false, follow: false, nocache: true },
    referrer: 'no-referrer',
}

export default function LearnerReentryPage() {
    return (
        <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-10">
            <section className="w-full space-y-5 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Compass className="h-6 w-6" aria-hidden="true" />
                </div>
                <div className="space-y-2">
                    <h1 className="text-xl font-bold">Wejdź ponownie do Akademii</h1>
                    <p className="text-sm text-muted-foreground">Podaj adres, na który masz konto w Akademii. Wyślemy link ważny 15 minut.</p>
                </div>
                <LearnerReentryForm />
            </section>
        </main>
    )
}
