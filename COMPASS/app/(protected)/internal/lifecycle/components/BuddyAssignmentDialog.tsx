'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, UserCheck, X } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { assignBuddy, listBuddyCandidates } from '@/lib/actions/lifecycle'
import { roleLabelPl, type DbRole } from '@/lib/types/role'

interface BuddyCandidate {
    id: string
    email: string
    full_name: string | null
    role: DbRole
}

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    employeeId: string
    employeeName: string
    currentBuddyId: string | null
    currentBuddyName: string | null
}

export function BuddyAssignmentDialog({ open, onOpenChange, employeeId, employeeName, currentBuddyId, currentBuddyName }: Props) {
    const router = useRouter()
    const [search, setSearch] = useState('')
    const [candidates, setCandidates] = useState<BuddyCandidate[]>([])
    const [loading, setLoading] = useState(false)
    const [selectedBuddyId, setSelectedBuddyId] = useState<string>(currentBuddyId ?? '')
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        if (!open) return
        setLoading(true)
        listBuddyCandidates(employeeId)
            .then(setCandidates)
            .catch((e) => toast.error(e instanceof Error ? e.message : 'Błąd pobierania kandydatów'))
            .finally(() => setLoading(false))
    }, [open, employeeId])

    const filtered = search.trim()
        ? candidates.filter(
            (c) =>
                (c.full_name ?? '').toLowerCase().includes(search.toLowerCase())
                || c.email.toLowerCase().includes(search.toLowerCase()),
        )
        : candidates

    function handleSave() {
        startTransition(async () => {
            try {
                await assignBuddy(employeeId, selectedBuddyId || null)
                toastSuccess(
                    selectedBuddyId
                        ? `Buddy przypisany dla ${employeeName}.`
                        : `Buddy odpisany od ${employeeName}.`,
                )
                onOpenChange(false)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Nie udało się przypisać buddy.')
            }
        })
    }

    function handleUnassign() {
        if (!confirm(`Odpisać buddy od ${employeeName}?`)) return
        setSelectedBuddyId('')
        startTransition(async () => {
            try {
                await assignBuddy(employeeId, null)
                toastSuccess('Buddy odpisany.')
                onOpenChange(false)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd.')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <UserCheck className="h-5 w-5" />
                        Przypisz buddy
                    </DialogTitle>
                    <DialogDescription>
                        Buddy to peer (najczęściej bardziej doświadczony kolega) który pomaga nowemu pracownikowi w pierwszych tygodniach. Ma read access do progress'u onboardingu i może oznaczyć taski z responsible_role='buddy'.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="text-sm">
                        Pracownik: <strong>{employeeName}</strong>
                    </div>

                    {currentBuddyId && currentBuddyName && (
                        <div className="flex items-center justify-between rounded border border-info/30 bg-info/5 p-3 text-sm">
                            <span>Aktualny buddy: <strong>{currentBuddyName}</strong></span>
                            <Button size="sm" variant="ghost" onClick={handleUnassign} disabled={isPending}>
                                <X className="h-4 w-4 mr-1" />
                                Odpisz
                            </Button>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label>Wyszukaj kandydata</Label>
                        <Input
                            type="text"
                            placeholder="Imię, nazwisko lub email"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    {loading ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                            Ładowanie...
                        </p>
                    ) : (
                        <div className="max-h-60 overflow-y-auto rounded border bg-background divide-y">
                            {filtered.length === 0 ? (
                                <p className="p-3 text-sm text-muted-foreground">
                                    Brak kandydatów.
                                </p>
                            ) : (
                                filtered.map((c) => (
                                    <button
                                        type="button"
                                        key={c.id}
                                        onClick={() => setSelectedBuddyId(c.id)}
                                        className={`w-full text-left p-3 text-sm hover:bg-accent ${
                                            selectedBuddyId === c.id ? 'bg-accent' : ''
                                        }`}
                                    >
                                        <div className="font-medium">{c.full_name ?? c.email}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {c.email} • {roleLabelPl(c.role)}
                                        </div>
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
                        Anuluj
                    </Button>
                    <Button onClick={handleSave} disabled={isPending || !selectedBuddyId || selectedBuddyId === currentBuddyId}>
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <UserCheck className="h-4 w-4 mr-2" />}
                        Zapisz przypisanie
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
