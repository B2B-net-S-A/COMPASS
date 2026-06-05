'use client'

// Phase 38 — Onboarding element: the read-only "Wejścia" intake feed + an actionable "Onboarding"
// table that transcribes each entry (Imię i Nazwisko / Klient / Stanowisko / Rekruter / Start) and
// adds a per-row "Onboarding interview" file upload. Both tables share one data load.

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ImportDialog } from '../ImportDialog'
import { InterviewFileCell } from '../InterviewFileCell'
import { INTERVIEW_STATUS_PL, type OnboardingEntryItem } from '@/lib/types/contractor'
import { ContractorLink } from './shared'

interface Props {
    entries: OnboardingEntryItem[]
    onSaved: () => void
}

export function OnboardingEntriesPanel({ entries, onSaved }: Props) {
    const [q, setQ] = useState('')

    const filtered = useMemo(() => entries.filter((e) =>
        !q
        || e.consultant_name.toLowerCase().includes(q.toLowerCase())
        || e.client_name.toLowerCase().includes(q.toLowerCase()),
    ), [entries, q])

    return (
        <div className="space-y-6">
            {/* Wejścia — read-only intake feed */}
            <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Wejścia ({entries.length})</h3>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input placeholder="Szukaj konsultanta / klienta…" value={q} onChange={(e) => setQ(e.target.value)} className="w-60" />
                        <ImportDialog kind="wejscia" onImported={onSaved} />
                    </div>
                </div>
                <p className="text-xs text-muted-foreground">
                    Kto wszedł do klienta (placementy + archiwum 2024). Placementy i premie zarządzasz w module Placementy — tu widok wlotowy.
                </p>
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="p-2 text-left">Konsultant</th>
                                <th className="p-2 text-left">Klient</th>
                                <th className="p-2 text-left">Stanowisko</th>
                                <th className="p-2 text-left">Rekruter</th>
                                <th className="p-2 text-left">Start</th>
                                <th className="p-2 text-left">Źródło</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((e) => (
                                <tr key={`${e.source}-${e.entry_id}`} className="border-t">
                                    <td className="p-2 font-medium">{e.consultant_name}</td>
                                    <td className="p-2">{e.client_name}</td>
                                    <td className="p-2">{e.position ?? '—'}</td>
                                    <td className="p-2">{e.recruiter ?? '—'}</td>
                                    <td className="p-2">{e.start_date ?? '—'}</td>
                                    <td className="p-2"><Badge variant={e.source === 'placement' ? 'default' : 'secondary'}>{e.source === 'placement' ? 'placement' : 'archiwum 2024'}</Badge></td>
                                </tr>
                            ))}
                            {filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Brak wejść. Zaimportuj plik &bdquo;Wejścia&rdquo;.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Onboarding — transcribed rows + interview file upload */}
            <section className="space-y-2">
                <h3 className="text-sm font-semibold">Onboarding ({filtered.length})</h3>
                <p className="text-xs text-muted-foreground">
                    Dane przepisane z Wejść. Wgraj plik &bdquo;Onboarding interview&rdquo; przy danej osobie — jeśli kontraktor nie istnieje jeszcze w bazie, zostanie utworzony i powiązany.
                </p>
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="p-2 text-left">Imię i nazwisko</th>
                                <th className="p-2 text-left">Klient</th>
                                <th className="p-2 text-left">Stanowisko</th>
                                <th className="p-2 text-left">Rekruter</th>
                                <th className="p-2 text-left">Start</th>
                                <th className="p-2 text-left">Status wywiadu</th>
                                <th className="p-2 text-left">Onboarding interview</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((e) => (
                                <tr key={`onb-${e.source}-${e.entry_id}`} className="border-t align-top">
                                    <td className="p-2 font-medium">
                                        {e.contractor_id
                                            ? <ContractorLink id={e.contractor_id} name={e.consultant_name} />
                                            : e.consultant_name}
                                    </td>
                                    <td className="p-2">{e.client_name}</td>
                                    <td className="p-2">{e.position ?? '—'}</td>
                                    <td className="p-2">{e.recruiter ?? '—'}</td>
                                    <td className="p-2">{e.start_date ?? '—'}</td>
                                    <td className="p-2">
                                        {e.interview_status
                                            ? <Badge variant="secondary">{INTERVIEW_STATUS_PL[e.interview_status]}</Badge>
                                            : <span className="text-xs text-muted-foreground">brak</span>}
                                    </td>
                                    <td className="p-2">
                                        <InterviewFileCell
                                            kind="onboarding"
                                            contractorId={e.contractor_id}
                                            attachments={e.attachments}
                                            entry={{ consultantName: e.consultant_name, client: e.client_name, position: e.position, source: e.source, entryId: e.entry_id }}
                                            onChanged={onSaved}
                                        />
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Brak wierszy.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    )
}
