'use client'

// Phase 24c — admin UI dla globalnych defaultów opisu timesheet. CRUD na
// timesheet_role_defaults: label, applies_to_role, project, default_description.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import {
    createRoleDefault,
    deleteRoleDefault,
    updateRoleDefault,
    type TimesheetRoleDefault,
} from '@/lib/actions/internal-timesheet-role-defaults'
import type { AppRole } from '@/lib/types/role'

const ROLE_LABELS: Record<AppRole | 'all', string> = {
    admin: 'Admin',
    consultant: 'Konsultant IT',
    internal: 'Konsultant wewnętrzny',
    finanse: 'Finanse',
    manager: 'Manager',
    talent_community: 'Talent Community Manager',
    all: 'Wszystkie role',
}

const ALLOWED_ROLES: AppRole[] = [
    'consultant',
    'internal',
    'manager',
    'finanse',
    'talent_community',
    'admin',
]

interface Props {
    initialDefaults: TimesheetRoleDefault[]
}

interface FormState {
    id?: string
    label: string
    appliesToRole: AppRole | 'all'
    project: string
    defaultDescription: string
    isActive: boolean
    sortOrder: number
}

const EMPTY_FORM: FormState = {
    label: '',
    appliesToRole: 'all',
    project: '',
    defaultDescription: '',
    isActive: true,
    sortOrder: 0,
}

export function RoleDefaultsManager({ initialDefaults }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [dialogOpen, setDialogOpen] = useState(false)
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [confirm, ConfirmUI] = useConfirm()

    function openCreate() {
        setForm(EMPTY_FORM)
        setDialogOpen(true)
    }

    function openEdit(d: TimesheetRoleDefault) {
        setForm({
            id: d.id,
            label: d.label,
            appliesToRole: d.applies_to_role ?? 'all',
            project: d.project ?? '',
            defaultDescription: d.default_description,
            isActive: d.is_active,
            sortOrder: d.sort_order,
        })
        setDialogOpen(true)
    }

    function handleSave() {
        startTransition(async () => {
            try {
                if (form.id) {
                    await updateRoleDefault({
                        id: form.id,
                        label: form.label,
                        appliesToRole: form.appliesToRole === 'all' ? null : form.appliesToRole,
                        project: form.project || null,
                        defaultDescription: form.defaultDescription,
                        isActive: form.isActive,
                        sortOrder: form.sortOrder,
                    })
                    toastSuccess('Zaktualizowano')
                } else {
                    await createRoleDefault({
                        label: form.label,
                        appliesToRole: form.appliesToRole === 'all' ? null : form.appliesToRole,
                        project: form.project || null,
                        defaultDescription: form.defaultDescription,
                        isActive: form.isActive,
                        sortOrder: form.sortOrder,
                    })
                    toastSuccess('Default utworzony')
                }
                setDialogOpen(false)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    async function handleDelete(d: TimesheetRoleDefault) {
        const ok = await confirm({
            title: 'Usunąć default?',
            description: `"${d.label}" zostanie trwale usunięty. Pracownicy nie będą mogli go używać do prefillu.`,
            confirmLabel: 'Usuń',
            variant: 'destructive',
        })
        if (!ok) return
        startTransition(async () => {
            try {
                await deleteRoleDefault(d.id)
                toastSuccess('Usunięto')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            }
        })
    }

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">
                        Defaulty ({initialDefaults.length})
                    </CardTitle>
                    <Button size="sm" onClick={openCreate} disabled={pending}>
                        <Plus className="h-4 w-4 mr-1" />
                        Nowy default
                    </Button>
                </CardHeader>
                <CardContent>
                    {initialDefaults.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            Brak defaultów. Kliknij „Nowy default”, aby utworzyć pierwszy szablon.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {initialDefaults.map((d) => (
                                <div
                                    key={d.id}
                                    className="border rounded-md p-3 flex flex-wrap items-start gap-3 justify-between"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-sm">{d.label}</span>
                                            <Badge variant="outline" className="text-xs">
                                                {ROLE_LABELS[d.applies_to_role ?? 'all']}
                                            </Badge>
                                            {d.project && (
                                                <Badge variant="outline" className="text-xs">
                                                    Projekt: {d.project}
                                                </Badge>
                                            )}
                                            {!d.is_active && (
                                                <Badge
                                                    variant="outline"
                                                    className="text-xs bg-gray-500/15 text-gray-300 border-gray-500/30"
                                                >
                                                    Wyłączony
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap break-words">
                                            {d.default_description.slice(0, 200)}
                                            {d.default_description.length > 200 ? '…' : ''}
                                        </p>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => openEdit(d)}
                                            disabled={pending}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => handleDelete(d)}
                                            disabled={pending}
                                            className="text-muted-foreground hover:text-destructive"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{form.id ? 'Edytuj default' : 'Nowy default'}</DialogTitle>
                        <DialogDescription className="text-xs">
                            Szablon opisu usług używany przez pracownika gdy klika „Wypełnij defaultem” w
                            timesheecie. Priorytet: rola+projekt &gt; rola &gt; projekt &gt; globalny.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label className="text-xs" htmlFor="rd_label">
                                Etykieta (widoczna w UI)
                            </Label>
                            <Input
                                id="rd_label"
                                value={form.label}
                                onChange={(e) => setForm({ ...form, label: e.target.value })}
                                placeholder="np. Konsultant SAP — projekt B2B"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs" htmlFor="rd_role">
                                    Rola
                                </Label>
                                <select
                                    id="rd_role"
                                    className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                                    value={form.appliesToRole}
                                    onChange={(e) =>
                                        setForm({
                                            ...form,
                                            appliesToRole: e.target.value as AppRole | 'all',
                                        })
                                    }
                                >
                                    <option value="all">Wszystkie role</option>
                                    {ALLOWED_ROLES.map((r) => (
                                        <option key={r} value={r}>
                                            {ROLE_LABELS[r]}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs" htmlFor="rd_project">
                                    Projekt (opcjonalnie)
                                </Label>
                                <Input
                                    id="rd_project"
                                    value={form.project}
                                    onChange={(e) =>
                                        setForm({ ...form, project: e.target.value })
                                    }
                                    placeholder="np. B2B Network"
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs" htmlFor="rd_desc">
                                Domyślny opis usług
                            </Label>
                            <Textarea
                                id="rd_desc"
                                rows={4}
                                value={form.defaultDescription}
                                onChange={(e) =>
                                    setForm({ ...form, defaultDescription: e.target.value })
                                }
                                placeholder="np. Konsultacje techniczne SAP S/4HANA — moduł FI/CO"
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-xs">Aktywny</Label>
                                <p className="text-[11px] text-muted-foreground">
                                    Tylko aktywne defaulty są używane do prefillu.
                                </p>
                            </div>
                            <Switch
                                checked={form.isActive}
                                onCheckedChange={(v) => setForm({ ...form, isActive: v })}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs" htmlFor="rd_sort">
                                Sortowanie (niższe = wyżej)
                            </Label>
                            <Input
                                id="rd_sort"
                                type="number"
                                value={form.sortOrder}
                                onChange={(e) =>
                                    setForm({ ...form, sortOrder: Number(e.target.value) || 0 })
                                }
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialogOpen(false)}>
                            Anuluj
                        </Button>
                        <Button
                            onClick={handleSave}
                            disabled={
                                pending ||
                                !form.label.trim() ||
                                !form.defaultDescription.trim()
                            }
                        >
                            {pending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                            {form.id ? 'Zapisz zmiany' : 'Utwórz default'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <ConfirmUI />
        </>
    )
}
