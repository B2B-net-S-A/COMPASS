'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { completeOnboarding } from '@/lib/actions/lifecycle'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'

export function CompleteOnboardingButton({ progressId }: { progressId: string }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    function handleClick() {
        if (!confirm('Czy na pewno chcesz oznaczyć onboarding jako zakończony? Status pracownika zmieni się na "active".')) {
            return
        }
        startTransition(async () => {
            try {
                await completeOnboarding(progressId)
                toastSuccess('Onboarding zakończony — pracownik jest teraz active.')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd przy zamykaniu onboardingu')
            }
        })
    }

    return (
        <Button onClick={handleClick} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
            Zakończ onboarding
        </Button>
    )
}
