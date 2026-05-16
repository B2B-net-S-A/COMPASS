import { listAuditLogForUser } from '@/lib/actions/lifecycle'
import { History } from 'lucide-react'

const ACTION_LABEL: Record<string, string> = {
    ONBOARDING_STARTED: 'Onboarding rozpoczęty',
    ONBOARDING_TASK_COMPLETED: 'Task ukończony',
    ONBOARDING_TASK_ADDED: 'Ad-hoc task dodany',
    ONBOARDING_CHECKIN_SUBMITTED: 'Check-in wypełniony',
    ONBOARDING_COMPLETED: 'Onboarding zakończony',
    ONBOARDING_CANCELLED: 'Onboarding anulowany',
    ONBOARDING_RESTARTED: 'Onboarding zrestartowany',
    EXIT_INTERVIEW_SCHEDULED: 'Exit interview zaplanowany',
    EXIT_INTERVIEW_SUBMITTED: 'Exit interview wypełniony',
    EXIT_INTERVIEW_REVIEWED: 'Exit interview reviewed',
    EXIT_INTERVIEW_CANCELLED: 'Exit interview anulowany',
    EXIT_INTERVIEW_ANONYMIZED: 'Exit interview zanonimizowany',
    OFFBOARDING_STARTED: 'Offboarding rozpoczęty',
    OFFBOARDING_TASK_COMPLETED: 'Offboarding task ukończony',
    EMPLOYEE_EXITED: 'Pracownik oznaczony jako exited',
    BUDDY_ASSIGNED: 'Przypisano buddy',
    BUDDY_UNASSIGNED: 'Odpisano buddy',
    MANAGER_ASSIGNED: 'Zmiana managera',
    LIFECYCLE_PROFILE_UPDATED: 'Profil lifecycle zaktualizowany',
    EXTERNAL_EMPLOYEE_CREATED: 'External pracownik utworzony',
    LIFECYCLE_NOTE_ADDED: 'Notatka TCM dodana',
    LIFECYCLE_NOTE_DELETED: 'Notatka usunięta',
    INVITE_USER: 'Zaproszono pracownika',
}

interface Props {
    userId: string
}

export async function AuditHistoryPanel({ userId }: Props) {
    const entries = await listAuditLogForUser(userId, 50)

    if (entries.length === 0) {
        return (
            <div className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
                Brak wpisów w audit log dla tego pracownika.
            </div>
        )
    }

    return (
        <div className="rounded-lg border bg-card overflow-hidden">
            <div className="bg-muted/50 p-3 border-b">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                    <History className="h-4 w-4" />
                    Historia (audit log)
                </h2>
            </div>
            <ul className="divide-y max-h-96 overflow-y-auto">
                {entries.map((e) => (
                    <li key={e.id} className="p-3 text-sm">
                        <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                                <div className="font-medium">{ACTION_LABEL[e.action] ?? e.action}</div>
                                {e.details && Object.keys(e.details).length > 0 && (
                                    <details className="text-xs text-muted-foreground mt-1">
                                        <summary className="cursor-pointer hover:underline">Szczegóły</summary>
                                        <pre className="mt-1 whitespace-pre-wrap break-all bg-muted/30 rounded p-2">
                                            {JSON.stringify(e.details, null, 2)}
                                        </pre>
                                    </details>
                                )}
                            </div>
                            <div className="text-xs text-muted-foreground text-right shrink-0">
                                <div>{e.actor_name ?? 'system'}</div>
                                <div>{new Date(e.created_at).toLocaleString('pl-PL')}</div>
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    )
}
