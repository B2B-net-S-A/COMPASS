'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { cancelExitInterview } from '@/lib/actions/lifecycle'

interface Props {
    interviewId: string
}

export function CancelExitButton({ interviewId }: Props) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [reason, setReason] = useState('')
    const [isPending, startTransition] = useTransition()

    function handleCancel() {
        startTransition(async () => {
            try {
                await cancelExitInterview(interviewId, reason.trim() || null)
                toastSuccess('Exit interview anulowany — pracownik wraca do active.')
                setOpen(false)
                router.push('/internal/lifecycle/exit')
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd anulowania.')
            }
        })
    }

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
                disabled={isPending}
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
            >
                <X className="h-4 w-4 mr-2" />
                Anuluj exit
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Anuluj exit interview</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Pracownik wraca do statusu <strong>active</strong>, termination_date zostaje wyzerowane.
                            Niezakończone offboarding tasks zostaną usunięte. Można tylko jeśli ankieta nie była wypełniona.
                        </p>
                        <div className="space-y-1.5">
                            <Label htmlFor="cancel-exit-reason">Powód (opcjonalnie)</Label>
                            <textarea
                                id="cancel-exit-reason"
                                className="w-full rounded border bg-background px-3 py-2 text-sm"
                                rows={3}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="np. pracownik jednak zostaje, zmiana decyzji"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                            Wróć
                        </Button>
                        <Button onClick={handleCancel} disabled={isPending} className="bg-destructive hover:bg-destructive/90">
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <X className="h-4 w-4 mr-2" />}
                            Potwierdź anulowanie
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
