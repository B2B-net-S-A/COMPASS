'use client'

// Phase 48 — „Historia sprawdzeń": log przebiegów pipeline'u.
//
// Uwagi przebiegu bywają bardzo długie (pełna relacja z tego, co się nie udało),
// więc domyślnie są zwinięte — inaczej jedna pozycja zajmuje pół ekranu.

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { History, ChevronDown, ChevronRight } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import {
    LEGAL_RUN_SOURCE_HEALTH_LABELS_PL,
    LEGAL_SOURCE_SHORT_PL,
    type LegalMonitorRunRow,
    type LegalMonitorRunStatus,
    type LegalMonitorSource,
    type LegalMonitorSourceHealth,
} from '@/lib/types/legal-monitor'

const RUN_STATUS_META: Record<LegalMonitorRunStatus, { label: string; className: string }> = {
    ok: { label: 'OK', className: 'bg-success/15 text-success border-success/30' },
    partial: {
        label: 'Częściowo',
        className: 'bg-warning/15 text-warning border-warning/30',
    },
    failed: {
        label: 'Niepowodzenie',
        className: 'bg-destructive/15 text-destructive border-destructive/30',
    },
}

const SOURCE_HEALTH_CLASS: Record<LegalMonitorSourceHealth, string> = {
    ok: 'text-success',
    empty: 'text-muted-foreground',
    fail: 'text-destructive font-medium',
}

const INITIAL_VISIBLE = 7

export function LegalMonitorRunsHistory({ runs }: { runs: LegalMonitorRunRow[] }) {
    const [expanded, setExpanded] = useState<string | null>(null)
    const [showAll, setShowAll] = useState(false)

    if (runs.length === 0) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <History className="h-4 w-4" />
                        Historia sprawdzeń
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-sm text-muted-foreground">
                        Brak zapisanych przebiegów monitoringu.
                    </p>
                </CardContent>
            </Card>
        )
    }

    const visible = showAll ? runs : runs.slice(0, INITIAL_VISIBLE)

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Historia sprawdzeń
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                    Każdy przebieg monitoringu, także pusty — brak wpisu w dzień roboczy oznacza, że
                    monitoring nie zadziałał.
                </p>
            </CardHeader>
            <CardContent className="space-y-2">
                <ul className="divide-y divide-border/40 rounded-md border border-border/40">
                    {visible.map((run) => {
                        const meta = RUN_STATUS_META[run.status]
                        const isOpen = expanded === run.id
                        const sources = Object.entries(run.sources_checked ?? {}) as Array<
                            [LegalMonitorSource, LegalMonitorSourceHealth]
                        >
                        return (
                            <li key={run.id} className="px-3 py-2.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium">
                                        {format(parseISO(run.run_at), "d LLL yyyy, HH:mm", {
                                            locale: pl,
                                        })}
                                    </span>
                                    <Badge variant="outline" className={meta.className}>
                                        {meta.label}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                        {run.items_found === 0
                                            ? 'bez nowych wpisów'
                                            : `nowych wpisów: ${run.items_found}`}
                                    </span>
                                    {run.window_from && (
                                        <span className="text-xs text-muted-foreground">
                                            nowości od{' '}
                                            {format(parseISO(run.window_from), 'd LLL yyyy', {
                                                locale: pl,
                                            })}
                                        </span>
                                    )}
                                </div>

                                {sources.length > 0 && (
                                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px]">
                                        {sources.map(([source, health]) => (
                                            <span
                                                key={source}
                                                className={cn(SOURCE_HEALTH_CLASS[health])}
                                            >
                                                {LEGAL_SOURCE_SHORT_PL[source] ?? source}:{' '}
                                                {LEGAL_RUN_SOURCE_HEALTH_LABELS_PL[health] ?? health}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {run.notes && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => setExpanded(isOpen ? null : run.id)}
                                            aria-expanded={isOpen}
                                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                                        >
                                            {isOpen ? (
                                                <ChevronDown className="h-3 w-3" />
                                            ) : (
                                                <ChevronRight className="h-3 w-3" />
                                            )}
                                            {isOpen ? 'Ukryj uwagi' : 'Pokaż uwagi przebiegu'}
                                        </button>
                                        {isOpen && (
                                            <p className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
                                                {run.notes}
                                            </p>
                                        )}
                                    </>
                                )}
                            </li>
                        )
                    })}
                </ul>

                {runs.length > INITIAL_VISIBLE && (
                    <Button variant="ghost" size="sm" onClick={() => setShowAll(!showAll)}>
                        {showAll
                            ? 'Pokaż mniej'
                            : `Pokaż wszystkie przebiegi (${runs.length})`}
                    </Button>
                )}
            </CardContent>
        </Card>
    )
}
