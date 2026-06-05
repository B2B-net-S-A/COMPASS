'use client'

// Phase 38 — Exit element: the full "Zejścia" table (every recorded departure) + an "Exit Interview"
// table transcribing each departure (Imię i Nazwisko / Klient / Stanowisko) with a per-row exit
// interview file upload. Both tables share one data load.

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ImportDialog } from '../ImportDialog'
import { InterviewFileCell } from '../InterviewFileCell'
import { INTERVIEW_STATUS_PL, WHO_RESIGNED_PL, type ExitDepartureItem } from '@/lib/types/contractor'
import { ContractorLink } from './shared'

interface Props {
    departures: ExitDepartureItem[]
    onSaved: () => void
}

export function ExitPanel({ departures, onSaved }: Props) {
    const [q, setQ] = useState('')

    const filtered = useMemo(() => departures.filter((d) =>
        !q
        || d.consultant_name.toLowerCase().includes(q.toLowerCase())
        || d.client_name.toLowerCase().includes(q.toLowerCase()),
    ), [departures, q])

    return (
        <div className="space-y-6">
            {/* Zejścia — full table */}
            <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Zejścia ({departures.length})</h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input placeholder="Szukaj konsultanta / klienta…" value={q} onChange={(e) => setQ(e.target.value)} className="w-60" />
                        <ImportDialog kind="zejscia" onImported={onSaved} />
                    </div>
                </div>
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
                                <th className="p-2 text-left">Powód</th>
                                <th className="p-2 text-left">Manager</th>
                                <th className="p-2 text-center">Przepięcie</th>
                                <th className="p-2 text-center">Replacement</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((d) => (
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
                                    <td className="p-2 max-w-xs text-muted-foreground">{d.reason ?? '—'}</td>
                                    <td className="p-2">{d.manager_raw ?? '—'}</td>
                                    <td className="p-2 text-center">{d.transferred ? '✓' : '—'}</td>
                                    <td className="p-2 text-center">{d.replacement ? '✓' : '—'}</td>
                                </tr>
                            ))}
                            {filtered.length === 0 && <tr><td colSpan={12} className="p-8 text-center text-muted-foreground">Brak zejść. Zaimportuj plik &bdquo;Zejścia&rdquo;.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Exit Interview — transcribed rows + interview file upload */}
            <section className="space-y-2">
                <h3 className="text-sm font-semibold">Exit Interview ({filtered.length})</h3>
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
                            {filtered.map((d) => (
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
                            {filtered.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Brak wierszy.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    )
}
