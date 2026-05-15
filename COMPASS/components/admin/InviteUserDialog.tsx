'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Mail } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { inviteUser, listManagerCandidates, type ManagerCandidate } from '@/lib/actions/user-admin'

interface InviteUserDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

// Phase 20: 5 invite'owalnych ról (admin = via admin_access_list).
type InviteRole = 'consultant' | 'internal' | 'finanse' | 'manager' | 'talent_community'

// HR-zone roles (mają timesheet+faktury) — pokazujemy dla nich employment fields + manager selector.
const HR_ZONE_ROLES: InviteRole[] = ['internal', 'finanse', 'manager', 'talent_community']

export function InviteUserDialog({ open, onOpenChange, onSuccess }: InviteUserDialogProps) {
    const [email, setEmail] = useState('')
    const [fullName, setFullName] = useState('')
    const [role, setRole] = useState<InviteRole>('consultant')
    const [employmentType, setEmploymentType] = useState<'uop' | 'b2b'>('b2b')
    const [workStartDate, setWorkStartDate] = useState<string>('')
    const [managerId, setManagerId] = useState<string>('')
    const [managerCandidates, setManagerCandidates] = useState<ManagerCandidate[]>([])
    const [loadingManagers, setLoadingManagers] = useState(false)
    const [submitting, setSubmitting] = useState(false)

    const isHrZone = HR_ZONE_ROLES.includes(role)

    // Lazy-load lista managerów przy pierwszym otwarciu (oszczędzanie request'ów).
    useEffect(() => {
        if (!open || managerCandidates.length > 0 || loadingManagers) return
        setLoadingManagers(true)
        listManagerCandidates()
            .then(setManagerCandidates)
            .catch(() => {
                // niezbyt krytyczne — admin może invite'ować bez managera, ustawia później.
            })
            .finally(() => setLoadingManagers(false))
    }, [open, managerCandidates.length, loadingManagers])

    function reset() {
        setEmail('')
        setFullName('')
        setRole('consultant')
        setEmploymentType('b2b')
        setWorkStartDate('')
        setManagerId('')
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
                // HR fields tylko dla HR-zone (internal/finanse/manager/TCM). IT (consultant) nie potrzebuje.
                employmentType: isHrZone ? employmentType : undefined,
                workStartDate: isHrZone && workStartDate ? workStartDate : null,
                managerId: isHrZone && managerId ? managerId : null,
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
                            <option value="internal">Konsultant wewnętrzny (HR Hub: urlopy, timesheety)</option>
                            <option value="manager">Manager (HR zespołu + akceptacja timesheet/faktury etap 1)</option>
                            <option value="finanse">Finanse (review faktur etap 2 + własny HR)</option>
                            <option value="talent_community">Talent Community Manager (zgłoszenia, news, compliance)</option>
                        </select>
                    </div>

                    {isHrZone && (
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
                            <div className="space-y-1.5">
                                <Label htmlFor="invite-manager">Manager (opcjonalnie)</Label>
                                <select
                                    id="invite-manager"
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={managerId}
                                    onChange={(e) => setManagerId(e.target.value)}
                                    disabled={submitting || loadingManagers}
                                >
                                    <option value="">Brak (akceptacje obsługuje admin)</option>
                                    {managerCandidates.map((m) => (
                                        <option key={m.id} value={m.id}>
                                            {m.full_name ?? m.email} ({m.role === 'admin' ? 'Super Admin' : 'Manager'})
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-muted-foreground">
                                    Manager akceptuje timesheet zespołu i robi etap 1 akceptacji faktur.
                                </p>
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
