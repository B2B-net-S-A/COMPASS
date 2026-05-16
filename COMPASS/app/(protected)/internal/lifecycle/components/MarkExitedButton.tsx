'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { markEmployeeExited } from '@/lib/actions/lifecycle'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'

export function MarkExitedButton({ userId }: { userId: string }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    function handleClick() {
        if (!confirm('Oznaczyć pracownika jako exited? Status zmieni się na "exited" i nie będzie można go cofnąć.')) {
            return
        }
        startTransition(async () => {
            try {
                await markEmployeeExited(userId)
                toastSuccess('Pracownik oznaczony jako exited.')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd przy zmianie statusu.')
            }
        })
    }

    return (
        <Button onClick={handleClick} disabled={isPending} variant="default">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogOut className="h-4 w-4 mr-2" />}
            Oznacz jako exited
        </Button>
    )
}
