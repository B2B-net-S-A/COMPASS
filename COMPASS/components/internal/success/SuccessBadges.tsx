import { Badge, type BadgeProps } from '@/components/ui/badge'
import type {
    SuccessCheckInStatus,
    SuccessCheckInType,
    SuccessHealthStatus,
    SuccessMonitoringState,
    SuccessPriority,
    SuccessTaskStatus,
} from '@/lib/types/consultant-success'

const HEALTH: Record<SuccessHealthStatus, { label: string; variant: BadgeProps['variant'] }> = {
    unknown: { label: 'Brak statusu', variant: 'neutral' },
    green: { label: 'Zielony', variant: 'success' },
    amber: { label: 'Żółty', variant: 'warning' },
    red: { label: 'Czerwony', variant: 'danger' },
}

const CHECK_IN_TYPE_LABEL: Record<SuccessCheckInType, string> = {
    regular: 'Regularny',
    ad_hoc: 'Ad hoc',
    emergency: 'Pilny',
    feedback: 'Feedback',
    risk: 'Ryzyko',
    onboarding: 'Onboarding',
    offboarding: 'Offboarding',
}

const PRIORITY: Record<SuccessPriority, { label: string; variant: BadgeProps['variant'] }> = {
    low: { label: 'Niski', variant: 'neutral' },
    medium: { label: 'Średni', variant: 'info' },
    high: { label: 'Wysoki', variant: 'warning' },
    critical: { label: 'Krytyczny', variant: 'danger' },
}

const MONITORING: Record<SuccessMonitoringState, { label: string; variant: BadgeProps['variant'] }> = {
    inactive: { label: 'Nieaktywny', variant: 'neutral' },
    active: { label: 'Monitoring aktywny', variant: 'success' },
    paused: { label: 'Wstrzymany', variant: 'warning' },
}

const CHECK_IN: Record<SuccessCheckInStatus, { label: string; variant: BadgeProps['variant'] }> = {
    scheduled: { label: 'Zaplanowany', variant: 'info' },
    in_progress: { label: 'W toku', variant: 'warning' },
    completed: { label: 'Zakończony', variant: 'success' },
    cancelled: { label: 'Anulowany', variant: 'neutral' },
    rescheduled: { label: 'Przełożony', variant: 'neutral' },
}

const TASK: Record<SuccessTaskStatus, { label: string; variant: BadgeProps['variant'] }> = {
    todo: { label: 'Do zrobienia', variant: 'neutral' },
    in_progress: { label: 'W toku', variant: 'warning' },
    done: { label: 'Zrobione', variant: 'success' },
    cancelled: { label: 'Anulowane', variant: 'neutral' },
}

function MappedBadge({ value }: { value: { label: string; variant: BadgeProps['variant'] } }) {
    return <Badge variant={value.variant}>{value.label}</Badge>
}

export function HealthBadge({ status }: { status: SuccessHealthStatus }) {
    return <MappedBadge value={HEALTH[status]} />
}

export function PriorityBadge({ priority }: { priority: SuccessPriority }) {
    return <MappedBadge value={PRIORITY[priority]} />
}

export function MonitoringBadge({ state }: { state: SuccessMonitoringState }) {
    return <MappedBadge value={MONITORING[state]} />
}

export function CheckInStatusBadge({ status }: { status: SuccessCheckInStatus }) {
    return <MappedBadge value={CHECK_IN[status]} />
}

export function checkInTypeLabel(type: SuccessCheckInType): string {
    return CHECK_IN_TYPE_LABEL[type]
}

export function TaskStatusBadge({ status }: { status: SuccessTaskStatus }) {
    return <MappedBadge value={TASK[status]} />
}

export function formatSuccessDate(value: string | null, withTime = false): string {
    if (!value) return '—'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return value
    return new Intl.DateTimeFormat('pl-PL', withTime
        ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

export function isPastDue(value: string | null): boolean {
    if (!value) return false
    return new Date(value).getTime() < Date.now()
}
