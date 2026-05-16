import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getMyExitInterview } from '@/lib/actions/lifecycle'
import { requireLifecycleHubLayout } from '@/lib/auth/internal-guard'
import { ExitInterviewForm } from '../../components/ExitInterviewForm'
import { LogOut } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function FillExitInterviewPage() {
    await requireLifecycleHubLayout()
    const interview = await getMyExitInterview()

    if (!interview) {
        return (
            <div className="container mx-auto p-6 max-w-2xl">
                <div className="rounded-lg border bg-card p-8 text-center">
                    <LogOut className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                        Nie masz zaplanowanego exit interview. Jeśli to błąd — skontaktuj się z Talent Community Managerem.
                    </p>
                    <Link href="/internal" className="text-sm underline text-primary mt-4 inline-block">
                        Wróć do strefy wewnętrznej
                    </Link>
                </div>
            </div>
        )
    }

    if (interview.status !== 'scheduled') {
        return (
            <div className="container mx-auto p-6 max-w-2xl">
                <div className="rounded-lg border bg-card p-8 text-center">
                    <h2 className="font-semibold mb-2">Ankieta już wypełniona</h2>
                    <p className="text-sm text-muted-foreground">
                        Dziękujemy! Twoja ankieta exit interview została wysłana. Status: <strong>{interview.status}</strong>.
                    </p>
                    <Link href="/internal" className="text-sm underline text-primary mt-4 inline-block">
                        Wróć do strefy wewnętrznej
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto p-6 max-w-3xl space-y-6">
            <header>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <LogOut className="h-7 w-7 text-amber-400" />
                    Exit interview
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Dziękujemy za czas w B2B Network. Twoja szczera opinia pomoże nam stać się lepszą firmą.
                    Możesz wypełnić ankietę z imienia i nazwiska lub anonimowo (checkbox na końcu).
                </p>
            </header>
            <ExitInterviewForm interviewId={interview.id} />
        </div>
    )
}
