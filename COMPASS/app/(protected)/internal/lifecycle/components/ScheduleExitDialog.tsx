'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, LogOut } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    listEmployeesForLifecycle,
    scheduleExitInterview,
    type EligibleEmployee,
} from '@/lib/actions/lifecycle'
import { roleLabelPl } from '@/lib/types/role'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function ScheduleExitDialog({ open, onOpenChange }: Props) {
    const router = useRouter()
    const [search, setSearch] = useState('')
    const [employees, setEmployees] = useState<EligibleEmployee[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedUserId, setSelectedUserId] = useState<string>('')
    const [terminationDate, setTerminationDate] = useState<string>('')
    const [scheduledFor, setScheduledFor] = useState<string>('')
    const [sendManagerEmail, setSendManagerEmail] = useState(false)
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        if (!open) return
        setLoading(true)
        listEmployeesForLifecycle('exit')
            .then(setEmployees)
            .catch((e) => toast.error(e instanceof Error ? e.message : 'Błąd pobierania pracowników'))
            .finally(() => setLoading(false))
    }, [open])

    const selectedEmployee = employees.find((e) => e.id === selectedUserId) ?? null
    const filteredEmployees = search.trim()
        ? employees.filter(
            (e) =>
                (e.full_name ?? '').toLowerCase().includes(search.toLowerCase())
                || e.email.toLowerCase().includes(search.toLowerCase()),
        )
        : employees

    // Auto-suggest scheduled_for = termination_date - 3 days
    useEffect(() => {
        if (!terminationDate || scheduledFor) return
        const td = new Date(terminationDate)
        td.setDate(td.getDate() - 3)
        setScheduledFor(td.toISOString().split('T')[0])
    }, [terminationDate, scheduledFor])

    function reset() {
        setSearch('')
        setSelectedUserId('')
        setTerminationDate('')
        setScheduledFor('')
        setSendManagerEmail(false)
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!selectedUserId) {
            toast.error('Wybierz pracownika.')
            return
        }
        if (!terminationDate) {
            toast.error('Podaj datę zakończenia (termination date).')
            return
        }
        startTransition(async () => {
            try {
                const interviewId = await scheduleExitInterview(
                    selectedUserId,
                    terminationDate,
                    scheduledFor || null,
                    { sendEmployeeEmail: false, sendManagerEmail },
                )
                const who = selectedEmployee?.full_name ?? selectedEmployee?.email
                toastSuccess(
                    sendManagerEmail
                        ? `Offboarding zaplanowany dla ${who}. Utworzono ticket w Module Obsługi Zgłoszeń + wysłano checklist do managera.`
                        : `Offboarding zaplanowany dla ${who}. Utworzono ticket "${who} Offboarding" w Module Obsługi Zgłoszeń.`,
                )
                reset()
                onOpenChange(false)
                router.push(`/internal/lifecycle/exit/${interviewId}`)
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Nie udało się zaplanować exit interview.')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <LogOut className="h-5 w-5 text-amber-400" />
                        Zaplanuj offboarding
                    </DialogTitle>
                    <DialogDescription>
                        Status pracownika zmieni się na <strong>offboarding</strong>, utworzy się 5 default offboarding tasków oraz <strong>ticket &quot;[Imię i Nazwisko] Offboarding&quot;</strong> w Module Obsługi Zgłoszeń (przypisany do Ciebie). Pracownik <strong>nie wypełnia żadnej ankiety</strong>. Email do managera nie jest wysyłany automatycznie — zaznacz poniżej, jeśli chcesz wysłać mu checklist.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label>Wyszukaj pracownika</Label>
                        <Input
                            type="text"
                            placeholder="Jan Kowalski lub jan@b2bnetwork.pl"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoComplete="off"
                        />
                    </div>

                    {loading ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                            Ładowanie...
                        </p>
                    ) : (
                        <div className="space-y-1.5">
                            <Label>Pracownik ({filteredEmployees.length} dostępnych)</Label>
                            <div className="max-h-48 overflow-y-auto rounded border bg-background divide-y">
                                {filteredEmployees.length === 0 ? (
                                    <p className="p-3 text-sm text-muted-foreground">
                                        {search ? 'Brak pasujących pracowników.' : 'Brak pracowników bez zaplanowanego exit interview.'}
                                    </p>
                                ) : (
                                    filteredEmployees.map((emp) => (
                                        <button
                                            type="button"
                                            key={emp.id}
                                            onClick={() => setSelectedUserId(emp.id)}
                                            className={`w-full text-left p-3 text-sm hover:bg-accent ${
                                                selectedUserId === emp.id ? 'bg-accent' : ''
                                            }`}
                                        >
                                            <div className="font-medium">{emp.full_name ?? emp.email}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {emp.email} • {roleLabelPl(emp.role)} • status: {emp.employment_status}
                                                {emp.hired_at && ` • zatrudnienie: ${emp.hired_at}`}
                                            </div>
                                        </button>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {selectedEmployee && (
                        <>
                            <div className="space-y-1.5">
                                <Label htmlFor="termination-date">Data zakończenia współpracy *</Label>
                                <Input
                                    id="termination-date"
                                    type="date"
                                    value={terminationDate}
                                    onChange={(e) => setTerminationDate(e.target.value)}
                                    required
                                />
                                <p className="text-xs text-muted-foreground">
                                    Last day of work — używana do tenure calculation i due dates offboarding tasks.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="scheduled-for">Sugerowana data realizacji offboardingu</Label>
                                <Input
                                    id="scheduled-for"
                                    type="date"
                                    value={scheduledFor}
                                    onChange={(e) => setScheduledFor(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Domyślnie 3 dni przed datą zakończenia. Trafia do treści ticketu offboardingowego jako sugerowany termin.
                                </p>
                            </div>

                            <div className="space-y-2 rounded border border-input bg-background p-3">
                                <div className="text-sm font-medium">Powiadomienia email (opcjonalne)</div>
                                <label className="flex items-start gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={sendManagerEmail}
                                        onChange={(e) => setSendManagerEmail(e.target.checked)}
                                        className="mt-0.5 h-4 w-4 rounded border-input"
                                    />
                                    <span className="text-sm">
                                        Wyślij checklist offboardingu managerowi
                                        <span className="block text-xs text-muted-foreground">
                                            Email z listą tasków (zwrot sprzętu, knowledge transfer, etc.) do managera pracownika. Domyślnie wyłączone.
                                        </span>
                                    </span>
                                </label>
                            </div>

                            <div className="rounded border border-amber-400/30 bg-amber-400/5 p-3 text-xs text-muted-foreground">
                                Po kliknięciu &quot;Zaplanuj&quot;:
                                <ul className="list-disc list-inside mt-1 space-y-0.5">
                                    <li>Status pracownika: <strong>active → offboarding</strong></li>
                                    <li>Ticket <strong>&quot;{selectedEmployee.full_name ?? selectedEmployee.email} Offboarding&quot;</strong> w Module Obsługi Zgłoszeń (przypisany do Ciebie)</li>
                                    <li>5 default offboarding tasks (cofnięcie dostępów, zwrot sprzętu, knowledge transfer, finalne rozliczenie, archiwizacja)</li>
                                    <li>
                                        Email do managera: {sendManagerEmail
                                            ? <strong>tak</strong>
                                            : <em>nie (możesz wysłać później z karty exit)</em>}
                                    </li>
                                    <li>Push notyfikacja in-app do managera (pracownik nie dostaje ankiety)</li>
                                </ul>
                            </div>
                        </>
                    )}

                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                            Anuluj
                        </Button>
                        <Button type="submit" disabled={isPending || !selectedUserId || !terminationDate}>
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogOut className="h-4 w-4 mr-2" />}
                            Zaplanuj offboarding
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
