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
        annual_leave_days: 26,
        employment_type: 'uop',
        work_start_date: null,
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
                    annual_leave_days: data.annual_leave_days ?? 26,
                    employment_type: data.employment_type ?? 'uop',
                    work_start_date: data.work_start_date ?? null,
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
                annual_leave_days: fields.annual_leave_days ?? undefined,
                employment_type: fields.employment_type ?? undefined,
                work_start_date: fields.work_start_date,
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
                        {targetEmail} — pola HR (lokalizacja, typ umowy, pula urlopu).
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
                                value={fields.employment_type ?? 'uop'}
                                onChange={(e) =>
                                    setFields({ ...fields, employment_type: e.target.value as 'uop' | 'b2b' })
                                }
                            >
                                <option value="uop">Umowa o pracę (UoP)</option>
                                <option value="b2b">B2B</option>
                            </select>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="annual_leave_days">Pula urlopu (dni / rok)</Label>
                            <Input
                                id="annual_leave_days"
                                type="number"
                                min={0}
                                max={60}
                                value={fields.annual_leave_days ?? 26}
                                onChange={(e) =>
                                    setFields({ ...fields, annual_leave_days: Number(e.target.value) })
                                }
                            />
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
