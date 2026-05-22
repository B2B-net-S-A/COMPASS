'use client'

// Phase 27j — manager/admin view of team members' leaves with inline edit +
// cancel (Dominik report: managers could enter a leave on-behalf but had no way
// to see, fix the type of, or cancel it afterwards).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Pencil, Ban, UserCheck } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import {
    cancelTeamLeave,
    updateTeamLeave,
    type LeaveOnBehalfCandidate,
    type LeaveType,
    type TeamLeaveRow,
} from '@/lib/actions/internal-leave'

const LEAVE_TYPE_LABEL: Record<string, string> = {
    vacation: 'Urlop wypoczynkowy',
    sick_leave: 'L4',
    parental_leave: 'Opieka rodzicielska',
    unpaid_leave: 'Urlop bezpłatny',
    training: 'Szkolenie',
    on_demand: 'Urlop na żądanie',
    occasional: 'Urlop okolicznościowy',
    childcare: 'Opieka nad dzieckiem (art. 188)',
    care_leave: 'Urlop opiekuńczy',
    force_majeure: 'Siła wyższa',
    maternity: 'Urlop macierzyński',
    paternity: 'Urlop ojcowski',
    childrearing: 'Urlop wychowawczy',
    blood_donation: 'Krwiodawstwo',
    holiday_in_lieu: 'Odbiór dnia za święto',
    other: 'Inne',
}

// L4 (sick_leave) intentionally excluded — must be entered by the employee with a doc.
const EDITABLE_LEAVE_TYPES: ReadonlyArray<{ value: LeaveType; label: string }> = [
    { value: 'vacation', label: 'Urlop wypoczynkowy' },
    { value: 'parental_leave', label: 'Opieka rodzicielska' },
    { value: 'unpaid_leave', label: 'Urlop bezpłatny' },
    { value: 'other', label: 'Inne' },
]

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    pending: { label: 'Oczekuje', className: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
    approved: { label: 'Zaakceptowany', className: 'bg-green-500/15 text-green-300 border-green-500/30' },
}

function fmt(d: string): string {
    return format(parseISO(d), 'd LLL yyyy', { locale: pl })
}

interface Props {
    leaves: TeamLeaveRow[]
    candidates: LeaveOnBehalfCandidate[]
}

