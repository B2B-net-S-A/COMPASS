'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Mail } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { inviteUser } from '@/lib/actions/user-admin'

interface InviteUserDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

type InviteRole = 'consultant' | 'internal'

export function InviteUserDialog({ open, onOpenChange, onSuccess }: InviteUserDialogProps) {
    const [email, setEmail] = useState('')
    const [fullName, setFullName] = useState('')
    const [role, setRole] = useState<InviteRole>('consultant')
    const [employmentType, setEmploymentType] = useState<'uop' | 'b2b'>('b2b')
    const [workStartDate, setWorkStartDate] = useState<string>('')
    const [submitting, setSubmitting] = useState(false)

    function reset() {
        setEmail('')
        setFullName('')
        setRole('consultant')
        setEmploymentType('b2b')
        setWorkStartDate('')
        setSubmitting(false)
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        const emailTrimmed = email.trim().toLowerCase()
        if (!emailTrimmed.endsWith('@b2bnetwork.pl')) {
            toast.error('Email musi być w domenie @b2bnetwork.pl')
            return
        }

        setSubmitting(true)
        try {
            await inviteUser({
                email: emailTrimmed,
                fullName: fullName.trim() || undefined,
                role,
                // HR fields tylko dla biurowych (internal). IT (consultant) ich nie potrzebuje.
                employmentType: role === 'internal' ? employmentType : undefined,
                workStartDate: role === 'internal' && workStartDate ? workStartDate : null,
            })
            toastSuccess(`Wysłano zaproszenie na ${emailTrimmed}. User dostanie email z linkiem aktywacyjnym.`)
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
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Zaproś użytkownika</DialogTitle>
                    <DialogDescription>
                        Wyślemy email z linkiem aktywacyjnym. User ustawi własne hasło i zaloguje się.
                        Aby zaprosić Super Admina — użyj <span className="text-primary">/admin/settings/admins</span>.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="invite-email">Email</Label>
                        <Input
                            id="invite-email"
                            type="email"
                            placeholder="imie.nazwisko@b2bnetwork.pl"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="off"
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="invite-fullname">Imię i nazwisko (opcjonalnie)</Label>
                        <Input
                            id="invite-fullname"
                            placeholder="Jan Kowalski"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            autoComplete="off"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="invite-role">Rola</Label>
                        <select
                            id="invite-role"
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={role}
                            onChange={(e) => setRole(e.target.value as InviteRole)}
                            disabled={submitting}
                        >
                            <option value="consultant">Konsultant IT (platform: learning, league, incubator…)</option>
                            <option value="internal">Konsultant biurowy (tylko HR Hub: urlopy, timesheety)</option>
                        </select>
                    </div>

                    {role === 'internal' && (
                        <>
                            <div className="space-y-1.5">
                                <Label htmlFor="invite-employment-type">Typ umowy</Label>
                                <select
                                    id="invite-employment-type"
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={employmentType}
                                    onChange={(e) => setEmploymentType(e.target.value as 'uop' | 'b2b')}
                                    disabled={submitting}
                                >
                                    <option value="b2b">B2B</option>
                                    <option value="uop">Umowa o pracę (UoP)</option>
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="invite-start-date">Data rozpoczęcia pracy (opcjonalnie)</Label>
                                <Input
                                    id="invite-start-date"
                                    type="date"
                                    value={workStartDate}
                                    onChange={(e) => setWorkStartDate(e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                            Anuluj
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                            Wyślij zaproszenie
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
