// Phase 48 — banner stanu monitoringu prawnego.
//
// Pipeline dopisuje wiersz do `legal_monitor_runs` na każdy przebieg, także pusty,
// więc ten banner jest jedynym miejscem, w którym widać, że monitoring przestał
// chodzić. Stan liczy czysta `computeMonitorHealth` — tutaj tylko prezentacja.

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

function fmtRunAt(iso: string): string {
    return format(parseISO(iso), "d LLLL yyyy 'o' HH:mm", { locale: pl })
}

function headline(health: MonitorHealth): string {
    switch (health.state) {
        case 'ok':
            return `Monitoring aktywny — ostatnie sprawdzenie ${fmtRunAt(health.lastRunAt!)}`
        case 'partial':
            return 'Część źródeł była niedostępna przy ostatnim sprawdzeniu'
        case 'failed':
            return 'Ostatni przebieg monitoringu zakończył się niepowodzeniem'
        case 'stale':
            return 'Monitoring nie odpowiada — zgłoś administratorowi'
        case 'never':
            return 'Monitoring nie zaraportował jeszcze żadnego przebiegu'
    }
}

function detail(health: MonitorHealth): string | null {
    switch (health.state) {
        case 'ok':
            return health.itemsFound && health.itemsFound > 0
                ? `Dopisano nowych wpisów: ${health.itemsFound}.`
                : 'Bez nowości w profilu firmy.'
        case 'partial': {
            const sources = health.failedSources
                .map((s) => LEGAL_SOURCE_SHORT_PL[s] ?? s)
                .join(', ')
            const when = health.lastRunAt ? ` (sprawdzenie ${fmtRunAt(health.lastRunAt)})` : ''
            return sources
                ? `Niedostępne źródła: ${sources}${when}.`
                : `Szczegóły w uwagach przebiegu${when}.`
        }
        case 'failed':
            return health.lastRunAt ? `Przebieg z ${fmtRunAt(health.lastRunAt)}.` : null
        case 'stale': {
            const last = health.lastRunAt ? `Ostatnie sprawdzenie: ${fmtRunAt(health.lastRunAt)}.` : ''
            const missed =
                health.missedWorkingDays === 1
                    ? 'Minął dzień roboczy bez przebiegu.'
                    : `Dni roboczych bez przebiegu: ${health.missedWorkingDays}.`
            return `${last} ${missed}`.trim()
        }
        case 'never':
            return 'Sprawdź, czy zadanie cykliczne monitoringu jest włączone.'
    }
}

const ICONS: Record<MonitorHealth['state'], typeof CheckCircle2> = {
    ok: CheckCircle2,
    partial: AlertTriangle,
    failed: XCircle,
    stale: AlertTriangle,
    never: Clock,
}

export function LegalMonitorHealthBanner({ health }: { health: MonitorHealth }) {
    const Icon = ICONS[health.state]
    const text = detail(health)
    return (
        <div
            role="status"
            className={cn('rounded-lg border px-4 py-3 flex items-start gap-3', TONE_STYLES[health.tone])}
        >
            <Icon className="h-5 w-5 shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
                <p className="text-sm font-medium">{headline(health)}</p>
                {text && <p className="text-xs mt-0.5 opacity-90">{text}</p>}
                {(health.state === 'partial' || health.state === 'failed') && health.notes && (
                    <p className="text-xs mt-1 opacity-80 line-clamp-3">{health.notes}</p>
                )}
            </div>
        </div>
    )
}