export function TeamLeavesList({ leaves, candidates }: Props) {
    const router = useRouter()
    const [confirm, ConfirmUI] = useConfirm()
    const [pending, startTransition] = useTransition()
    const [busyId, setBusyId] = useState<string | null>(null)
    const [editTarget, setEditTarget] = useState<TeamLeaveRow | null>(null)

    async function handleCancel(leave: TeamLeaveRow) {
        const who = leave.user_full_name ?? leave.user_email
        const ok = await confirm({
            title: 'Anulować urlop',
            description: `${who}: ${LEAVE_TYPE_LABEL[leave.leave_type] ?? leave.leave_type} (${fmt(leave.start_date)} – ${fmt(leave.end_date)})? Pracownik dostanie powiadomienie.`,
            confirmLabel: 'Anuluj urlop',
            variant: 'destructive',
        })
        if (!ok) return
        setBusyId(leave.id)
        startTransition(async () => {
            try {
                await cancelTeamLeave(leave.id)
                toastSuccess('Urlop anulowany')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            } finally {
                setBusyId(null)
            }
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Urlopy zespołu — edytuj lub anuluj</CardTitle>
            </CardHeader>
            <CardContent>
                {leaves.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                        Brak aktywnych ani nadchodzących urlopów w Twoim zespole.
                    </p>
                ) : (
                    <div className="divide-y divide-border/40">
                        {leaves.map((leave) => {
                            const status = STATUS_BADGE[leave.status]
                            const busy = pending && busyId === leave.id
                            return (
                                <div
                                    key={leave.id}
                                    className="py-3 flex flex-wrap items-start justify-between gap-3"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-medium">
                                                {leave.user_full_name ?? leave.user_email}
                                            </span>
                                            {status && (
                                                <Badge variant="outline" className={status.className}>
                                                    {status.label}
                                                </Badge>
                                            )}
                                            <span className="text-sm">
                                                {LEAVE_TYPE_LABEL[leave.leave_type] ?? leave.leave_type}
                                            </span>
                                            {leave.half_day && (
                                                <Badge variant="outline" className="text-[10px]">
                                                    {leave.half_day === 'morning' ? '½ rano' : '½ popoł.'}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {fmt(leave.start_date)} – {fmt(leave.end_date)}
                                        </p>
                                        {leave.created_on_behalf && (
                                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                                Wpisany przez przełożonego
                                            </p>
                                        )}
                                        {leave.substitute_full_name && (
                                            <p className="text-xs mt-1 text-muted-foreground inline-flex items-center gap-1">
                                                <UserCheck className="h-3 w-3" />
                                                Zastępca:{' '}
                                                <span className="font-medium text-foreground">
                                                    {leave.substitute_full_name}
                                                </span>
                                            </p>
                                        )}
                                        {leave.note && (
                                            <p className="text-xs mt-1 italic text-muted-foreground line-clamp-2">
                                                „{leave.note}"
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex gap-1.5 shrink-0">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() => setEditTarget(leave)}
                                        >
                                            <Pencil className="h-3 w-3 mr-1" />
                                            Edytuj
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            disabled={busy}
                                            onClick={() => handleCancel(leave)}
                                        >
                                            {busy ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <>
                                                    <Ban className="h-3 w-3 mr-1" />
                                                    Anuluj
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>

            {editTarget && (
                <EditTeamLeaveDialog
                    leave={editTarget}
                    candidates={candidates}
                    onClose={() => setEditTarget(null)}
                    onSaved={() => {
                        setEditTarget(null)
                        router.refresh()
                    }}
                />
            )}
            <ConfirmUI />
        </Card>
    )
}

interface EditDialogProps {
    leave: TeamLeaveRow
    candidates: LeaveOnBehalfCandidate[]
    onClose: () => void
    onSaved: () => void
}

function EditTeamLeaveDialog({ leave, candidates, onClose, onSaved }: EditDialogProps) {
    const [leaveType, setLeaveType] = useState<LeaveType>(
        (EDITABLE_LEAVE_TYPES.some((t) => t.value === leave.leave_type)
            ? leave.leave_type
            : 'other') as LeaveType,
    )
    const [startDate, setStartDate] = useState(leave.start_date)
    const [endDate, setEndDate] = useState(leave.end_date)
    const [halfDay, setHalfDay] = useState<'' | 'morning' | 'afternoon'>(leave.half_day ?? '')
    const [note, setNote] = useState(leave.note ?? '')
    const [substituteId, setSubstituteId] = useState(leave.substitute_id ?? '')
    const [pending, startTransition] = useTransition()

    const showHalfDay = startDate !== '' && startDate === endDate

    // Substitute options: HR-zone people the caller manages, minus the employee.
    // Keep the current substitute selectable even if outside the candidate set.
    const substituteOptions = candidates
        .filter((c) => c.id !== leave.user_id)
        .map((c) => ({ id: c.id, label: c.full_name ?? c.email }))
    if (leave.substitute_id && !substituteOptions.some((o) => o.id === leave.substitute_id)) {
        substituteOptions.unshift({
            id: leave.substitute_id,
            label: leave.substitute_full_name ?? 'Obecny zastępca',
        })
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!startDate || !endDate) {
            toast.error('Podaj zakres dat.')
            return
        }
        if (endDate < startDate) {
            toast.error('Data końca nie może być wcześniejsza niż początek.')
            return
        }
        startTransition(async () => {
            try {
                await updateTeamLeave({
                    id: leave.id,
                    leaveType,
                    startDate,
                    endDate,
                    halfDay: showHalfDay && halfDay ? halfDay : null,
                    note: note.trim() || null,
                    substituteId: substituteId || null,
                })
                toastSuccess('Urlop zaktualizowany — pracownik dostał powiadomienie.')
                onSaved()
            } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : 'Błąd')
            }
        })
    }

    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>Edytuj urlop</DialogTitle>
                    <DialogDescription>
                        {leave.user_full_name ?? leave.user_email} — zmiana typu/dat przeliczy obecności.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="edit_leave_type">Typ urlopu</Label>
                        <select
                            id="edit_leave_type"
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                            value={leaveType}
                            onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                        >
                            {EDITABLE_LEAVE_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                    {t.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit_start">Od</Label>
                            <Input
                                id="edit_start"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                required
                                className="min-h-[44px] text-base"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit_end">Do</Label>
                            <Input
                                id="edit_end"
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                required
                                className="min-h-[44px] text-base"
                            />
                        </div>
                    </div>
                    {showHalfDay && (
                        <div className="space-y-1.5">
                            <Label htmlFor="edit_half_day">Połowa dnia (opcjonalnie)</Label>
                            <select
                                id="edit_half_day"
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                                value={halfDay}
                                onChange={(e) =>
                                    setHalfDay(e.target.value as '' | 'morning' | 'afternoon')
                                }
                            >
                                <option value="">Cały dzień</option>
                                <option value="morning">Pierwsza połowa</option>
                                <option value="afternoon">Druga połowa</option>
                            </select>
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <Label htmlFor="edit_substitute" className="flex items-center gap-1.5">
                            <UserCheck className="w-3.5 h-3.5" />
                            Zastępca (opcjonalnie)
                        </Label>
                        <select
                            id="edit_substitute"
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                            value={substituteId}
                            onChange={(e) => setSubstituteId(e.target.value)}
                        >
                            <option value="">— bez zastępcy —</option>
                            {substituteOptions.map((o) => (
                                <option key={o.id} value={o.id}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="edit_note">Notatka (opcjonalna)</Label>
                        <Textarea
                            id="edit_note"
                            rows={3}
                            maxLength={500}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                            Wstecz
                        </Button>
                        <Button type="submit" disabled={pending}>
                            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Zapisz zmiany
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
