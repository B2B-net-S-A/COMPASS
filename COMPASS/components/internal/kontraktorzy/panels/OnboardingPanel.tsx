'use client'

// Phase 34 — Onboarding: contractors needing onboarding (prospect/onboarding) + the intake feed (Wejścia).

import { Badge } from '@/components/ui/badge'
import {
    CONTRACTOR_STATUS_PL, INTERVIEW_STATUS_PL,
    type OnboardingQueueItem, type EntryListItem,
} from '@/lib/types/contractor'
import { ContractorLink } from './shared'

interface Props {
    onboardingQueue: OnboardingQueueItem[]
    entries: EntryListItem[]
}

export function OnboardingPanel({ onboardingQueue, entries }: Props) {
    return (
        <div className="space-y-6">
            <section className="space-y-2">
                <h3 className="text-sm font-semibold">Do onboardingu ({onboardingQueue.length})</h3>
                <p className="text-xs text-muted-foreground">
                    Kontraktorzy w statusie prospekt lub onboarding. Brak wywiadu = do umówienia.
                </p>
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="p-2 text-left">Kontraktor</th>
                                <th className="p-2 text-left">Klient</th>
                                <th className="p-2 text-left">Stanowisko</th>
                                <th className="p-2 text-left">Opiekun</th>
                                <th className="p-2 text-left">Status</th>
                                <th className="p-2 text-left">Wywiad onboardingowy</th>
                            </tr>
                        </thead>
                        <tbody>
                            {onboardingQueue.map((o) => (
                                <tr key={o.contractor_id} className="border-t">
                                    <td className="p-2"><ContractorLink id={o.contractor_id} name={o.full_name} /></td>
                                    <td className="p-2">{o.current_client ?? '—'}</td>
                                    <td className="p-2">{o.current_position ?? '—'}</td>
                                    <td className="p-2">{o.owner_tcm_name ?? '—'}</td>
                                    <td className="p-2"><Badge variant="outline">{CONTRACTOR_STATUS_PL[o.status]}</Badge></td>
                                    <td className="p-2">
                                        {o.interview_status
                                            ? <Badge variant="secondary">{INTERVIEW_STATUS_PL[o.interview_status]}</Badge>
                                            : <span className="text-amber-600">do umówienia</span>}
                                    </td>
                                </tr>
                            ))}
                            {onboardingQueue.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Brak kontraktorów do onboardingu.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="space-y-2">
                <h3 className="text-sm font-semibold">Wejścia ({entries.length})</h3>
                <p className="text-xs text-muted-foreground">Kto wszedł do klienta (placementy Dominika + archiwum 2024).</p>
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
                            {entries.map((e) => (
                                <tr key={`${e.source}-${e.id}`} className="border-t">
                                    <td className="p-2 font-medium">{e.consultant_name}</td>
                                    <td className="p-2">{e.client_name}</td>
                                    <td className="p-2">{e.position ?? '—'}</td>
                                    <td className="p-2">{e.recruiter ?? '—'}</td>
                                    <td className="p-2">{e.start_date ?? '—'}</td>
                                    <td className="p-2"><Badge variant={e.source === 'placement' ? 'default' : 'secondary'}>{e.source === 'placement' ? 'placement' : 'archiwum 2024'}</Badge></td>
                                </tr>
                            ))}
                            {entries.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Brak wejść. Zaimportuj plik (Pulpit → Import).</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    )
}
