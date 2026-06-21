import { Circle } from 'lucide-react'
import type { LifecycleEvent } from '@/lib/types/lifecycle'

const EVENT_LABEL: Record<LifecycleEvent['event_type'], string> = {
    hired: 'Zatrudniono',
    onboarding_started: 'Onboarding rozpoczęty',
    onboarding_completed: 'Onboarding zakończony',
    role_changed: 'Zmiana roli',
    manager_changed: 'Zmiana managera',
    buddy_assigned: 'Przypisany buddy',
    offboarding_started: 'Offboarding rozpoczęty',
    exit_interview_completed: 'Exit interview wypełniony',
    exited: 'Pracownik odszedł',
}

const EVENT_COLOR: Record<LifecycleEvent['event_type'], string> = {
    hired: 'text-info',
    onboarding_started: 'text-info',
    onboarding_completed: 'text-success',
    role_changed: 'text-warning',
    manager_changed: 'text-warning',
    buddy_assigned: 'text-info',
    offboarding_started: 'text-warning',
    exit_interview_completed: 'text-warning',
    exited: 'text-destructive',
}

export function LifecycleTimelinePanel({ events }: { events: LifecycleEvent[] }) {
    if (events.length === 0) {
        return <p className="text-sm text-muted-foreground">Brak wydarzeń.</p>
    }
    return (
        <div className="rounded-lg border bg-card p-4">
            <ol className="space-y-3">
                {events.map((e) => (
                    <li key={e.id} className="flex items-start gap-3">
                        <Circle className={`h-3 w-3 mt-1 fill-current ${EVENT_COLOR[e.event_type]}`} />
                        <div className="flex-1">
                            <div className="text-sm font-medium">{EVENT_LABEL[e.event_type]}</div>
                            <div className="text-xs text-muted-foreground">
                                {new Date(e.created_at).toLocaleString('pl-PL')}
                            </div>
                        </div>
                    </li>
                ))}
            </ol>
        </div>
    )
}
