'use client'

// Phase 39 — Bench: consultants who left a project (or are leaving soon) and need a new one.
// Hybrid worklist: auto-seeded from recent/upcoming departures + manual entries. Editable Status
// and Benefity per row; default view shows the active list (status "W rekrutacji"), with a toggle
// to reveal resolved rows (przepięty / zakończenie umowy).

import { useMemo, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { BenchDialog } from '../BenchDialog'
import { updateBenchEntry, dismissBenchEntry } from '@/lib/actions/contractors'
import {
    BENCH_STATUS_PL, BENCH_BENEFITS_PL,
    type BenchItem, type BenchStatus, type BenchBenefits,
} from '@/lib/types/contractor'
import { ContractorLink } from './shared'

const cellSelectCls = 'h-8 w-full rounded-md border border-input bg-background px-2 text-xs'

const BENEFITS_BADGE: Record<BenchBenefits, string> = {
    aktywne: 'text-success',
    nieaktywne: 'text-muted-foreground',
    do_wygaszenia: 'text-warning',
}

function BenchRow({ b, onSaved }: { b: BenchItem; onSaved: () => void }) {
    const [status, setStatus] = useState<BenchStatus>(b.status)
    const [benefits, setBenefits] = useState<BenchBenefits>(b.benefits)
    const [busy, setBusy] = useState(false)

    async function changeStatus(next: BenchStatus) {
        const prev = status
        setStatus(next); setBusy(true)
        try {
            await updateBenchEntry(b.id, { status: next })
            onSaved()
        } catch (e) {
            setStatus(prev)
            toast.error(e instanceof Error ? e.message : 'Nie udało się zapisać statusu.')
        } finally { setBusy(false) }
    }

    async function changeBenefits(next: BenchBenefits) {
        const prev = benefits
        setBenefits(next); setBusy(true)
        try {
            await updateBenchEntry(b.id, { benefits: next })
            onSaved()
        } catch (e) {
            setBenefits(prev)
            toast.error(e instanceof Error ? e.message : 'Nie udało się zapisać benefitów.')
        } finally { setBusy(false) }
    }

    async function dismiss() {
        setBusy(true)
        try {
            await dismissBenchEntry(b.id)
            toast.success('Usunięto z benchu.')
            onSaved()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się usunąć.')
        } finally { setBusy(false) }
    }

    return (
        <tr className="border-t align-middle">
            <td className="p-2 font-medium">
                {b.contractor_id ? <ContractorLink id={b.contractor_id} name={b.consultant_name} /> : b.consultant_name}
                {b.source === 'manual' && <Badge variant="secondary" className="ml-2">ręcznie</Badge>}
            </td>
            <td className="p-2">{b.client_name ?? '—'}</td>
            <td className="p-2">{b.role ?? '—'}</td>
            <td className="p-2 whitespace-nowrap">{b.departure_date ?? '—'}</td>
            <td className="p-2 whitespace-nowrap">{b.notice_date ?? '—'}</td>
            <td className="p-2 min-w-[150px]">
                <select className={cellSelectCls} value={status} disabled={busy} onChange={(e) => changeStatus(e.target.value as BenchStatus)}>
                    {Object.entries(BENCH_STATUS_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
            </td>
            <td className="p-2 min-w-[140px]">
                <select className={`${cellSelectCls} ${BENEFITS_BADGE[benefits]}`} value={benefits} disabled={busy} onChange={(e) => changeBenefits(e.target.value as BenchBenefits)}>
                    {Object.entries(BENCH_BENEFITS_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
            </td>
            <td className="p-2 text-right">
                <Button variant="ghost" size="sm" className="h-7 px-2" disabled={busy} onClick={dismiss} title="Usuń z benchu">
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                </Button>
            </td>
        </tr>
    )
}

export function BenchPanel({ bench, onSaved }: { bench: BenchItem[]; onSaved: () => void }) {
    const [showAll, setShowAll] = useState(false)
    const [q, setQ] = useState('')

    const activeCount = useMemo(() => bench.filter((b) => b.status === 'w_rekrutacji').length, [bench])
    const filtered = useMemo(() => bench.filter((b) => {
        if (!showAll && b.status !== 'w_rekrutacji') return false
        if (q && !(`${b.consultant_name} ${b.client_name ?? ''} ${b.role ?? ''}`.toLowerCase().includes(q.toLowerCase()))) return false
        return true
    }), [bench, showAll, q])

    return (
        <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold">Bench ({activeCount} w rekrutacji{showAll ? ` · ${bench.length} łącznie` : ''})</h3>
                    <p className="text-xs text-muted-foreground">
                        Konsultanci po zejściu (lub schodzący wkrótce), którym szukamy projektu. Auto z zejść ostatnich ~90 dni + przyszłych; możesz dodać ręcznie. &bdquo;Przepięty&rdquo; / &bdquo;Zakończenie umowy&rdquo; znika z domyślnego widoku.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Input placeholder="Szukaj (nazwisko / klient / rola)…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
                    <Button variant="outline" size="sm" onClick={() => setShowAll((s) => !s)}>
                        {showAll ? 'Tylko aktywni' : 'Pokaż wszystkich'}
                    </Button>
                    <BenchDialog onSaved={onSaved} />
                </div>
            </div>
            <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="p-2 text-left">Imię i nazwisko</th>
                            <th className="p-2 text-left">Klient</th>
                            <th className="p-2 text-left">Rola</th>
                            <th className="p-2 text-left">Data zejścia</th>
                            <th className="p-2 text-left">Data wypowiedzenia</th>
                            <th className="p-2 text-left">Status</th>
                            <th className="p-2 text-left">Benefity</th>
                            <th className="p-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((b) => <BenchRow key={b.id} b={b} onSaved={onSaved} />)}
                        {filtered.length === 0 && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">{bench.length === 0 ? 'Bench jest pusty.' : 'Brak osób w tym widoku.'}</td></tr>}
                    </tbody>
                </table>
            </div>
        </section>
    )
}
