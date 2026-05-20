import Link from 'next/link'
import { getMyExitInterview } from '@/lib/actions/lifecycle'
import { requireLifecycleHubLayout } from '@/lib/auth/internal-guard'
import { LogOut } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ExitInfoPage() {
    await requireLifecycleHubLayout()
    const interview = await getMyExitInterview()

    return (
        <div className="container mx-auto p-6 max-w-2xl">
            <div className="rounded-lg border bg-card p-8 text-center">
                <LogOut className="h-12 w-12 mx-auto mb-3 text-amber-400" />
                {interview ? (
                    <>
                        <h2 className="font-semibold mb-2">Offboarding w toku</h2>
                        <p className="text-sm text-muted-foreground">
                            Twój offboarding prowadzi zespół Talent Community Manager.
                            Nie musisz wypełniać żadnej ankiety — wszystkimi formalnościami zajmie się dział.
                            W razie pytań skontaktuj się z Talent Community Managerem.
                        </p>
                    </>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Nie masz zaplanowanego offboardingu. Jeśli to błąd — skontaktuj się z Talent Community Managerem.
                    </p>
                )}
                <Link href="/internal" className="text-sm underline text-primary mt-4 inline-block">
                    Wróć do strefy wewnętrznej
                </Link>
            </div>
        </div>
    )
}
