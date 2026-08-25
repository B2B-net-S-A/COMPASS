'use client'

import { useState } from 'react'
import { CheckCircle2, XCircle, Paperclip, Loader2 } from 'lucide-react'
import type {
    BonusCategory,
    BonusStatus,
    BonusWithUsers,
    ChampionsLeagueRank,
} from '@/lib/types/bonus'
import {
    BONUS_MONTHS_PL,
    BONUS_CATEGORIES_PL,
    BONUS_QUARTERS_PL,
    CHAMPIONS_LEAGUE_PLACE_LABELS_PL,
} from '@/lib/types/bonus'
import { getBonusAttachmentSignedUrl } from '@/lib/actions/internal-bonus'
import { toast } from '@/lib/toast'

interface Props {
    initialBonuses: BonusWithUsers[]
}

function statusBadge(status: BonusStatus) {
    if (status === 'assigned') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Przypisana
            </span>
        )
    }
    if (status === 'cancelled') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
                <XCircle className="h-3.5 w-3.5" />
                Anulowana
            </span>
        )
    }
    if (status === 'paid') {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-info">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Wypłacona (legacy)
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
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

/** Phase 31 — period dla CL: Q1 2026 zamiast styczeń 2026. */
function periodLabelForBonus(b: BonusWithUsers): string {
    if (b.category === 'champions_league' && b.period_year && b.period_quarter) {
        return `${BONUS_QUARTERS_PL[b.period_quarter - 1]} ${b.period_year}`
    }
    return periodLabel(b.period_year, b.period_month)
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
        <div className="rounded-lg border border-dashed border-border bg-muted p-6 text-center text-muted-foreground text-sm">
            {text}
        </div>
    )
}

function categoryBadge(category: BonusCategory) {
    const label = BONUS_CATEGORIES_PL[category]
    const className =
        category === 'sales'
            ? 'bg-info/15 text-info border-info/30'
            : category === 'delivery_lead'
              ? 'bg-primary/15 text-primary border-primary/30'
              : category === 'recruiter'
                ? 'bg-warning/15 text-warning border-warning/30'
                : category === 'champions_league'
                  ? 'bg-warning/15 text-warning border-warning/40'
                  : 'bg-muted text-muted-foreground border-border'
    return (
        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${className}`}>
            {category === 'champions_league' ? '🏆 ' : ''}{label}
        </span>
    )
}

function BonusCategoryDetails({ bonus }: { bonus: BonusWithUsers }) {
    switch (bonus.category) {
        case 'sales':
            return (
                <div className="text-xs text-muted-foreground space-y-0.5">
                    {bonus.client_name && <div>Klient: {bonus.client_name}</div>}
                    {bonus.sales_service_description && (
                        <div>Usługa: {bonus.sales_service_description}</div>
                    )}
                </div>
            )
        case 'delivery_lead':
            return (
                <div className="text-xs text-muted-foreground space-y-0.5">
                    {bonus.client_name && <div>Klient: {bonus.client_name}</div>}
                    {bonus.delivery_candidate_name && (
                        <div>Kandydat: {bonus.delivery_candidate_name}</div>
                    )}
                    {bonus.delivery_margin_amount != null && (
                        <div>
                            Marża: {Number(bonus.delivery_margin_amount).toFixed(2)} PLN
                            {bonus.delivery_margin_percent != null && (
                                <> · {Number(bonus.delivery_margin_percent).toFixed(2)}%</>
                            )}
                        </div>
                    )}
                </div>
            )
        case 'recruiter':
            return (
                <div className="text-xs text-muted-foreground space-y-0.5">
                    {bonus.client_name && <div>Klient: {bonus.client_name}</div>}
                    {bonus.recruiter_candidate_name && (
                        <div>Kandydat: {bonus.recruiter_candidate_name}</div>
                    )}
                    {bonus.recruiter_margin_per_hour != null && (
                        <div>
                            Marża: {Number(bonus.recruiter_margin_per_hour).toFixed(2)} PLN/h
                            {bonus.recruiter_calculated_tier && (
                                <> · próg {bonus.recruiter_calculated_tier}</>
                            )}
                        </div>
                    )}
                </div>
            )
        case 'custom':
            return bonus.custom_email_memo ? (
                <div className="text-xs text-muted-foreground italic whitespace-pre-wrap">
                    {bonus.custom_email_memo}
                </div>
            ) : null
        case 'champions_league':
            return bonus.place_rank ? (
                <div className="text-xs">
                    <span className="text-warning font-medium">
                        {CHAMPIONS_LEAGUE_PLACE_LABELS_PL[bonus.place_rank as ChampionsLeagueRank]} w Champions League
                    </span>
                </div>
            ) : null
    }
}

function AttachmentLink({ bonus }: { bonus: BonusWithUsers }) {
    const [loading, setLoading] = useState(false)
    if (!bonus.attachment_path) return null
    async function openAttachment() {
        setLoading(true)
        try {
            const res = await getBonusAttachmentSignedUrl(bonus.id)
            if (!res.success) {
                toast.error(res.error)
                return
            }
            window.open(res.data, '_blank', 'noopener,noreferrer')
        } finally {
            setLoading(false)
        }
    }
    return (
        <button
            type="button"
            onClick={openAttachment}
            disabled={loading}
            className="inline-flex items-center gap-1 text-xs text-info hover:text-info/80"
        >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />}
            {bonus.attachment_filename ?? 'Załącznik'}
        </button>
    )
}

function BonusRow({ bonus }: { bonus: BonusWithUsers }) {
    return (
        <div className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">
                            {formatAmount(Number(bonus.amount), bonus.currency)}
                        </span>
                        {statusBadge(bonus.status)}
                        {categoryBadge(bonus.category)}
                        <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                            {periodLabelForBonus(bonus)}
                        </span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{bonus.reason}</div>
                    <div className="mt-1.5">
                        <BonusCategoryDetails bonus={bonus} />
                    </div>
                    {bonus.attachment_path && (
                        <div className="mt-2">
                            <AttachmentLink bonus={bonus} />
                        </div>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground space-x-3">
                        <span>Przypisana przez: {bonus.proposer_full_name ?? '—'}</span>
                        <span>Otrzymano: {formatDate(bonus.created_at)}</span>
                        {bonus.cancellation_reason && (
                            <span className="text-destructive">Powód anul.: {bonus.cancellation_reason}</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
