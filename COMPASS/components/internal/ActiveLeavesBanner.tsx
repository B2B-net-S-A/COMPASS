// Phase 25d — Global banner pokazujący aktywne urlopy + zastępców.
// Server component. Pobiera listActiveLeaves() (scope: own team / manager).
// Pokazuje top 3 urlopy + ukryte pozostałe jako collapsed count.

import { listActiveLeaves } from '@/lib/actions/internal-leave'
import { Plane, UserCheck } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'

const LEAVE_TYPE_LABEL: Record<string, string> = {
    vacation: 'urlop',
    sick_leave: 'L4',
    parental_leave: 'opieka',
    unpaid_leave: 'bezpłatny',
    training: 'szkolenie',
    other: 'urlop',
}

export async function ActiveLeavesBanner() {
    let leaves
    try {
        leaves = await listActiveLeaves()
    } catch {
        return null // soft-fail: nie pokazujemy banneru gdy błąd
    }
    if (!leaves || leaves.length === 0) return null

    const visible = leaves.slice(0, 3)
    const remaining = leaves.length - visible.length

    function fmt(d: string): string {
        return format(parseISO(d), 'd LLL', { locale: pl })
    }

    return (
        <div className="rounded-lg border border-info/30 bg-info/5 p-3 text-xs">
            <div className="flex items-center gap-1.5 text-info font-medium mb-2">
                <Plane className="h-4 w-4" />
                Aktualnie na urlopie ({leaves.length})
            </div>
            <ul className="space-y-1">
                {visible.map((l) => (
                    <li
                        key={l.id}
                        className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground"
                    >
                        <span className="font-medium text-foreground">
                            {l.user_full_name ?? l.user_email}
                        </span>
                        <span className="text-[10px] text-info/80">
                            ({LEAVE_TYPE_LABEL[l.leave_type] ?? 'urlop'})
                        </span>
                        <span>do {fmt(l.end_date)}</span>
                        {l.substitute_full_name && l.substitute_email && (
                            <span className="inline-flex items-center gap-1">
                                <UserCheck className="h-3 w-3 text-success" />
                                zastępuje:{' '}
                                <a
                                    href={`mailto:${l.substitute_email}`}
                                    className="font-medium text-foreground hover:underline"
                                >
                                    {l.substitute_full_name}
                                </a>
                            </span>
                        )}
                        {!l.substitute_full_name && (
                            <span className="italic text-warning/80">
                                brak zastępcy
                            </span>
                        )}
                    </li>
                ))}
            </ul>
            {remaining > 0 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                    + {remaining} {remaining === 1 ? 'kolejny urlop' : 'kolejnych urlopów'}
                </p>
            )}
        </div>
    )
}
