'use client'

// Phase 46 — wybór konsultanta przed rozmową (wzorzec wyszukiwarki osób ze
// StartOnboardingDialog: Input + filtrowana lista). Klik → strona wywiadu.
// Phase 46e: gdy kogoś nie ma w bazie (np. jest tylko w NEXUS), TCM dodaje go
// prosto stąd — „Dodaj konsultanta" tworzy wiersz contractors i otwiera wywiad.

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MessageSquarePlus, Search, UserPlus } from 'lucide-react'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from '@/lib/toast'
import { createContractor } from '@/lib/actions/contractors'
import { CONTRACTOR_STATUS_PL, type ContractorStatus } from '@/lib/types/contractor'

export interface PickerContractor {
    id: string
    fullName: string
    currentClient: string | null
    status: ContractorStatus
}

export function NewInterviewPicker({ contractors }: { contractors: PickerContractor[] }) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState('')
    const [creating, setCreating] = useState(false)

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return contractors
        return contractors.filter(
            (c) =>
                c.fullName.toLowerCase().includes(q) ||
                (c.currentClient ?? '').toLowerCase().includes(q),
        )
    }, [contractors, search])

    const query = search.trim()
    // Oferuj dodanie tylko gdy nikt nie pasuje DOKŁADNIE po nazwisku (żeby nie
    // dublować istniejącej osoby wpisanej 1:1).
    const exactMatch = useMemo(
        () => contractors.some((c) => c.fullName.toLowerCase() === query.toLowerCase()),
        [contractors, query],
    )
    const canCreate = query.length >= 2 && !exactMatch

    async function create() {
        if (!canCreate || creating) return
        setCreating(true)
        try {
            const { id } = await createContractor({ fullName: query })
            setOpen(false)
            router.push(`/internal/people/mapa/wywiad/${id}`)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się dodać konsultanta.')
        } finally {
            setCreating(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Button onClick={() => setOpen(true)}>
                <MessageSquarePlus className="mr-2 h-4 w-4" /> Nowa rozmowa
            </Button>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Z kim rozmawiasz?</DialogTitle>
                </DialogHeader>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        autoFocus
                        className="pl-9"
                        placeholder="Szukaj po nazwisku lub kliencie…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <p className="text-xs text-muted-foreground">
                    {filtered.length} {filtered.length === 1 ? 'konsultant' : 'konsultantów'}
                </p>
                <ScrollArea className="h-72 rounded-md border border-border">
                    <div className="divide-y divide-border">
                        {filtered.map((c) => (
                            <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                    setOpen(false)
                                    router.push(`/internal/people/mapa/wywiad/${c.id}`)
                                }}
                                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate font-medium">{c.fullName}</span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                        {c.currentClient ?? 'brak klienta'}
                                    </span>
                                </span>
                                <Badge variant={c.status === 'active' ? 'success' : 'neutral'} size="sm">
                                    {CONTRACTOR_STATUS_PL[c.status]}
                                </Badge>
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                                Brak wyników dla „{search}”.
                            </p>
                        )}
                    </div>
                </ScrollArea>
                {canCreate && (
                    <Button variant="outline" onClick={create} disabled={creating} className="w-full">
                        {creating ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <UserPlus className="mr-2 h-4 w-4" />
                        )}
                        Dodaj konsultanta „{query}” i rozpocznij rozmowę
                    </Button>
                )}
            </DialogContent>
        </Dialog>
    )
}
