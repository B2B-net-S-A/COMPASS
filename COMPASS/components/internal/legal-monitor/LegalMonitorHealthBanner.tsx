// Phase 48 — banner stanu monitoringu prawnego.
//
// Pipeline dopisuje wiersz do `legal_monitor_runs` na każdy przebieg, także pusty,
// więc ten banner jest jedynym miejscem, w którym widać, że monitoring przestał
// chodzić. Stan liczy czysta `computeMonitorHealth` — tutaj tylko prezentacja.
//
// Banner to JEDNO zdanie. Surowe uwagi przebiegu potrafią mieć kilka akapitów
// (pipeline pisze pełną relację z tego, co się nie udało) i zjadały pół ekranu —
// ich miejsce jest w „Historii sprawdzeń", gdzie dają się rozwinąć.

import { CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import type { MonitorHealth } from '@/lib/legal-monitor/health'
import { LEGAL_SOURCE_SHORT_PL } from '@/lib/types/legal-monitor'

const TONE_STYLES: Record<MonitorHealth['tone'], string> = {
    success: 'border-success/30 bg-success/10 text-success',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    danger: 'border-destructive/30 bg-destructive/10 text-destructive',
}

const ICONS: Record<MonitorHealth['state'], typeof CheckCircle2> = {
    ok: CheckCircle2,
    partial: AlertTriangle,
    failed: XCircle,
    stale: AlertTriangle,
    never: Clock,
}

/** Odsyłacz do sekcji niżej — stan problemowy ma gdzie rozwinąć szczegóły. */
const SEE_HISTORY = 'szczegóły w „Historii sprawdzeń” niżej'

function fmtRunAt(iso: string): string {
    return format(parseISO(iso), "d LLLL yyyy 'o' HH:mm", { locale: pl })
}

/**
 * Polska odmiana razem z czasownikiem — inaczej wychodzi „minął(-ęły)":
 * minął 1 dzień roboczy / minęły 2 dni robocze / minęło 5 dni roboczych
 * (12–14 zachowuje się jak 5+, stąd sprawdzenie dwóch ostatnich cyfr).
 */
function elapsedWorkingDaysPl(n: number): string {
    const last = n % 10
    const lastTwo = n % 100
    if (n === 1) return 'minął 1 dzień roboczy'
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return `minęły ${n} dni robocze`
    return `minęło ${n} dni roboczych`
}

/** Cały banner w jednym zdaniu — bez surowych uwag przebiegu. */
function sentence(health: MonitorHealth): string {
    switch (health.state) {
        case 'ok': {
            const found =
                health.itemsFound && health.itemsFound > 0
                    ? `nowych wpisów: ${health.itemsFound}`
                    : 'bez nowości'
            return `Monitoring aktywny — ostatnie sprawdzenie ${fmtRunAt(health.lastRunAt!)}, ${found}.`
        }
        case 'partial': {
            const sources = health.failedSources
                .map((s) => LEGAL_SOURCE_SHORT_PL[s] ?? s)
                .join(', ')
            const which = sources ? `nie odpowiedziały: ${sources}` : 'część źródeł nie odpowiedziała'
            return `Przy sprawdzeniu ${fmtRunAt(health.lastRunAt!)} ${which} — ${SEE_HISTORY}.`
        }
        case 'failed':
            return `Przebieg monitoringu z ${fmtRunAt(health.lastRunAt!)} nie powiódł się — ${SEE_HISTORY}.`
        case 'stale':
            return `Monitoring nie odpowiada — ostatnie sprawdzenie ${fmtRunAt(
                health.lastRunAt!,
            )}, od tego czasu ${elapsedWorkingDaysPl(health.missedWorkingDays)} bez przebiegu.`
        case 'never':
            return 'Monitoring nie zaraportował jeszcze żadnego przebiegu — sprawdź, czy zadanie cykliczne jest włączone.'
    }
}

export function LegalMonitorHealthBanner({ health }: { health: MonitorHealth }) {
    const Icon = ICONS[health.state]
    return (
        <div
            role="status"
            className={cn(
                'rounded-lg border px-4 py-3 flex items-start gap-3',
                TONE_STYLES[health.tone],
            )}
        >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
            <p className="text-sm font-medium min-w-0">{sentence(health)}</p>
        </div>
    )
}
