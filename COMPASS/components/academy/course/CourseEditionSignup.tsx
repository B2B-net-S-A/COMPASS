'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { registerAcademyRun } from '@/lib/actions/academy-sessions'

export function CourseEditionSignup({ runId, waitlist }: { runId: string; waitlist: boolean }) {
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useAcademyAction()

    function register() {
        setError(null)
        startTransition(async () => {
            try {
                const result = await registerAcademyRun(runId)
                if (!result.success) setError(result.error)
                // A refusal means the page is stale; reloading it removes the offer.
                router.refresh()
            } catch {
                setError('Nie udało się zapisać na edycję. Spróbuj ponownie.')
            }
        })
    }

    return <div className="space-y-2">
        <Button className="w-full" disabled={isPending} onClick={register}>{isPending && <Loader2 className="animate-spin" aria-hidden="true" />}{waitlist ? 'Dołącz do listy rezerwowej' : 'Zapisz się'}</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <p className="text-center text-xs text-muted-foreground">{waitlist ? 'Link do Teams i plik kalendarza dostaniesz po potwierdzeniu miejsca' : 'Po zapisie dostaniesz link do Teams i plik kalendarza'}</p>
    </div>
}
