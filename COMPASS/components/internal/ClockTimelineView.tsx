'use client'

// Phase 17b R12 — Daily timeline view client component.
// Fetches clustered blocks from /api/clock/timeline/[date] and renders a
// horizontal timeline. MVP: read-only view with friendly labels. Future:
// drag-to-edit + convert block to timesheet entry (TODO).

import { useEffect, useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TimelineBlock {
    start: string
    end: string
    activeSeconds: number
    primaryRoute: string | null
    label: string
}

interface Props {
    date: string // YYYY-MM-DD
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('pl-PL', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Europe/Warsaw',
    })
}

function formatDurationShort(seconds: number): string {
    const m = Math.round(seconds / 60)
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    const rem = m % 60
    return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}

function colorForRoute(route: string | null): string {
    if (!route) return 'rgb(100 116 139)' // slate
    // Stable hash → hue
    let h = 0
    for (let i = 0; i < route.length; i++) h = (h * 31 + route.charCodeAt(i)) | 0
    const hue = Math.abs(h) % 360
    return `hsl(${hue}, 60%, 55%)`
}

export function ClockTimelineView({ date }: Props) {
    const [blocks, setBlocks] = useState<TimelineBlock[] | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let cancelled = false
        setBlocks(null)
        setError(null)
        fetch(`/api/clock/timeline/${date}`, { credentials: 'same-origin' })
            .then(async (r) => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`)
                const data = (await r.json()) as { blocks: TimelineBlock[] }
                if (!cancelled) setBlocks(data.blocks)
            })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : 'unknown')
            })
        return () => {
            cancelled = true
        }
    }, [date])

    if (error) {
        return (
            <Card>
                <CardContent className="py-6 text-sm text-destructive">
                    Błąd pobierania timeline: {error}
                </CardContent>
            </Card>
        )
    }
    if (blocks === null) {
        return (
            <Card>
                <CardContent className="py-6 text-sm text-muted-foreground inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ładowanie timeline...
                </CardContent>
            </Card>
        )
    }
    if (blocks.length === 0) {
        return (
            <Card>
                <CardContent className="py-6 text-sm text-muted-foreground italic">
                    Brak danych timeline dla {date}. Włącz tracking trasy w consent dialog
                    przy następnej sesji aby zobaczyć blokowy podział aktywności.
                </CardContent>
            </Card>
        )
    }

    // Compute total + min/max for scale
    const minMs = new Date(blocks[0].start).getTime()
    const maxMs = new Date(blocks[blocks.length - 1].end).getTime()
    const spanMs = Math.max(1, maxMs - minMs)
    const totalSeconds = blocks.reduce((s, b) => s + b.activeSeconds, 0)

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-info" />
                    Timeline aktywności — {date}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                    Łącznie {formatDurationShort(totalSeconds)} w {blocks.length}{' '}
                    {blocks.length === 1 ? 'bloku' : 'blokach'} ·{' '}
                    {formatTime(blocks[0].start)}-{formatTime(blocks[blocks.length - 1].end)}
                </p>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Horizontal bar */}
                <div className="relative h-10 bg-muted/60 rounded overflow-hidden border border-border">
                    {blocks.map((b, i) => {
                        const startMs = new Date(b.start).getTime()
                        const endMs = new Date(b.end).getTime()
                        const left = ((startMs - minMs) / spanMs) * 100
                        const width = ((endMs - startMs) / spanMs) * 100
                        return (
                            <div
                                key={i}
                                className="absolute top-0 bottom-0 hover:opacity-80 transition-opacity"
                                style={{
                                    left: `${left}%`,
                                    width: `${Math.max(width, 0.5)}%`,
                                    backgroundColor: colorForRoute(b.primaryRoute),
                                    opacity: 0.85,
                                }}
                                title={`${b.label} (${formatTime(b.start)}-${formatTime(b.end)}, ${formatDurationShort(b.activeSeconds)})`}
                            />
                        )
                    })}
                </div>

                {/* Legend / blocks list */}
                <ul className="space-y-1 text-xs">
                    {blocks.map((b, i) => (
                        <li
                            key={i}
                            className="flex items-center gap-2 py-1 border-b border-border/30 last:border-0"
                        >
                            <span
                                className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                                style={{ backgroundColor: colorForRoute(b.primaryRoute) }}
                            />
                            <span className="font-mono text-muted-foreground tabular-nums whitespace-nowrap">
                                {formatTime(b.start)}-{formatTime(b.end)}
                            </span>
                            <span className="flex-1 truncate">{b.label}</span>
                            <span className="text-muted-foreground whitespace-nowrap">
                                {formatDurationShort(b.activeSeconds)}
                            </span>
                        </li>
                    ))}
                </ul>
                <p className="text-[10px] text-muted-foreground italic">
                    Te dane są prywatne — admin nie widzi szczegółów timeline, tylko sumę
                    godzin w timesheet. Retencja 30 dni.
                </p>
            </CardContent>
        </Card>
    )
}
