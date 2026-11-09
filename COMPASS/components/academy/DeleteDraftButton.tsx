'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { deleteDraftCourse } from '@/lib/actions/courses'
import { useAcademyAction } from './useAcademyAction'

export function DeleteDraftButton({ courseId, title }: { courseId: string; title: string }) {
    const router = useRouter()
    const [confirm, ConfirmUI] = useConfirm()
    const [pending, run] = useAcademyAction()
    const [error, setError] = useState<string | null>(null)

    async function remove() {
        if (pending) return
        const accepted = await confirm({
            title: `Usunąć szkic „${title}”?`,
            description: 'Program, lekcje i pytania tego szkicu znikną bezpowrotnie. Szkolenia bez publikacji i bez zapisów nie można odzyskać.',
            confirmLabel: 'Usuń szkic', cancelLabel: 'Zachowaj szkic', variant: 'destructive',
        })
        if (!accepted) return
        setError(null)
        run(async () => {
            try {
                const result = await deleteDraftCourse(courseId)
                if (!result.success) { setError(result.error); return }
                router.refresh()
            } catch { setError('Nie udało się usunąć szkicu. Spróbuj ponownie.') }
        })
    }

    return <>
        <Button variant="outline" size="sm" onClick={remove} disabled={pending}><Trash2 aria-hidden="true" />{pending ? 'Usuwanie…' : 'Usuń szkic'}</Button>
        {error && <p role="alert" className="basis-full text-sm text-destructive">{error}</p>}
        <ConfirmUI />
    </>
}
