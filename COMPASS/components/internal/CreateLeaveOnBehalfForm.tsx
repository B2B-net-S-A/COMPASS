'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, UserCheck, AlertTriangle, Info } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    createLeaveOnBehalf,
    type LeaveOnBehalfCandidate,
    type LeaveType,
} from '@/lib/actions/internal-leave'

interface Props {
    candidates: LeaveOnBehalfCandidate[]
}

// L4 (sick_leave) celowo wykluczony — wpisuje pracownik z dokumentem.
const LEAVE_TYPES: ReadonlyArray<{ value: LeaveType; label: string }> = [
    { value: 'vacation', label: 'Urlop wypoczynkowy' },
    { value: 'parental_leave', label: 'Opieka rodzicielska' },
    { value: 'unpaid_leave', label: 'Urlop bezpłatny' },
    { value: 'other', label: 'Inne' },
]

export function CreateLeaveOnBehalfForm({ candidates }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [targetUserId, setTargetUserId] = useState<string>('')
    const [leaveType, setLeaveType] = useState<LeaveType>('vacation')
    const [startDate, setStartDate] = useState<string>('')
    const [endDate, setEndDate] = useState<string>('')
    const [halfDay, setHalfDay] = useState<'' | 'morning' | 'afternoon'>('')
    const [note, setNote] = useState<string>('')
    const [substituteId, setSubstituteId] = useState<string>('')

    const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
    const showHalfDay = startDate && endDate && startDate === endDate
    const isPastLeave = endDate !== '' && endDate < today
    const showSubstitute = endDate !== '' && !isPastLeave

    // Lista zastępców = candidates minus aktualnie wybrany target (pracownik nie
    // może być sam swoim zastępcą).
    const substituteCandidates = useMemo(
        () => candidates.filter((c) => c.id !== targetUserId),
        [candidates, targetUserId],
    )

    function resetForm() {
        setTargetUserId('')
        setLeaveType('vacation')
        setStartDate('')
        setEndDate('')
        setHalfDay('')
        setNote('')
        setSubstituteId('')
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!targetUserId) {
            toast.error('Wybierz pracownika.')
            return
        }
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
                await createLeaveOnBehalf({
                    targetUserId,
                    startDate,
                    endDate,
                    leaveType,
                    halfDay: showHalfDay && halfDay ? halfDay : null,
                    note: note.trim() || null,
                    substituteId: showSubstitute && substituteId ? substituteId : null,
                })
                toastSuccess(
                    isPastLeave
                        ? 'Urlop wpisany. Pracownik dostał email + push. Outlook OOF nie ustawiany (urlop minął).'
                        : 'Urlop wpisany. Pracownik dostał email + push, w Outlooku ustawiony Out of Office.',
                )
                resetForm()
                router.refresh()
            } catch (err: unknown) {
                toast.error(err instanceof Error ? err.message : 'Nieznany błąd')
            }
        })
    }

    if (candidates.length === 0) {
        return (
            <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Brak pracowników do wyboru. Jeśli jesteś managerem — sprawdź czy masz przypisanych
                    podwładnych w polu <code>profiles.manager_id</code>.
                </CardContent>
            </Card>
        )
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Nowy wpis</CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="target_user">Pracownik</Label>
                        <select
                            id="target_user"
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={targetUserId}
                            onChange={(e) => setTargetUserId(e.target.value)}
                            required
                        >
                            <option value="">— wybierz pracownika —</option>
                            {candidates.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.full_name ?? c.email} ({c.email})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="leave_type">Typ urlopu</Label>
                        <select
                            id="leave_type"
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                            value={leaveType}
                            onChange={(e) => setLeaveType(e.target.value as LeaveType)}
                        >
                            {LEAVE_TYPES.map((t) => (
                                <option key={t.value} value={t.value}>
                                    {t.label}
                                </option>
                            ))}
                        </select>
                        <p className="text-[11px] text-muted-foreground">
                            L4 (zwolnienie lekarskie) musi wpisać pracownik z dołączonym skanem dokumentu.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="start_date">Od</Label>
                            <Input
                                id="start_date"
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                required
                                className="min-h-[44px] text-base"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="end_date">Do</Label>
                            <Input
                                id="end_date"
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
                            <Label htmlFor="half_day">Połowa dnia (opcjonalnie)</Label>
                            <select
                                id="half_day"
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                                value={halfDay}
                                onChange={(e) => setHalfDay(e.target.value as '' | 'morning' | 'afternoon')}
                            >
                                <option value="">Cały dzień</option>
                                <option value="morning">Pierwsza połowa</option>
                                <option value="afternoon">Druga połowa</option>
                            </select>
                        </div>
                    )}

                    {isPastLeave && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                            <div className="space-y-1">
                                <p className="font-medium text-amber-200">Urlop zakończony</p>
                                <p className="text-xs text-amber-100/80">
                                    Outlook OOF i email do zastępcy NIE zostaną wysłane — nie ma sensu ustawiać
                                    auto-reply na okres, który już minął. Zarejestrujemy wpis w systemie,
                                    przeliczymy obecności i wyślemy email + push do pracownika.
                                </p>
                            </div>
                        </div>
                    )}

                    {!isPastLeave && endDate !== '' && (
                        <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
                            <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                            <div className="space-y-1">
                                <p className="font-medium text-blue-200">Urlop ongoing / future</p>
                                <p className="text-xs text-blue-100/80">
                                    Po zapisie ustawimy automatycznie Out of Office w Outlooku pracownika
                                    i utworzymy wydarzenie w jego kalendarzu. Jeśli wybierzesz zastępcę —
                                    dostanie email z informacją.
                                </p>
                            </div>
                        </div>
                    )}

                    {showSubstitute && (
                        <div className="space-y-1.5">
                            <Label htmlFor="substitute" className="flex items-center gap-1.5">
                                <UserCheck className="w-3.5 h-3.5" />
                                Zastępca (opcjonalnie)
                            </Label>
                            <select
                                id="substitute"
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                                value={substituteId}
                                onChange={(e) => setSubstituteId(e.target.value)}
                            >
                                <option value="">— bez zastępcy —</option>
                                {substituteCandidates.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.full_name ?? s.email} ({s.email})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="note">Notatka (opcjonalna)</Label>
                        <Textarea
                            id="note"
                            rows={3}
                            maxLength={500}
                            placeholder="Powód lub kontekst — np. 'pracownik zgłosił chorobę telefonicznie, zapomniał wniosku'"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                        <p className="text-[11px] text-muted-foreground">
                            Notatka będzie widoczna dla pracownika w jego historii urlopów oraz w audit log.
                        </p>
                    </div>

                    <Button type="submit" disabled={pending} className="w-full sm:w-auto min-h-[44px]">
                        {pending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Wpisz urlop i powiadom pracownika
                    </Button>
                </form>
            </CardContent>
        </Card>
    )
}
