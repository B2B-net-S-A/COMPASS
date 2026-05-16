'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { listBuddyCandidates, updateLifecycleProfile, type EligibleEmployee } from '@/lib/actions/lifecycle'
import { type DbRole } from '@/lib/types/role'

const ROLE_OPTIONS: Array<{ value: DbRole; label: string }> = [
    { value: 'consultant', label: 'Konsultant IT' },
    { value: 'internal', label: 'Konsultant wewnętrzny' },
    { value: 'finanse', label: 'Finanse' },
    { value: 'manager', label: 'Manager' },
    { value: 'talent_community', label: 'Talent Community Manager' },
]

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    employee: EligibleEmployee
}

export function EditLifecycleProfileDialog({ open, onOpenChange, employee }: Props) {
    const router = useRouter()
    const [hiredAt, setHiredAt] = useState(employee.hired_at ?? '')
    const [role, setRole] = useState<DbRole>(employee.role)
    const [managerId, setManagerId] = useState<string>(employee.manager_id ?? '')
    const [managers, setManagers] = useState<Array<{ id: string; full_name: string | null; email: string }>>([])
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        if (!open) return
        listBuddyCandidates(employee.id)
            .then((all) => setManagers(all.filter((c) => c.role === 'admin' || c.role === 'manager')))
            .catch(() => undefined)
    }, [open, employee.id])

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        startTransition(async () => {
            try {
                await updateLifecycleProfile({
                    userId: employee.id,
                    hiredAt: hiredAt || null,
                    role,
                    managerId: managerId || null,
                })
                toastSuccess('Profil zaktualizowany.')
                onOpenChange(false)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd zapisu.')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edytuj lifecycle profile</DialogTitle>
                    <DialogDescription>
                        Pracownik: <strong>{employee.full_name ?? employee.email}</strong>
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="role">Rola</Label>
                        <select
                            id="role"
                            className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={role}
                            onChange={(e) => setRole(e.target.value as DbRole)}
                        >
                            {ROLE_OPTIONS.map((r) => (
                                <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                            Zmiana roli zapisze event w timeline. Może wymagać re-onboardingu.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="hired-at">Data zatrudnienia (hired_at)</Label>
                        <Input
                            id="hired-at"
                            type="date"
                            value={hiredAt}
                            onChange={(e) => setHiredAt(e.target.value)}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="manager-id">Manager</Label>
                        <select
                            id="manager-id"
                            className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
                            value={managerId}
                            onChange={(e) => setManagerId(e.target.value)}
                        >
                            <option value="">Brak (akceptacje obsługuje admin)</option>
                            {managers.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.full_name ?? m.email}
                                </option>
                            ))}
                        </select>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                            Anuluj
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                            Zapisz
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
