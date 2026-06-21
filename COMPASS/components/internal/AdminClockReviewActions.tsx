'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { approveCorrection, rejectCorrection } from '@/lib/actions/internal-clock'

interface Props {
    entryId: string
    workDate: string
    declaredHours: number
    trackedHours: number | null
}

export function AdminClockReviewActions({
    entryId,
    workDate,
    declaredHours,
    trackedHours,
}: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [rejectOpen, setRejectOpen] = useState(false)
    const [approveOpen, setApproveOpen] = useState(false)
    const [note, setNote] = useState('')

    function handleApprove() {
        startTransition(async () => {
            try {
                await approveCorrection(entryId, note.trim() || undefined)
                toast.success('Korekta zaakceptowana — wpis pozostaje w timesheet')
                setApproveOpen(false)
                setNote('')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd akceptacji')
            }
        })
    }

    function handleReject() {
        if (!note.trim()) {
            toast.error('Uzasadnienie odrzucenia jest wymagane')
            return
        }
        startTransition(async () => {
            try {
                await rejectCorrection(entryId, note.trim())
                toast.success(
                    trackedHours == null
                        ? 'Korekta odrzucona — pracownik dostanie powiadomienie'
                        : 'Korekta odrzucona — godziny przywrócone do trackingu',
                )
                setRejectOpen(false)
                setNote('')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd odrzucenia')
            }
        })
    }

    return (
        <div className="flex items-center gap-1 whitespace-nowrap">
            <Button
                size="sm"
                variant="outline"
                className="h-8 text-success border-success/30 hover:bg-success/10"
                onClick={() => setApproveOpen(true)}
                disabled={pending}
            >
                <Check className="h-3.5 w-3.5 mr-1" />
                Akceptuj
            </Button>
            <Button
                size="sm"
                variant="outline"
                className="h-8 text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setRejectOpen(true)}
                disabled={pending}
            >
                <X className="h-3.5 w-3.5 mr-1" />
                Odrzuć
            </Button>

            <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Zaakceptować korektę?</DialogTitle>
                        <DialogDescription>
                            Pracownik zadeklarował <strong>{declaredHours.toFixed(2)} h</strong> w dniu{' '}
                            <strong>{workDate}</strong>
                            {trackedHours != null && (
                                <>
                                    {' '}(z trackingu: <strong>{trackedHours.toFixed(2)} h</strong>,
                                    różnica:{' '}
                                    <strong>{(declaredHours - trackedHours).toFixed(2)} h</strong>)
                                </>
                            )}
                            . Zatwierdzenie utrzyma zadeklarowane godziny.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="approve-note">Komentarz (opcjonalny)</Label>
                        <Textarea
                            id="approve-note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Np. spotkanie offline z klientem (poza trackingiem)"
                            rows={3}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setApproveOpen(false)} disabled={pending}>
                            Anuluj
                        </Button>
                        <Button onClick={handleApprove} disabled={pending}>
                            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Zatwierdź
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Odrzucić korektę?</DialogTitle>
                        <DialogDescription>
                            {trackedHours != null
                                ? `Godziny zostaną przywrócone do wartości z trackingu (${trackedHours.toFixed(2)} h). Pracownik dostanie email z uzasadnieniem.`
                                : 'Pracownik dostanie email z uzasadnieniem (brak danych z trackingu, godziny pozostaną).'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="reject-note">
                            Uzasadnienie <span className="text-destructive">*</span>
                        </Label>
                        <Textarea
                            id="reject-note"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="Wymagane uzasadnienie dla pracownika"
                            rows={3}
                            required
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={pending}>
                            Anuluj
                        </Button>
                        <Button variant="destructive" onClick={handleReject} disabled={pending || !note.trim()}>
                            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Odrzuć
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
