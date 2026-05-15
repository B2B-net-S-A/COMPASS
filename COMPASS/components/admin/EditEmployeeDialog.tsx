'use client'

import { useState, useTransition } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Loader2, Save } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { setUserRole, setUserManager } from '@/lib/actions/user-admin'
import { type DbRole, roleLabelPl } from '@/lib/types/role'
import type { EmployeeRow } from '@/components/internal/panels/AdminEmployeesPanelClient'

export interface ManagerCandidateRow {
    id: string
    full_name: string | null
    email: string
    role: string
}

interface Props {
    employee: EmployeeRow
    managerCandidates: ManagerCandidateRow[]
    open: boolean
    onOpenChange: (open: boolean) => void
    onUpdated: (updated: EmployeeRow) => void
}

// Phase 20f: invitable roles minus consultant IT (ten panel = HR-zone tylko).
const EDITABLE_ROLES: DbRole[] = ['admin', 'manager', 'finanse', 'talent_community', 'internal']

export function EditEmployeeDialog({ employee, managerCandidates, open, onOpenChange, onUpdated }: Props) {
    const [role, setRole] = useState<DbRole>(employee.role as DbRole)
    const [managerId, setManagerId] = useState<string>(employee.manager_id ?? '')
    const [isPending, startTransition] = useTransition()

    // Phase 20: TYLKO HR-zone (oprócz admin, który może sam być managerem) potrzebuje manager_id.
    // Wszyscy z 5 ról mogą mieć managera teoretycznie. Wyświetlamy zawsze.
    const filteredCandidates = managerCandidates.filter((m) => m.id !== employee.id)

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        startTransition(async () => {
            try {
                // 1. Update role (if changed)
                if (role !== employee.role) {
                    await setUserRole(employee.id, role)
                }
                // 2. Update manager_id (if changed)
                const newManagerId = managerId || null
                if (newManagerId !== employee.manager_id) {
                    await setUserManager(employee.id, newManagerId)
                }

                const mgr = newManagerId ? managerCandidates.find((m) => m.id === newManagerId) : null
                onUpdated({
                    ...employee,
                    role,
                    manager_id: newManagerId,
                    manager_full_name: mgr?.full_name ?? null,
                    manager_email: mgr?.email ?? null,
                })
                toastSuccess(`Zaktualizowano ${employee.full_name ?? employee.email}.`)
            } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : 'Nieznany błąd')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Edytuj pracownika</DialogTitle>
                    <DialogDescription>
                        {employee.full_name ?? employee.email} —{' '}
                        <span className="text-xs">{employee.email}</span>
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="edit-role">Rola</Label>
                        <select
                            id="edit-role"
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={role}
                            onChange={(e) => setRole(e.target.value as DbRole)}
                            disabled={isPending}
                        >
                            {EDITABLE_ROLES.map((r) => (
                                <option key={r} value={r}>
                                    {roleLabelPl(r)}
                                </option>
                            ))}
                            <option value="consultant">{roleLabelPl('consultant')}</option>
                        </select>
                        <p className="text-xs text-muted-foreground">
                            Uwaga: zmiana na <strong>Super Admin</strong> wymaga też dodania emaila do
                            admin_access_list (inaczej sync_user_role zresetuje przy następnym SSO loginie).
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="edit-manager">Manager</Label>
                        <select
                            id="edit-manager"
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={managerId}
                            onChange={(e) => setManagerId(e.target.value)}
                            disabled={isPending}
                        >
                            <option value="">— Brak (akceptacje obsługuje admin) —</option>
                            {filteredCandidates.map((m) => (
                                <option key={m.id} value={m.id}>
                                    {m.full_name ?? m.email} ({roleLabelPl(m.role)})
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-muted-foreground">
                            Manager akceptuje timesheety zespołu + faktury etap 1 (merytoryczny).
                        </p>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                            Anuluj
                        </Button>
                        <Button type="submit" disabled={isPending}>
                            {isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="mr-2 h-4 w-4" />
                            )}
                            Zapisz
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
