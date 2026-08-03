'use client'

// Phase 33 — Kontraktor detail: header + edit, conversation log, onboarding/exit interviews, movements.

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { ContractorDialog } from './ContractorDialog'
import { ConversationDialog } from './ConversationDialog'
import { InterviewForm } from './InterviewForm'
import { createOnboardingInterview, createExitInterview } from '@/lib/actions/contractors'
import {
    CONTRACTOR_STATUS_PL, CONVERSATION_CATEGORY_PL, CONVERSATION_STATUS_PL, CONVERSATION_STATUS_BADGE,
    WHO_RESIGNED_PL,
    type ContractorDetail,
} from '@/lib/types/contractor'
import {
    INTERVIEW_CARD_STATUS_BADGE, INTERVIEW_CARD_STATUS_PL,
    type CardListItem,
} from '@/lib/types/tech-map'

export function ContractorDetailClient({ detail, tcmProfiles, techCards = [] }: { detail: ContractorDetail; tcmProfiles: Array<{ id: string; fullName: string }>; techCards?: CardListItem[] }) {
    const router = useRouter()
    const refresh = () => router.refresh()
    const { contractor, conversations, onboardingInterviews, exitInterviews, entries, departures, placements } = detail
    const [creating, setCreating] = useState<'onb' | 'exit' | null>(null)

    async function create(kind: 'onb' | 'exit') {
        setCreating(kind)
        try {
            if (kind === 'onb') await createOnboardingInterview({ contractorId: contractor.id })
            else await createExitInterview({ contractorId: contractor.id })
            toast.success('Utworzono wywiad.')
            refresh()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się.')
        } finally {
            setCreating(null)
        }
    }

    const latestOnb = onboardingInterviews[0]
    const latestExit = exitInterviews[0]

    return (
        <div className="space-y-6">
            <Link href="/internal/kontraktorzy" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
                <ArrowLeft className="h-4 w-4" /> Kontraktorzy
            </Link>

            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-bold">{contractor.full_name}</h1>
                        <Badge variant="outline">{CONTRACTOR_STATUS_PL[contractor.status]}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                        {[contractor.current_position, contractor.current_client].filter(Boolean).join(' · ') || 'Brak danych o projekcie'}
                        {contractor.phone && ` · ☎ ${contractor.phone}`}
                        {detail.ownerTcmName && ` · opiekun: ${detail.ownerTcmName}`}
                    </p>
                </div>
                <ContractorDialog tcmProfiles={tcmProfiles} existing={contractor} onSaved={refresh} triggerLabel="Edytuj dane" triggerVariant="outline" />
            </header>

            {/* Conversations */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Log rozmów ({conversations.length})</h2>
                    <ConversationDialog contractors={[]} tcmProfiles={tcmProfiles} presetContractorId={contractor.id} onSaved={refresh} />
                </div>
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="p-2 text-left">Data</th><th className="p-2 text-left">TCM</th>
                                <th className="p-2 text-left">Sprawa</th><th className="p-2 text-left">Status</th>
                                <th className="p-2 text-left">Notatka</th><th className="p-2"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {conversations.map((c) => (
                                <tr key={c.id} className="border-t align-top">
                                    <td className="p-2 whitespace-nowrap">{c.conversation_date}</td>
                                    <td className="p-2">{c.tcm_name ?? '—'}</td>
                                    <td className="p-2">{CONVERSATION_CATEGORY_PL[c.category]}</td>
                                    <td className="p-2"><span className={cn('inline-block rounded border px-2 py-0.5 text-xs', CONVERSATION_STATUS_BADGE[c.status])}>{CONVERSATION_STATUS_PL[c.status]}</span></td>
                                    <td className="p-2 max-w-md text-muted-foreground">{c.note ?? '—'}</td>
                                    <td className="p-2 text-right"><ConversationDialog contractors={[]} tcmProfiles={tcmProfiles} presetContractorId={contractor.id} existing={c} onSaved={refresh} triggerLabel="Edytuj" triggerVariant="ghost" /></td>
                                </tr>
                            ))}
                            {conversations.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Brak rozmów.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Phase 46 — karty wywiadów mapy technologicznej */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Karty wywiadów — mapa technologiczna ({techCards.length})</h2>
                    <Button asChild size="sm" variant="secondary">
                        <Link href={`/internal/people/mapa/wywiad/${contractor.id}`}>Nowa rozmowa</Link>
                    </Button>
                </div>
                {techCards.length === 0 ? (
                    <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                        Brak kart wywiadów. Kliknij „Nowa rozmowa”.
                    </p>
                ) : (
                    <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                                <tr>
                                    <th className="p-2 text-left">Data</th><th className="p-2 text-left">Blok</th>
                                    <th className="p-2 text-left">Klient</th><th className="p-2 text-left">Status</th>
                                    <th className="p-2 text-left">Prowadzący</th>
                                </tr>
                            </thead>
                            <tbody>
                                {techCards.map((c) => (
                                    <tr key={c.id} className="border-t">
                                        <td className="p-2 whitespace-nowrap">
                                            <Link href={`/internal/people/mapa/karta/${c.id}`} className="text-primary hover:underline">
                                                {c.interviewDate}
                                            </Link>
                                        </td>
                                        <td className="p-2 font-semibold">{c.block}</td>
                                        <td className="p-2">{c.clientName}{c.areaName ? ` · ${c.areaName}` : ''}</td>
                                        <td className="p-2">
                                            {c.isDraft ? (
                                                <Badge variant="warning" size="sm">Wersja robocza</Badge>
                                            ) : c.status ? (
                                                <span className={cn('inline-block rounded border px-2 py-0.5 text-xs', INTERVIEW_CARD_STATUS_BADGE[c.status])}>
                                                    {INTERVIEW_CARD_STATUS_PL[c.status]}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td className="p-2 text-muted-foreground">{c.tcmName ?? '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Onboarding interview */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Onboarding Interview</h2>
                    <Button size="sm" variant="secondary" className="gap-2" disabled={creating === 'onb'} onClick={() => create('onb')}>
                        {creating === 'onb' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Nowy
                    </Button>
                </div>
                {latestOnb ? <InterviewForm kind="onboarding" interview={latestOnb} onSaved={refresh} />
                    : <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Brak wywiadu onboardingowego. Kliknij „Nowy”.</p>}
                {onboardingInterviews.length > 1 && <p className="text-xs text-muted-foreground">Wcześniejsze wywiady: {onboardingInterviews.length - 1} (pokazano najnowszy).</p>}
            </section>

            {/* Exit interview */}
            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Exit Interview</h2>
                    <Button size="sm" variant="secondary" className="gap-2" disabled={creating === 'exit'} onClick={() => create('exit')}>
                        {creating === 'exit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Nowy
                    </Button>
                </div>
                {latestExit ? <InterviewForm kind="exit" interview={latestExit} onSaved={refresh} />
                    : <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Brak wywiadu exit. Kliknij „Nowy”.</p>}
                {exitInterviews.length > 1 && <p className="text-xs text-muted-foreground">Wcześniejsze wywiady: {exitInterviews.length - 1} (pokazano najnowszy).</p>}
            </section>

            {/* Movements */}
            {(entries.length > 0 || placements.length > 0 || departures.length > 0) && (
                <section className="space-y-3">
                    <h2 className="text-lg font-semibold">Wejścia i zejścia</h2>
                    {(entries.length > 0 || placements.length > 0) && (
                        <div className="rounded-md border p-3 text-sm">
                            <div className="mb-1 font-medium">Wejścia</div>
                            <ul className="space-y-1">
                                {placements.map((p) => <li key={p.id}>📋 {p.client_name} {p.position ? `· ${p.position}` : ''} · start {p.start_date} <Badge variant="default" className="ml-1">placement</Badge></li>)}
                                {entries.map((e) => <li key={e.id}>📁 {e.client_name} {e.position ? `· ${e.position}` : ''} · start {e.start_date ?? '—'} <Badge variant="secondary" className="ml-1">archiwum</Badge></li>)}
                            </ul>
                        </div>
                    )}
                    {departures.length > 0 && (
                        <div className="rounded-md border p-3 text-sm">
                            <div className="mb-1 font-medium">Zejścia</div>
                            <ul className="space-y-1">
                                {departures.map((d) => (
                                    <li key={d.id}>
                                        🔻 {d.client_name} · zejście {d.departure_date ?? '—'} · {d.who_resigned ? WHO_RESIGNED_PL[d.who_resigned] : '—'}
                                        {d.transferred && ' · przepięcie ✓'}{d.replacement && ' · replacement ✓'}
                                        {d.reason && <span className="text-muted-foreground"> — {d.reason}</span>}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>
            )}

            {contractor.notes && (
                <section><h2 className="text-lg font-semibold">Notatki</h2><p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{contractor.notes}</p></section>
            )}
        </div>
    )
}
