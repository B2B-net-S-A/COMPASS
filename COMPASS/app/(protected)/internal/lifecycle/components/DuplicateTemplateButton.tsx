'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { duplicateTemplate } from '@/lib/actions/lifecycle'

export function DuplicateTemplateButton({ templateId }: { templateId: string }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    function handleDuplicate() {
        startTransition(async () => {
            try {
                const newId = await duplicateTemplate(templateId)
                toastSuccess('Szablon zduplikowany — przejście do kopii.')
                router.push(`/internal/lifecycle/templates/${newId}`)
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd duplikacji.')
            }
        })
    }

    return (
        <Button size="sm" variant="outline" onClick={handleDuplicate} disabled={isPending}>
            {isPending ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Copy className="h-3 w-3 mr-2" />}
            Duplikuj
        </Button>
    )
}
