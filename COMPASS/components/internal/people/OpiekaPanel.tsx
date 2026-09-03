'use client'

// People Ops → Opieka: lista konsultantów pod opieką Talent Community
// (pracujący u klienta + bench) z przypisaniem opiekuna — pojedynczym i masowym.
//
// Masowe przypisanie jest tu sednem, nie ozdobą: kolumna `owner_tcm_id` istnieje
// od czerwca, ale dało się ją wypełniać wyłącznie po jednej osobie, więc na 688
// rekordów przypisany był jeden. Przy ~330 konsultantach rozdzielenie portfela
// musi być wykonalne w kilkanaście kliknięć, nie w kilkaset.

import { useMemo, useState, useTransition } from 'react'
import { Loader2, UserCheck, UserX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { assignCareOwner } from '@/lib/actions/contractors'
import type { CareRosterItem } from '@/lib/types/contractor'

interface TcmOption {
    id: string
    fullName: string
}

interface Props {
    roster: CareRosterItem[]
    tcmOptions: TcmOption[]
    /** Zalogowany TCM — dla filtru „moi konsultanci". */
    currentUserId: string
}

const selectClass = 'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring'

const BENCH_STATUS_PL: Record<string, string> = {
    w_rekrutacji: 'w rekrutacji',
    przepiety: 'przepięty',
    zakonczenie_umowy: 'zakończenie umowy',
}

/** Wartości filtru opiekuna, które nie są identyfikatorem osoby. */
const OWNER_ALL = ''
const OWNER_NONE = '__none__'
const OWNER_MINE = '__mine__'

export function OpiekaPanel({ roster, tcmOptions, currentUserId }: Props) {
    // Lista trzymana w stanie, żeby po przypisaniu wiersze odświeżyły się od razu —
    // revalidatePath dociągnie to samo chwilę później, ale bez tego zaznaczenie
    // „znika" na oczach użytkownika, zanim pojawi się nowy opiekun.
    const [items, setItems] = useState<CareRosterItem[]>(roster)
    const [query, setQuery] = useState('')
    const [ownerFilter, setOwnerFilter] = useState<string>(OWNER_ALL)
    const [situationFilter, setSituationFilter] = useState<string>('')
    const [clientFilter, setClientFilter] = useState<string>('')
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [bulkOwner, setBulkOwner] = useState<string>('')
    const [pending, startTransition] = useTransition()

    const clients = useMemo(() => {
        const set = new Set<string>()
        for (const item of items) if (item.clientName) set.add(item.clientName)
        return Array.from(set).sort((a, b) => a.localeCompare(b, 'pl'))
    }, [items])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        return items.filter((item) => {
            if (q && !item.fullName.toLowerCase().includes(q) && !(item.clientName ?? '').toLowerCase().includes(q)) return false
            if (ownerFilter === OWNER_NONE && item.ownerTcmId) return false
            if (ownerFilter === OWNER_MINE && item.ownerTcmId !== currentUserId) return false
            if (ownerFilter && ownerFilter !== OWNER_NONE && ownerFilter !== OWNER_MINE && item.ownerTcmId !== ownerFilter) return false
            if (situationFilter && item.situation !== situationFilter) return false
            if (clientFilter && item.clientName !== clientFilter) return false
            return true
        })
    }, [items, query, ownerFilter, situationFilter, clientFilter, currentUserId])

    const withoutOwner = useMemo(() => items.filter((i) => !i.ownerTcmId).length, [items])

    /** Obciążenie per opiekun — przy 10 osobach i ~330 konsultantach to jedyny
     *  sposób, żeby rozdzielać portfel świadomie, a nie na wyczucie. */
    const workload = useMemo(() => {
        const counts = new Map<string, number>()
        for (const item of items) {
            if (item.ownerTcmId) counts.set(item.ownerTcmId, (counts.get(item.ownerTcmId) ?? 0) + 1)
        }
        return tcmOptions
            .map((option) => ({ ...option, count: counts.get(option.id) ?? 0 }))
            .sort((a, b) => b.count - a.count || a.fullName.localeCompare(b.fullName, 'pl'))
    }, [items, tcmOptions])

    /**
     * Zaznaczenie NIE jest czyszczone przy zmianie filtru (żeby dopisanie litery
     * w wyszukiwarce nie kasowało pracy), więc może zawierać osoby aktualnie
     * niewidoczne. Wszystko — licznik, pasek i sama akcja — patrzy na PRZECIĘCIE
     * z widocznymi: inaczej „Zaznaczono: 12" przypisywałoby opiekuna ludziom,
     * których nie ma na ekranie, a liczba i tak wyglądałaby wiarygodnie.
     */
    const selectedVisible = useMemo(
        () => filtered.filter((i) => selected.has(i.contractorId)).map((i) => i.contractorId),
        [filtered, selected],
    )

    const allVisibleSelected = filtered.length > 0 && filtered.every((i) => selected.has(i.contractorId))

    function toggleOne(contractorId: string) {
        setSelected((prev) => {
            const next = new Set(prev)
            if (next.has(contractorId)) next.delete(contractorId)
            else next.add(contractorId)
            return next
        })
    }

    function toggleAllVisible() {
        setSelected((prev) => {
            const next = new Set(prev)
            if (allVisibleSelected) for (const item of filtered) next.delete(item.contractorId)
            else for (const item of filtered) next.add(item.contractorId)
            return next
        })
    }

    function applyOwner(contractorIds: string[], ownerTcmId: string | null) {
        if (contractorIds.length === 0) {
            toast.error('Nie zaznaczono żadnego konsultanta.')
            return
        }
        startTransition(async () => {
            const result = await assignCareOwner({ contractorIds, ownerTcmId })
            // Deploy skew: stary bundel wołający nową akcję może dostać undefined.
            if (!result?.success) {
                toast.error(result?.error ?? 'Nie udało się przypisać opiekuna.')
                return
            }
            const ownerName = ownerTcmId ? tcmOptions.find((o) => o.id === ownerTcmId)?.fullName ?? null : null
            const ids = new Set(contractorIds)
            setItems((prev) => prev.map((item) => (ids.has(item.contractorId)
                ? { ...item, ownerTcmId, ownerTcmName: ownerName }
                : item)))
            setSelected(new Set())
            toastSuccess(ownerTcmId
                ? `Przypisano opiekuna (${result.data.updated}): ${ownerName ?? '—'}`
                : `Zdjęto opiekuna (${result.data.updated})`)
        })
    }

    return (
        <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-lg font-semibold text-foreground">Opieka Talent Community</h2>
                    <p className="text-sm text-muted-foreground">
                        Konsultanci pracujący u klienta i na benchu. {items.length} osób,{' '}
                        {withoutOwner > 0
                            ? <span className="font-medium text-foreground">bez opiekuna: {withoutOwner}</span>
                            : <span className="font-medium text-foreground">każdy ma opiekuna</span>}.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                    {workload.map((w) => (
                        <Badge key={w.id} variant={w.count === 0 ? 'outline' : 'secondary'} className="font-normal">
                            {w.fullName}: {w.count}
                        </Badge>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Input
                    placeholder="Szukaj (konsultant / klient)…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-64"
                />
                <select aria-label="Opiekun" className={selectClass} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
                    <option value={OWNER_ALL}>Wszyscy opiekunowie</option>
                    <option value={OWNER_NONE}>Bez opiekuna ({withoutOwner})</option>
                    <option value={OWNER_MINE}>Moi konsultanci</option>
                    {tcmOptions.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
                </select>
                <select aria-label="Sytuacja" className={selectClass} value={situationFilter} onChange={(e) => setSituationFilter(e.target.value)}>
                    <option value="">U klienta i bench</option>
                    <option value="u_klienta">U klienta</option>
                    <option value="bench">Bench</option>
                </select>
                <select aria-label="Klient" className={selectClass} value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
                    <option value="">Wszyscy klienci</option>
                    {clients.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <span className="text-sm text-muted-foreground">Widocznych: {filtered.length}</span>
            </div>

            {selectedVisible.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                    <span className="text-sm font-medium">Zaznaczono: {selectedVisible.length}</span>
                    <select
                        aria-label="Opiekun do przypisania"
                        className={selectClass}
                        value={bulkOwner}
                        onChange={(e) => setBulkOwner(e.target.value)}
                    >
                        <option value="">Wybierz opiekuna…</option>
                        {tcmOptions.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
                    </select>
                    <Button
                        size="sm"
                        disabled={pending || !bulkOwner}
                        onClick={() => applyOwner(selectedVisible, bulkOwner)}
                    >
                        {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <UserCheck className="mr-1.5 h-4 w-4" />}
                        Przypisz zaznaczonym
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => applyOwner(selectedVisible, null)}
                    >
                        <UserX className="mr-1.5 h-4 w-4" />
                        Zdejmij opiekuna
                    </Button>
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setSelected(new Set())}>
                        Wyczyść zaznaczenie
                    </Button>
                </div>
            )}

            <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="w-10 p-2">
                                <input
                                    type="checkbox"
                                    aria-label="Zaznacz wszystkich widocznych"
                                    checked={allVisibleSelected}
                                    onChange={toggleAllVisible}
                                    className="h-4 w-4 cursor-pointer accent-primary"
                                />
                            </th>
                            <th className="p-2 text-left">Konsultant</th>
                            <th className="p-2 text-left">Sytuacja</th>
                            <th className="p-2 text-left">Klient</th>
                            <th className="p-2 text-left">Stanowisko</th>
                            <th className="p-2 text-left">Od</th>
                            <th className="p-2 text-left">Opiekun TCM</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((item) => (
                            <tr
                                key={item.contractorId}
                                // Nieprzypisani są tym, po co się tu wchodzi — bez wyróżnienia
                                // trzeba ich wypatrywać w kolumnie selectów.
                                className={item.ownerTcmId ? 'border-t' : 'border-t bg-warning/5'}
                            >
                                <td className="p-2">
                                    <input
                                        type="checkbox"
                                        aria-label={`Zaznacz ${item.fullName}`}
                                        checked={selected.has(item.contractorId)}
                                        onChange={() => toggleOne(item.contractorId)}
                                        className="h-4 w-4 cursor-pointer accent-primary"
                                    />
                                </td>
                                <td className="p-2 font-medium">
                                    <a href={`/internal/kontraktorzy/${item.contractorId}`} className="hover:underline">
                                        {item.fullName}
                                    </a>
                                </td>
                                <td className="p-2">
                                    {item.situation === 'u_klienta'
                                        ? <Badge variant="secondary">u klienta</Badge>
                                        : <Badge variant="outline">bench{item.benchStatus ? ` · ${BENCH_STATUS_PL[item.benchStatus] ?? item.benchStatus}` : ''}</Badge>}
                                </td>
                                <td className="p-2">{item.clientName ?? '—'}</td>
                                <td className="p-2">{item.position ?? '—'}</td>
                                <td className="p-2 whitespace-nowrap">{item.sinceDate ?? '—'}</td>
                                <td className="p-2">
                                    <select
                                        aria-label={`Opiekun dla ${item.fullName}`}
                                        className={`${selectClass} w-full max-w-52`}
                                        value={item.ownerTcmId ?? ''}
                                        disabled={pending}
                                        onChange={(e) => applyOwner([item.contractorId], e.target.value || null)}
                                    >
                                        <option value="">— bez opiekuna —</option>
                                        {tcmOptions.map((o) => <option key={o.id} value={o.id}>{o.fullName}</option>)}
                                    </select>
                                </td>
                            </tr>
                        ))}
                        {filtered.length === 0 && (
                            <tr>
                                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                                    {items.length === 0
                                        ? 'Nikt nie pracuje dziś u klienta ani nie czeka na benchu.'
                                        : 'Żaden konsultant nie pasuje do filtrów.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </section>
    )
}
