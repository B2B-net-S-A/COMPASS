import { reportDate, ROUTE_LABELS } from '@/lib/academy/competence-report'
import type { ManagerTeamMember } from '@/lib/actions/academy-reports'

/** Same dokumenty: bez oblanych prób i procentów. */
export function ManagerTeamReport({ members }: { members: ManagerTeamMember[] }) {
    return <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Widzisz osoby z biura, które mają Cię wskazanego jako przełożonego. Raport nie pokazuje oblanych prób ani wyników testów.</p>
        {members.map(member => <section key={member.user_id} aria-label={member.full_name} className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="font-semibold">{member.full_name}</h2><span className="text-sm text-muted-foreground">W trakcie: {member.in_progress}</span></div>
            {member.certificates.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Brak ukończonych programów.</p> : <ul className="mt-2 divide-y divide-border text-sm">
                {member.certificates.map(certificate => <li key={`${certificate.programme_title}:${certificate.completed_at}`} className="flex flex-col gap-1 py-2 sm:flex-row sm:justify-between">
                    <span>{certificate.programme_title} <span className="text-muted-foreground">· {ROUTE_LABELS[certificate.route]}</span></span>
                    <span className="tabular-nums text-muted-foreground">{reportDate(certificate.completed_at)} · {certificate.valid_until ? `ważne do ${reportDate(certificate.valid_until)}` : 'bez terminu'}</span>
                </li>)}
            </ul>}
        </section>)}
    </div>
}
