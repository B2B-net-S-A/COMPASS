// Phase 25d — Global banner pokazujący aktywne urlopy + zastępców.
// Server component. Pobiera listActiveLeaves() (scope: own team / manager).
// Pokazuje top 3 urlopy + pozostałe w rozwijalnym <details> (zero client-JS).

import { listActiveLeaves, type ActiveLeaveRow } from '@/lib/actions/internal-leave'
import { Plane, UserCheck, ChevronDown } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'

const LEAVE_TYPE_LABEL: Record<string, string> = {
    vacation: 'urlop',
    sick_leave: 'L4',
    parental_leave: 'opieka',
    unpaid_leave: 'bezpłatny',
    training: 'szkolenie',
    on_demand: 'na żądanie',
    occasional: 'okolicznościowy',
    childcare: 'opieka dz.',
    care_leave: 'opiekuńczy',
    force_majeure: 'siła wyższa',
    maternity: 'macierzyński',
    paternity: 'ojcowski',
    childrearing: 'wychowawczy',
    blood_donation: 'krwiodawstwo',
    holiday_in_lieu: 'odbiór dnia',
    other: 'urlop',
}

function fmt(d: string): string {
    return format(parseISO(d), 'd LLL', { locale: pl })
}

function LeaveItem({ leave }: { leave: ActiveLeaveRow }) {
    return (
        <li className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            <span className="font-medium text-foreground">
                {leave.user_full_name ?? leave.user_email}
            </span>
            <span className="text-[10px] text-blue-300/80">
                ({LEAVE_TYPE_LABEL[leave.leave_type] ?? 'urlop'})
            </span>
            <span>do {fmt(leave.end_date)}</span>
            {leave.substitute_full_name && leave.substitute_email ? (
                <span className="inline-flex items-center gap-1">
                    <UserCheck className="h-3 w-3 text-green-400" />
                    zastępuje:{' '}
                    <a
                        href={`mailto:${leave.substitute_email}`}
                        className="font-medium text-foreground hover:underline"
                    >
                        {leave.substitute_full_name}
                    </a>
                </span>
            ) : (
                <span className="italic text-amber-300/80">brak zastępcy</span>
            )}
        </li>
    )
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
    const hidden = leaves.slice(3)

    return (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs">
            <div className="flex items-center gap-1.5 text-blue-300 font-medium mb-2">
                <Plane className="h-4 w-4" />
                Aktualnie na urlopie ({leaves.length})
            </div>
            <ul className="space-y-1">
                {visible.map((leave) => (
                    <LeaveItem key={leave.id} leave={leave} />
                ))}
            </ul>
            {hidden.length > 0 && (
                <details className="group mt-1.5">
                    <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-[11px] text-blue-300/90 hover:text-blue-200 [&::-webkit-details-marker]:hidden">
                        <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                        <span className="group-open:hidden">
                            Pokaż {hidden.length}{' '}
                            {hidden.length === 1 ? 'kolejny urlop' : 'kolejnych urlopów'}
                        </span>
                        <span className="hidden group-open:inline">Ukryj</span>
                    </summary>
                    <ul className="mt-1 space-y-1">
                        {hidden.map((leave) => (
                            <LeaveItem key={leave.id} leave={leave} />
                        ))}
                    </ul>
                </details>
            )}
        </div>
    )
}
