'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, UserPlus } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    listEmployeesForLifecycle,
    listTemplateChoices,
    startOnboardingWithOptions,
    type EligibleEmployee,
    type TemplateChoice,
} from '@/lib/actions/lifecycle'
import { roleLabelPl } from '@/lib/types/role'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function StartOnboardingDialog({ open, onOpenChange }: Props) {
    const router = useRouter()
    const [search, setSearch] = useState('')
    const [employees, setEmployees] = useState<EligibleEmployee[]>([])
    const [templates, setTemplates] = useState<TemplateChoice[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedUserId, setSelectedUserId] = useState<string>('')
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
    const [hiredAt, setHiredAt] = useState<string>('')
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        if (!open) return
        setLoading(true)
        Promise.all([
            listEmployeesForLifecycle('onboarding'),
            listTemplateChoices(),
        ])
            .then(([emps, tpls]) => {
                setEmployees(emps)
                setTemplates(tpls)
            })
            .catch((e) => toast.error(e instanceof Error ? e.message : 'Błąd pobierania danych'))
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

    // Suggest default template matching role
    useEffect(() => {
        if (!selectedEmployee || selectedTemplateId) return
        const defaultForRole = templates.find((t) => t.target_role === selectedEmployee.role && t.is_default)
        if (defaultForRole) setSelectedTemplateId(defaultForRole.id)
    }, [selectedEmployee, templates, selectedTemplateId])

    // Suggest hired_at from work_start_date
    useEffect(() => {
        if (!selectedEmployee || hiredAt) return
        const suggested = selectedEmployee.hired_at ?? selectedEmployee.work_start_date
        if (suggested) setHiredAt(suggested)
    }, [selectedEmployee, hiredAt])

    function reset() {
        setSearch('')
        setSelectedUserId('')
        setSelectedTemplateId('')
        setHiredAt('')
    }

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!selectedUserId) {
            toast.error('Wybierz pracownika.')
            return
        }
        if (!selectedTemplateId) {
            toast.error('Wybierz szablon onboardingu.')
            return
        }
        startTransition(async () => {
            try {
                const progressId = await startOnboardingWithOptions({
                    userId: selectedUserId,
                    templateId: selectedTemplateId,
                    hiredAt: hiredAt || null,
                })
                toastSuccess(`Onboarding uruchomiony dla ${selectedEmployee?.full_name ?? selectedEmployee?.email}.`)
                reset()
                onOpenChange(false)
                router.push(`/internal/lifecycle/onboarding/${progressId}`)
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Nie udało się uruchomić onboardingu.')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserPlus className="h-5 w-5" />
                        Nowy onboarding
                    </DialogTitle>
                    <DialogDescription>
                        Uruchom proces onboardingu dla istniejącego pracownika. Aby zaprosić nową osobę z domyślnym onboardingiem, użyj <a href="/internal/admin?tab=employees" className="underline">Administracja HR → Pracownicy</a>.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label>Wyszukaj pracownika (po nazwisku lub emailu)</Label>
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
                                        {search ? 'Brak pasujących pracowników.' : 'Wszyscy pracownicy mają już aktywny onboarding lub są w offboarding/exited.'}
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
                                <Label htmlFor="hired-at">
                                    Data zatrudnienia (hire date)
                                </Label>
                                <Input
                                    id="hired-at"
                                    type="date"
                                    value={hiredAt}
                                    onChange={(e) => setHiredAt(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Wpływa na terminy zadań (due_date = hired_at + due_offset_days). Domyślnie z profilu.
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="template">Szablon onboardingu</Label>
                                <select
                                    id="template"
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                                    value={selectedTemplateId}
                                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                                    disabled={isPending}
                                >
                                    <option value="">— Wybierz —</option>
                                    {templates.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name} ({t.items_count} items)
                                            {t.is_default ? ' ★' : ''}
                                            {' '}— {roleLabelPl(t.target_role)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="rounded border border-cyan-400/30 bg-cyan-400/5 p-3 text-xs text-muted-foreground">
                                Po kliknięciu &quot;Uruchom&quot;:
                                <ul className="list-disc list-inside mt-1 space-y-0.5">
                                    <li>Status pracownika zmieni się na <strong>onboarding</strong></li>
                                    <li>Zostanie wysłany email powitalny z linkiem do checklist'a</li>
                                    <li>Tasks utworzą się automatycznie z due_date wyliczonym z hired_at</li>
                                </ul>
                            </div>
                        </>
                    )}

                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                            Anuluj
                        </Button>
                        <Button type="submit" disabled={isPending || !selectedUserId || !selectedTemplateId}>
                            {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserPlus className="h-4 w-4 mr-2" />}
                            Uruchom onboarding
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
