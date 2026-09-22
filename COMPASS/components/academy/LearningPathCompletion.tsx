'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { checkLearningPathCompletion } from '@/lib/actions/learning-paths'
import { useAcademyAction } from './useAcademyAction'

export function LearningPathCompletion({ pathId }: { pathId: string }) {
    const router = useRouter()
    const [pending, runAction] = useAcademyAction()
    const [message, setMessage] = useState<string | null>(null)
    function complete() {
        runAction(async () => {
            try {
                const result = await checkLearningPathCompletion(pathId)
                if (!result.success) { setMessage(result.error); return }
                setMessage(result.data.completed ? 'Ścieżka została ukończona.' : 'Ukończ wszystkie obowiązkowe szkolenia przypisane do Twojej ścieżki.')
                if (result.data.completed) router.refresh()
            } catch { setMessage('Nie udało się sprawdzić ukończenia. Spróbuj ponownie.') }
        })
    }
    return <div className="space-y-2 pt-3"><Button onClick={complete} disabled={pending} variant="outline">{pending ? 'Sprawdzanie…' : 'Sprawdź ukończenie ścieżki'}</Button>{message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}</div>
}
