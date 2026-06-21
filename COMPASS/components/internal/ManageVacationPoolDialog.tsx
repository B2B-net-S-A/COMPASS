'use client'

// Phase 30b — Dialog "Pula urlopowa" otwarcie z RatesDirectoryClient.
// Edytuje 3 pool fields w profiles: leave_entitlement_days, leave_carried_over_days,
// leave_used_initial_days. Auth FinanseOrAdmin (narrow scope vs EmployeeProfileDialog
// w /admin/settings/users który wymaga SuperAdmin).

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    getUserVacationPool,
    setUserVacationPool,
    type UserVacationPoolFields,
} from '@/lib/actions/internal-rates'

interface Props {
    targetUserId: string
    targetName: string
    targetEmail: string
    onOpenChange: (open: boolean) => void
}

export function ManageVacationPoolDialog({ targetUserId, targetName, targetEmail, onOpenChange }: Props) {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [fields, setFields] = useState<UserVacationPoolFields>({
        employment_type: null,
        leave_entitlement_days: null,
        leave_carried_over_days: 0,
        leave_used_initial_days: 0,
    })

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        getUserVacationPool(targetUserId)
            .then((data) => {
                if (cancelled) return
                setFields(data)
            })
            .catch((e: unknown) => {
                if (cancelled) return
                toast.error(e instanceof Error ? e.message : 'Błąd ładowania puli')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [targetUserId])

    async function handleSave() {
        setSaving(true)
        try {
            await setUserVacationPool(targetUserId, {
                leave_entitlement_days: fields.leave_entitlement_days,
                leave_carried_over_days: fields.leave_carried_over_days,
                leave_used_initial_days: fields.leave_used_initial_days,
            })
            toastSuccess(`Pula urlopowa zaktualizowana — ${targetName}`)
            router.refresh()
            onOpenChange(false)
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Nieznany błąd')
        } finally {
            setSaving(false)
        }
    }

    const isUop = fields.employment_type === 'uop'
    const isContractor = fields.employment_type === 'b2b' || fields.employment_type === 'zlecenie'

    // Computed balance preview
    const entitlement = fields.leave_entitlement_days ?? 0
    const carried = Number(fields.leave_carried_over_days) || 0
    const usedInitial = Number(fields.leave_used_initial_days) || 0
    const available = fields.leave_entitlement_days != null ? entitlement + carried - usedInitial : null

    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Pula płatnych urlopów</DialogTitle>
                    <DialogDescription>
                        {targetName} ({targetEmail}) — wymiar, zaległy oraz hybrydowy backfill „już zużyte".
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                ) : (
                    <div className="space-y-3 py-2">
                        <div className="rounded-md border border-border/10 bg-card/5 px-3 py-2 text-xs">
                            <span className="text-muted-foreground">Typ umowy:</span>{' '}
                            <span className="font-medium">
                                {fields.employment_type === 'uop'
                                    ? 'Umowa o pracę (UoP)'
                                    : fields.employment_type === 'b2b'
                                        ? 'B2B'
                                        : fields.employment_type === 'zlecenie'
                                            ? 'Zlecenie'
                                            : '— (brak)'}
                            </span>
                            {' · '}
                            <span className="text-muted-foreground">Typ pracownika zmień w</span>{' '}
                            <span className="text-foreground">/admin/settings/users</span>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1">
                                <Label htmlFor="vp_entitlement" className="text-xs">
                                    Wymiar (dni/rok)
                                </Label>
                                <Input
                                    id="vp_entitlement"
                                    type="number"
                                    min="0"
                                    max="366"
                                    step="1"
                                    placeholder={isUop ? 'np. 26' : 'puste = brak'}
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
                                <Label htmlFor="vp_carried" className="text-xs">
                                    Zaległy (dni)
                                </Label>
                                <Input
                                    id="vp_carried"
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
                            <div className="space-y-1">
                                <Label htmlFor="vp_used_initial" className="text-xs">
                                    Już zużyte (start)
                                </Label>
                                <Input
                                    id="vp_used_initial"
                                    type="number"
                                    min="0"
                                    max="366"
                                    step="0.5"
                                    value={fields.leave_used_initial_days}
                                    onChange={(e) =>
                                        setFields({
                                            ...fields,
                                            leave_used_initial_days: Number(e.target.value) || 0,
                                        })
                                    }
                                />
                            </div>
                        </div>

                        {available != null && (
                            <div className="rounded-md border border-success/30 bg-success/5 px-3 py-2 text-xs">
                                <span className="text-muted-foreground">Dostępne w {new Date().getFullYear()}:</span>{' '}
                                <span className="font-medium text-success">{available}</span>
                                <span className="text-muted-foreground">
                                    {' '}dni (przed odjęciem już zatwierdzonych wniosków w tym roku)
                                </span>
                            </div>
                        )}

                        <p className="text-[11px] text-muted-foreground">
                            {isUop ? (
                                <>
                                    <strong>UoP:</strong> walidacja blokuje wnioski ponad wymiar + zaległy − już zużyte
                                    (nadwyżkę pracownik zgłasza jako <strong>Urlop bezpłatny</strong>).
                                </>
                            ) : isContractor ? (
                                <>
                                    <strong>B2B/zlecenie:</strong> puste = brak puli (cały urlop bezpłatny, widget u
                                    pracownika ukryty). Z pulą: wniosek przekraczający dostaje{' '}
                                    <strong>auto-split</strong> (część płatna z puli + reszta bezpłatna w jednym
                                    wniosku).
                                </>
                            ) : (
                                <>
                                    Pracownik nie ma ustawionego typu umowy. Najpierw ustaw typ w{' '}
                                    <span className="text-foreground">/admin/settings/users</span>.
                                </>
                            )}
                            {' '}<strong>„Już zużyte"</strong> to hybrydowy backfill — gdy włączasz pulę pracownikowi w
                            trakcie roku, wpisz ile dni już wykorzystał (zostaw 0 jeśli to początek roku lub świeży
                            pracownik).
                        </p>
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
