'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, AlertTriangle } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { forceSetPassword } from '@/lib/actions/user-admin'

interface SetPasswordDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    targetUserId: string
    targetEmail: string
    onSuccess: () => void
}

const PASSWORD_MIN_LEN = 8

function localValidate(password: string, confirm: string): string | null {
    if (password.length < PASSWORD_MIN_LEN) return `Hasło musi mieć minimum ${PASSWORD_MIN_LEN} znaków.`
    if (!/[0-9]/.test(password)) return 'Hasło musi zawierać przynajmniej jedną cyfrę.'
    if (!/[A-Za-z]/.test(password)) return 'Hasło musi zawierać przynajmniej jedną literę.'
    if (password !== confirm) return 'Hasła nie są identyczne.'
    return null
}

export function SetPasswordDialog({ open, onOpenChange, targetUserId, targetEmail, onSuccess }: SetPasswordDialogProps) {
    const [password, setPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [submitting, setSubmitting] = useState(false)

    function reset() {
        setPassword('')
        setConfirm('')
        setSubmitting(false)
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        const localError = localValidate(password, confirm)
        if (localError) {
            toast.error(localError)
            return
        }

        setSubmitting(true)
        try {
            await forceSetPassword(targetUserId, password)
            toastSuccess(`Hasło zmienione dla ${targetEmail}. Wszystkie sesje wylogowane.`)
            reset()
            onOpenChange(false)
            onSuccess()
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Nieznany błąd'
            toast.error(msg)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
            <DialogContent className="bg-[var(--color-bg-primary,#1a1a2e)] border-white/10 text-white">
                <DialogHeader>
                    <DialogTitle>Ustaw nowe hasło</DialogTitle>
                    <DialogDescription className="text-gray-400">
                        Wymusisz nowe hasło dla <span className="text-white font-mono">{targetEmail}</span>.
                        Wszystkie aktywne sesje zostaną zakończone.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                        User zostanie wylogowany ze wszystkich urządzeń. Akcja zapisze się w audit logu.
                        Przekaż mu nowe hasło bezpiecznym kanałem.
                    </span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="new-password">Nowe hasło</Label>
                        <Input
                            id="new-password"
                            type="password"
                            placeholder={`Min. ${PASSWORD_MIN_LEN} znaków, litera + cyfra`}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="new-password"
                            required
                            minLength={PASSWORD_MIN_LEN}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="confirm-password">Powtórz hasło</Label>
                        <Input
                            id="confirm-password"
                            type="password"
                            placeholder="Powtórz nowe hasło"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            autoComplete="new-password"
                            required
                            minLength={PASSWORD_MIN_LEN}
                        />
                    </div>
                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                            Anuluj
                        </Button>
                        <Button type="submit" disabled={submitting} className="bg-red-600 hover:bg-red-700 text-white">
                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Ustaw hasło
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
