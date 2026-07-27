'use client'

// Phase 38/39 — Exit element. Tables in order: Bench → Exit Interview → Zejścia.
//  • Bench: consultants between projects (own panel).
//  • Exit Interview: transcribed from departures + per-row exit-interview file upload.
//  • Zejścia: full departures table; defaults to the current + next month, with a toggle to the full view.

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ImportDialog } from '../ImportDialog'
import { InterviewFileCell } from '../InterviewFileCell'
import { BenchPanel } from './BenchPanel'
import { INTERVIEW_STATUS_PL, WHO_RESIGNED_PL, type BenchItem, type ExitDepartureItem } from '@/lib/types/contractor'
import { ContractorLink } from './shared'

interface Props {
    bench: BenchItem[]
    departures: ExitDepartureItem[]
    onSaved: () => void
}

/** First day of the current month and first day of the month-after-next, as ISO yyyy-mm-dd. */
function currentPlusNextMonthWindow(): { start: string; end: string } {
    const now = new Date()
    const iso = (y: number, m: number) => `${y}-${String(m + 1).padStart(2, '0')}-01`
    const startY = now.getFullYear()
    const startM = now.getMonth()
    const endDate = new Date(startY, startM + 2, 1)
    return { start: iso(startY, startM), end: iso(endDate.getFullYear(), endDate.getMonth()) }
}

export function ExitPanel({ bench, departures, onSaved }: Props) {
    const [q, setQ] = useState('')
    const [showFullZejscia, setShowFullZejscia] = useState(false)

    const bySearch = useMemo(() => departures.filter((d) =>
        !q
        || d.consultant_name.toLowerCase().includes(q.toLowerCase())
        || d.client_name.toLowerCase().includes(q.toLowerCase()),
    ), [departures, q])

    const monthWindow = useMemo(() => currentPlusNextMonthWindow(), [])
    const zejscia = useMemo(() => bySearch.filter((d) => {
        if (showFullZejscia) return true
        return d.departure_date != null && d.departure_date >= monthWindow.start && d.departure_date < monthWindow.end
    }), [bySearch, showFullZejscia, monthWindow])

    return (
        <div className="space-y-6">
            {/* 1 — Bench */}
            <BenchPanel bench={bench} onSaved={onSaved} />

            {/* 2 — Exit Interview (transcribed rows + interview file upload) */}
            <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Exit Interview ({bySearch.length})</h3>
                    <Input placeholder="Szukaj konsultanta / klienta…" value={q} onChange={(e) => setQ(e.target.value)} className="w-60" />
                </div>
                <p className="text-xs text-muted-foreground">
                    Dane przepisane z Zejść. Wgraj plik &bdquo;Exit Interview&rdquo; przy danej osobie — jeśli kontraktor nie istnieje jeszcze w bazie, zostanie utworzony i powiązany.
                </p>
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="p-2 text-left">Imię i nazwisko</th>
                                <th className="p-2 text-left">Klient</th>
                                <th className="p-2 text-left">Stanowisko</th>
                                <th className="p-2 text-left">Status wywiadu</th>
                                <th className="p-2 text-left">Exit Interview</th>
                            </tr>
                        </thead>
                        <tbody>
                            {bySearch.map((d) => (
                                <tr key={`exit-${d.id}`} className="border-t align-top">
                                    <td className="p-2 font-medium">
                                        {d.contractor_id ? <ContractorLink id={d.contractor_id} name={d.consultant_name} /> : d.consultant_name}
                                    </td>
                                    <td className="p-2">{d.client_name}</td>
                                    <td className="p-2">{d.position ?? '—'}</td>
                                    <td className="p-2">
                                        {d.interview_status
                                            ? <Badge variant="secondary">{INTERVIEW_STATUS_PL[d.interview_status]}</Badge>
                                            : <span className="text-xs text-muted-foreground">brak</span>}
                                    </td>
                                    <td className="p-2">
                                        <InterviewFileCell
                                            kind="exit"
                                            contractorId={d.contractor_id}
                                            attachments={d.attachments}
                                            entry={{ consultantName: d.consultant_name, client: d.client_name, position: d.position, source: 'departure', entryId: d.id }}
                                            onChanged={onSaved}
                                        />
                                    </td>
                                </tr>
                            ))}
                            {bySearch.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Brak wierszy.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* 3 — Zejścia (full table; default = current + next month) */}
            <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">
                        Zejścia ({zejscia.length}{showFullZejscia ? '' : ` z ${bySearch.length}`})
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setShowFullZejscia((s) => !s)}>
                            {showFullZejscia ? 'Pokaż skróconą' : 'Pokaż pełną'}
                        </Button>
                        <ImportDialog kind="zejscia" onImported={onSaved} />
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">
                    {showFullZejscia ? 'Wszystkie zejścia.' : 'Domyślnie tylko zejścia w bieżącym i następnym miesiącu — kliknij „Pokaż pełną", aby zobaczyć wszystkie.'}
                </p>
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="p-2 text-left">Imię i nazwisko</th>
                                <th className="p-2 text-left">Klient</th>
                                <th className="p-2 text-left">Rekruter</th>
                                <th className="p-2 text-left">Stanowisko</th>
                                <th className="p-2 text-left">Start</th>
                                <th className="p-2 text-left">Data zejścia</th>
                                <th className="p-2 text-left">Wypowiedzenie</th>
                                <th className="p-2 text-left">Kto zrezygnował</th>
                                <th className="p-2 text-left">Powód / komentarz</th>
                                <th className="p-2 text-left">Manager</th>
                                <th className="p-2 text-center">Przepięcie</th>
                                <th className="p-2 text-center">Replacement</th>
                            </tr>
                        </thead>
                        <tbody>
                            {zejscia.map((d) => (
                                <tr key={d.id} className="border-t align-top">
                                    <td className="p-2 font-medium">
                                        {d.contractor_id ? <ContractorLink id={d.contractor_id} name={d.consultant_name} /> : d.consultant_name}
                                    </td>
                                    <td className="p-2">{d.client_name}</td>
                                    <td className="p-2">{d.recruiter_raw ?? '—'}</td>
                                    <td className="p-2">{d.position ?? '—'}</td>
                                    <td className="p-2 whitespace-nowrap">{d.start_date ?? '—'}</td>
                                    <td className="p-2 whitespace-nowrap">{d.departure_date ?? '—'}</td>
                                    <td className="p-2 whitespace-nowrap">{d.last_notice_day ?? '—'}</td>
                                    <td className="p-2">{d.who_resigned ? WHO_RESIGNED_PL[d.who_resigned] : '—'}</td>
                                    {/* Import Excela wpisuje treść do „Komentarz" — „Powód" jest w praktyce pusty,
                                        więc pokazujemy komentarz jako fallback (pełna treść w tooltipie). */}
                                    <td className="p-2 max-w-xs text-muted-foreground" title={d.reason ?? d.comment ?? undefined}>
                                        {d.reason ?? d.comment ?? '—'}
                                    </td>
                                    <td className="p-2">{d.manager_raw ?? '—'}</td>
                                    <td className="p-2 text-center">{d.transferred ? '✓' : '—'}</td>
                                    <td className="p-2 text-center">{d.replacement ? '✓' : '—'}</td>
                                </tr>
                            ))}
                            {zejscia.length === 0 && <tr><td colSpan={12} className="p-8 text-center text-muted-foreground">{showFullZejscia ? 'Brak zejść. Zaimportuj plik „Zejścia".' : 'Brak zejść w bieżącym i następnym miesiącu.'}</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    )
}
