'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { cancelOnboarding, listTemplateChoices, restartOnboarding, type TemplateChoice } from '@/lib/actions/lifecycle'

interface Props {
    progressId: string
}

export function CancelOnboardingButton({ progressId }: Props) {
    const router = useRouter()
    const [cancelOpen, setCancelOpen] = useState(false)
    const [restartOpen, setRestartOpen] = useState(false)
    const [reason, setReason] = useState('')
    const [templates, setTemplates] = useState<TemplateChoice[]>([])
    const [restartTemplateId, setRestartTemplateId] = useState('')
    const [isPending, startTransition] = useTransition()

    function loadTemplates() {
        if (templates.length === 0) {
            listTemplateChoices().then(setTemplates).catch(() => undefined)
        }
    }

    function handleCancel() {
        startTransition(async () => {
            try {
                await cancelOnboarding(progressId, reason.trim() || null)
                toastSuccess('Onboarding anulowany.')
                setCancelOpen(false)
                router.push('/internal/lifecycle')
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd anulowania.')
            }
        })
    }

    function handleRestart() {
        startTransition(async () => {
            try {
                const newId = await restartOnboarding(progressId, restartTemplateId || null)
                toastSuccess('Onboarding zrestartowany od nowa.')
                setRestartOpen(false)
                router.push(`/internal/lifecycle/onboarding/${newId}`)
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd restartu.')
            }
        })
    }

    return (
        <>
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { loadTemplates(); setRestartOpen(true) }}
                    disabled={isPending}
                >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Restart
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCancelOpen(true)}
                    disabled={isPending}
                    className="text-red-400 border-red-400/30 hover:bg-red-400/10"
                >
                    <X className="h-4 w-4 mr-2" />
                    Anuluj onboarding
                </Button>
            </div>

            <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Anuluj onboarding</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Status pracownika wróci do <strong>active</strong>. Onboarding nie zostanie usunięty —
                            będzie widoczny w archiwum jako anulowany.
                        </p>
                        <div className="space-y-1.5">
                            <Label htmlFor="cancel-reason">Powód anulowania (opcjonalnie)</Label>
                            <textarea
                                id="cancel-reason"
                                className="w-full rounded border bg-background px-3 py-2 text-sm"
                                rows={3}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="np. zła rola, pomyłka, pracownik nie dołączył"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={isPending}>
                            Wróć
                        </Button>
                        <Button onClick={handleCancel} disabled={isPending} className="bg-red-500 hover:bg-red-600">
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <X className="h-4 w-4 mr-2" />}
                            Potwierdź anulowanie
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={restartOpen} onOpenChange={setRestartOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Restart onboardingu</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Aktualny onboarding zostanie skasowany (wraz z postępem zadań) i utworzony nowy od zera.
                            Pracownik zostanie zalogowany jako start-onboarding event.
                        </p>
                        <div className="space-y-1.5">
                            <Label htmlFor="restart-template">Szablon (opcjonalnie — domyślnie ten sam)</Label>
                            <select
                                id="restart-template"
                                className="w-full h-9 rounded border bg-background px-3 text-sm"
                                value={restartTemplateId}
                                onChange={(e) => setRestartTemplateId(e.target.value)}
                            >
                                <option value="">Bez zmiany (ten sam szablon)</option>
                                {templates.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.name} ({t.items_count} items){t.is_default ? ' ★' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRestartOpen(false)} disabled={isPending}>
                            Wróć
                        </Button>
                        <Button onClick={handleRestart} disabled={isPending}>
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                            Potwierdź restart
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
