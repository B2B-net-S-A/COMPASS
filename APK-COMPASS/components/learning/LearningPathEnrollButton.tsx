'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Map, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { enrollInLearningPath } from '@/lib/actions/learning-paths'

export function LearningPathEnrollButton({ pathId }: { pathId: string }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()

    const handleEnroll = () => {
        startTransition(async () => {
            const res = await enrollInLearningPath(pathId)
            if (!res.success) {
                toast.error(res.error)
                return
            }
            toastSuccess('Zapisano na ścieżkę')
            router.refresh()
        })
    }

    return (
        <Button onClick={handleEnroll} disabled={pending} className="gap-2">
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Map className="w-4 h-4" />}
            Zapisz się na ścieżkę
        </Button>
    )
}
