// Phase 46 — widok „przed rozmową": „co już wiemy" — wspólna oś czasu kart
// wywiadów i logu rozmów opieki, żeby nie pytać drugi raz o to samo.
// Komponent prezentacyjny (server-safe) — dane liczy getPreInterviewBrief
// bez side-effectów w renderze. Phase 46d: bez rotacji/bloków (karta jest jedna).

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import type { PreInterviewBrief as Brief } from '@/lib/types/tech-map'

export function PreInterviewBrief({ brief }: { brief: Brief }) {
    const { contractor, timeline } = brief

    return (
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
                            {t.status === 'draft' && <Badge variant="warning" size="sm">draft</Badge>}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
