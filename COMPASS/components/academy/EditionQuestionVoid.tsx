'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { previewVoidQuestion, voidQuestion, type VoidImpact } from '@/lib/actions/academy-quiz-bank'

const FAILED = 'Nie udało się wykonać operacji. Odśwież stronę i spróbuj ponownie.'
const MIN_REASON = 5

export function EditionQuestionVoid({ courseId, questionId, questionNumber }: { courseId: string; questionId: string; questionNumber: number }) {
    const router = useRouter()
    const [impact, setImpact] = useState<VoidImpact | null>(null)
    const [reason, setReason] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [pending, start] = useTransition()

    const open = () => start(async () => {
        setError(null)
        const result = await previewVoidQuestion(questionId).catch(() => null)
        if (result?.success) { setReason(''); setImpact(result.data) } else setError(result?.error ?? FAILED)
    })
    const confirm = () => start(async () => {
        setError(null)
        const result = await voidQuestion(courseId, questionId, reason).catch(() => null)
        if (!result?.success) { setError(result?.error ?? FAILED); return }
        setImpact(null)
        router.refresh()
    })

    return <>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={open}>Unieważnij</Button>
        {error && !impact && <p role="alert" className="mt-1 text-left text-xs text-destructive">{error}</p>}
        <Dialog open={impact !== null} onOpenChange={next => { if (!next) setImpact(null) }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Unieważnić pytanie {questionNumber}?</DialogTitle>
                    <DialogDescription>Pytanie zostanie uznane za poprawne w każdej próbie, w której padło, i wypadnie z losowania. Tego nie da się cofnąć.</DialogDescription>
                </DialogHeader>
                {impact && <div className="space-y-3 text-sm">
                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div><dt className="text-xs text-muted-foreground">Próby z pytaniem</dt><dd className="font-semibold">{impact.attempts}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">Zyskają punkt</dt><dd className="font-semibold">{impact.gain_point}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">Przekroczą próg</dt><dd className="font-semibold">{impact.cross_threshold}</dd></div>
                        <div><dt className="text-xs text-muted-foreground">Nowe zaliczenia</dt><dd className="font-semibold">{impact.new_passes}</dd></div>
                    </dl>
                    <p className="text-muted-foreground">W puli zostanie zatwierdzonych pytań: {impact.pool_after}.</p>
                    <label className="block space-y-1"><span className="font-medium">Powód unieważnienia</span><span className="block text-xs text-muted-foreground">Trafia do dziennika audytu.</span>
                        <Textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} /></label>
                    {error && <p role="alert" className="text-destructive">{error}</p>}
                </div>}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setImpact(null)}>Anuluj</Button>
                    <Button type="button" variant="destructive" disabled={pending || reason.trim().length < MIN_REASON} onClick={confirm}>Unieważnij pytanie</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </>
}
