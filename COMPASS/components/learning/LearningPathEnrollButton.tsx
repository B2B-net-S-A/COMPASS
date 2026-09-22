'use client'

import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { useRouter } from 'next/navigation'
import { Map, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { enrollInLearningPath } from '@/lib/actions/learning-paths'

export function LearningPathEnrollButton({ pathId }: { pathId: string }) {
    const router = useRouter()
    const [pending, startTransition] = useAcademyAction()

    const handleEnroll = () => {
        startTransition(async () => {
            try {
                const res = await enrollInLearningPath(pathId)
                if (!res.success) {
                    toast.error(res.error)
                    return
                }
                toastSuccess('Zapisano na ścieżkę')
                router.refresh()
            } catch { toast.error('Nie udało się zapisać na ścieżkę. Spróbuj ponownie.') }
        })
    }

    return (
        <Button onClick={handleEnroll} disabled={pending} className="gap-2">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Map className="w-4 h-4" />}
            Zapisz się na ścieżkę
        </Button>
    )
}
