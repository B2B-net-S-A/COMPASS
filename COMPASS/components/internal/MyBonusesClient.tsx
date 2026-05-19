'use client'

import { CheckCircle2, XCircle } from 'lucide-react'
import type { BonusStatus, BonusWithUsers } from '@/lib/types/bonus'
import { BONUS_MONTHS_PL } from '@/lib/types/bonus'

interface Props {
    initialBonuses: BonusWithUsers[]
}

function statusBadge(status: BonusStatus) {
    if (status === 'assigned') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-500">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Przypisana
            </span>
        )
    }
    if (status === 'cancelled') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500">
                <XCircle className="h-3.5 w-3.5" />
                Anulowana
            </span>
        )
    }
    if (status === 'paid') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Wypłacona (legacy)
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-500">
            Oczekuje (legacy)
        </span>
    )
}

function formatAmount(amount: number, currency: string): string {
    return `${Number(amount).toFixed(2)} ${currency}`
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('pl-PL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    })
}

function periodLabel(year: number | null, month: number | null): string {
    if (!year || !month) return '—'
    return `${BONUS_MONTHS_PL[month - 1]} ${year}`
}

export function MyBonusesClient({ initialBonuses }: Props) {
    const active = initialBonuses.filter((b) => b.status === 'assigned' || b.status === 'paid' || b.status === 'pending')
    const cancelled = initialBonuses.filter((b) => b.status === 'cancelled')

    return (
        <div className="space-y-6">
            <section>
                <header className="mb-3">
                    <h2 className="text-lg font-bold">Moje premie</h2>
                    <p className="text-sm text-muted-foreground">
                        Premie przypisane Ci przez managera. Są automatycznie zatwierdzone — nie wymagają od Ciebie
                        żadnych działań.
                    </p>
                </header>
                {active.length === 0 ? (
                    <EmptyHint text="Brak aktywnych premii za ostatnie 12 miesięcy." />
                ) : (
                    <div className="space-y-2">
                        {active.map((b) => (
                            <BonusRow key={b.id} bonus={b} />
                        ))}
                    </div>
                )}
            </section>

            {cancelled.length > 0 && (
                <section>
                    <header className="mb-3">
                        <h2 className="text-lg font-bold">Anulowane</h2>
                    </header>
                    <div className="space-y-2">
                        {cancelled.map((b) => (
                            <BonusRow key={b.id} bonus={b} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    )
}

function EmptyHint({ text }: { text: string }) {
    return (
        <div className="rounded-lg border border-dashed border-white/15 bg-white/5 p-6 text-center text-muted-foreground text-sm">
            {text}
        </div>
    )
}

function BonusRow({ bonus }: { bonus: BonusWithUsers }) {
    return (
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white">
                            {formatAmount(Number(bonus.amount), bonus.currency)}
                        </span>
                        {statusBadge(bonus.status)}
                        <span className="text-xs px-2 py-0.5 rounded bg-white/5 text-muted-foreground">
                            {periodLabel(bonus.period_year, bonus.period_month)}
                        </span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{bonus.reason}</div>
                    <div className="mt-1 text-xs text-muted-foreground space-x-3">
                        <span>Przypisana przez: {bonus.proposer_full_name ?? '—'}</span>
                        <span>Otrzymano: {formatDate(bonus.created_at)}</span>
                        {bonus.cancellation_reason && (
                            <span className="text-red-400">Powód anul.: {bonus.cancellation_reason}</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
