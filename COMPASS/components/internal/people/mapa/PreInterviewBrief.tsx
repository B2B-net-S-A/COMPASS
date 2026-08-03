// Phase 46 — widok „przed rozmową": przydzielony blok (dużą literą), klient
// i obszar oraz „co już wiemy" — wspólna oś czasu kart wywiadów i logu rozmów
// opieki, żeby nie pytać drugi raz o to samo. Komponent prezentacyjny
// (server-safe) — dane liczy getPreInterviewBrief bez side-effectów w renderze.

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
    INTERVIEW_BLOCK_PL,
    INTERVIEW_BLOCKS,
    type PreInterviewBrief as Brief,
} from '@/lib/types/tech-map'

export function PreInterviewBrief({ brief }: { brief: Brief }) {
    const { contractor, plannedBlock, latestCardByBlock, timeline } = brief

    return (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
            {/* Przydzielony blok */}
            <div className="rounded-lg border border-border bg-card p-4 flex flex-col items-center justify-center text-center gap-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Wykonany blok</p>
                <p className="text-6xl font-bold text-primary leading-none">{plannedBlock.block}</p>
                <p className="text-sm font-medium">{INTERVIEW_BLOCK_PL[plannedBlock.block]}</p>
                <p className="text-xs text-muted-foreground">
                    {plannedBlock.basis === 'assigned'
                        ? plannedBlock.source === 'manual'
                            ? 'Przydział ręczny (admin)'
                            : 'Przydział z rotacji kwartalnej'
                        : 'Wyliczony z cyklu — zapisze się przy karcie'}
                </p>
                <div className="mt-2 flex gap-1.5">
                    {INTERVIEW_BLOCKS.map((b) => {
                        const last = latestCardByBlock[b]
                        return (
                            <span
                                key={b}
                                title={last ? `Ostatnio: ${last.interviewDate}` : 'Nigdy nie wykonany'}
                                className={
                                    last
                                        ? 'rounded border border-border px-2 py-0.5 text-xs text-foreground'
                                        : 'rounded border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground opacity-60'
                                }
                            >
                                {b}{last ? ` · ${last.interviewDate.slice(2)}` : ' · brak'}
                            </span>
                        )
                    })}
                </div>
            </div>

            {/* Co już wiemy */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Co już wiemy
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        {brief.daysSinceLastCard === null
                            ? 'Brak wcześniejszych kart'
                            : `Ostatnia karta: ${brief.daysSinceLastCard} dni temu`}
                        {contractor.ownerTcmName && ` · opiekun: ${contractor.ownerTcmName}`}
                    </p>
                </div>
                {timeline.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Żadnych wcześniejszych kart ani rozmów — to pierwszy kontakt w systemie.
                    </p>
                ) : (
                    <ul className="space-y-2">
                        {timeline.map((t) => (
                            <li key={`${t.kind}-${t.id}`} className="flex items-start gap-3 text-sm">
                                <span className="w-20 shrink-0 tabular-nums text-xs text-muted-foreground pt-0.5">
                                    {t.date}
                                </span>
                                <Badge variant={t.kind === 'card' ? 'soft' : 'neutral'} size="sm">
                                    {t.label}
                                </Badge>
                                <span className="min-w-0 flex-1 truncate text-foreground">
                                    {t.kind === 'card' ? (
                                        <Link
                                            href={`/internal/people/mapa/karta/${t.id}`}
                                            className="hover:text-primary hover:underline"
                                        >
                                            {t.summary}
                                        </Link>
                                    ) : (
                                        t.summary
                                    )}
                                </span>
                                {t.status === 'draft' && (
                                    <Badge variant="warning" size="sm">draft</Badge>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
