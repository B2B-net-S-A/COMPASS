'use client'

// Phase 34 — Kontraktorzy hub: small shared presentational helpers for the journey panels.

import Link from 'next/link'
import { cn } from '@/lib/utils'

export const selectCls = 'flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm'

export function Kpi({
    label,
    value,
    hint,
    accent,
}: {
    label: string
    value: string | number
    hint?: string
    accent?: 'amber' | 'green' | 'red'
}) {
    const accentCls =
        accent === 'amber' ? 'text-amber-600'
        : accent === 'green' ? 'text-emerald-600'
        : accent === 'red' ? 'text-red-600'
        : 'text-foreground'
    return (
        <div className="rounded-lg border bg-card p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className={cn('mt-1 text-2xl font-bold', accentCls)}>{value}</div>
            {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
        </div>
    )
}

export function StatList({ title, rows }: { title: string; rows: Array<{ label: string; value: number }> }) {
    return (
        <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">{title}</h3>
            {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak danych.</p>
            ) : (
                <ul className="space-y-1.5">
                    {rows.map((r, i) => (
                        <li key={i} className="flex items-center justify-between text-sm">
                            <span className="truncate pr-2">{r.label}</span>
                            <span className="font-semibold tabular-nums">{r.value}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

/** Link to a contractor detail page. */
export function ContractorLink({ id, name }: { id: string; name: string }) {
    return (
        <Link href={`/internal/kontraktorzy/${id}`} className="font-medium hover:text-primary hover:underline">
            {name}
        </Link>
    )
}

/** YYYY-MM-DD for "today" (client-side). */
export const todayISO = (): string => new Date().toISOString().slice(0, 10)
