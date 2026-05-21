'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    getEmployeeProfileFields,
    setEmployeeProfile,
    type EmployeeProfileFields,
} from '@/lib/actions/user-admin'

interface EmployeeProfileDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    targetUserId: string
    targetEmail: string
    onSuccess?: () => void
}

export function EmployeeProfileDialog({
    open,
    onOpenChange,
    targetUserId,
    targetEmail,
    onSuccess,
}: EmployeeProfileDialogProps) {
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [fields, setFields] = useState<EmployeeProfileFields>({
        default_location: 'onsite',
        employment_type: 'b2b',
        work_start_date: null,
        leave_entitlement_days: null,
        leave_carried_over_days: 0,
    })

    useEffect(() => {
        if (!open) return
        let cancelled = false
        setLoading(true)
        getEmployeeProfileFields(targetUserId)
            .then((data) => {
                if (cancelled) return
                setFields({
                    default_location: data.default_location ?? 'onsite',
                    employment_type: data.employment_type ?? 'b2b',
                    work_start_date: data.work_start_date ?? null,
                    leave_entitlement_days: data.leave_entitlement_days ?? null,
                    leave_carried_over_days: data.leave_carried_over_days ?? 0,
                })
            })
            .catch((e: unknown) => {
                if (cancelled) return
                toast.error(e instanceof Error ? e.message : 'Błąd ładowania profilu')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => { cancelled = true }
    }, [open, targetUserId])

    async function handleSave() {
        setSaving(true)
        try {
            await setEmployeeProfile(targetUserId, {
                default_location: fields.default_location ?? undefined,
                employment_type: fields.employment_type ?? undefined,
                work_start_date: fields.work_start_date,
                leave_entitlement_days: fields.leave_entitlement_days,
                leave_carried_over_days: fields.leave_carried_over_days,
            })
            toastSuccess(`Profil pracownika ${targetEmail} zaktualizowany`)
            onSuccess?.()
            onOpenChange(false)
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Nieznany błąd')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Profil pracownika wewnętrznego</DialogTitle>
                    <DialogDescription>
                        {targetEmail} — pola HR (lokalizacja, typ umowy, data rozpoczęcia pracy).
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="default_location">Domyślna lokalizacja</Label>
                            <select
                                id="default_location"
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                value={fields.default_location ?? 'onsite'}
                                onChange={(e) =>
                                    setFields({ ...fields, default_location: e.target.value as 'onsite' | 'remote' })
                                }
                            >
                                <option value="onsite">W biurze (onsite)</option>
                                <option value="remote">Zdalnie (remote)</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="employment_type">Typ umowy</Label>
                            <select
                                id="employment_type"
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                value={fields.employment_type ?? 'b2b'}
                                onChange={(e) =>
                                    setFields({
                                        ...fields,
                                        employment_type: e.target.value as 'uop' | 'b2b' | 'zlecenie',
                                    })
                                }
                            >
                                <option value="b2b">B2B</option>
                                <option value="uop">Umowa o pracę (UoP)</option>
                                <option value="zlecenie">Zlecenie</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="work_start_date">Data rozpoczęcia pracy</Label>
                            <Input
                                id="work_start_date"
                                type="date"
                                value={fields.work_start_date ?? ''}
                                onChange={(e) =>
                                    setFields({ ...fields, work_start_date: e.target.value || null })
                                }
                            />
                        </div>

                        {fields.employment_type === 'uop' && (
                            <div className="space-y-1.5 rounded-md border border-white/10 p-3">
                                <Label className="text-xs font-semibold">Limit urlopu wypoczynkowego (UoP)</Label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label htmlFor="leave_entitlement" className="text-xs">
                                            Wymiar (dni/rok)
                                        </Label>
                                        <Input
                                            id="leave_entitlement"
                                            type="number"
                                            min="0"
                                            max="366"
                                            step="1"
                                            placeholder="np. 26"
                                            value={fields.leave_entitlement_days ?? ''}
                                            onChange={(e) =>
                                                setFields({
                                                    ...fields,
                                                    leave_entitlement_days:
                                                        e.target.value === '' ? null : Number(e.target.value),
                                                })
                                            }
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label htmlFor="leave_carried" className="text-xs">
                                            Zaległy (dni)
                                        </Label>
                                        <Input
                                            id="leave_carried"
                                            type="number"
                                            min="0"
                                            max="366"
                                            step="0.5"
                                            value={fields.leave_carried_over_days}
                                            onChange={(e) =>
                                                setFields({
                                                    ...fields,
                                                    leave_carried_over_days: Number(e.target.value) || 0,
                                                })
                                            }
                                        />
                                    </div>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Puste = brak limitu. Pula liczy urlop wypoczynkowy + na żądanie. Walidacja blokuje
                                    wnioski ponad wymiar + zaległy.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        Anuluj
                    </Button>
                    <Button onClick={handleSave} disabled={saving || loading}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Zapisz
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
