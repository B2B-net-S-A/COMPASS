// Phase 28 — "Moje placementy": read-only self-view for Delivery Leads & Recruiters.
// Shows own signed placements with the bonus forecast (amount + projected 168h date),
// or "naliczone" once confirmed. RLS scopes rows to delivery_lead_id/recruiter_id = me.

import { createClient } from '@/lib/supabase/server'
import { listMyPlacements } from '@/lib/actions/placements'
import { Badge } from '@/components/ui/badge'
import { placementStatusLabelPl, type PlacementRow, type PlacementStatus } from '@/lib/types/placement'

export const dynamic = 'force-dynamic'

function pln(n: number | string): string {
    return `${Number(n).toLocaleString('pl-PL')} zł`
}

function statusVariant(s: PlacementStatus): 'default' | 'secondary' | 'destructive' | 'outline' {
    if (s === 'bonus_confirmed') return 'default'
    if (s === 'cancelled') return 'destructive'
    if (s === 'started') return 'secondary'
    return 'outline'
}

interface MyRow {
    p: PlacementRow
    role: string
    myBonus: number
}

export default async function MyPlacementsPage() {
    const supabase = createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()
    const placements = await listMyPlacements()

    const rows: MyRow[] = placements.map((p) => {
        const isDl = p.delivery_lead_id === user?.id
        const isRec = p.recruiter_id === user?.id
        const role = isDl && isRec ? 'DL + Rekruter' : isDl ? 'Delivery Lead' : 'Rekruter'
        const myBonus =
            (isDl ? Number(p.dl_bonus_amount) : 0) + (isRec ? Number(p.recruiter_bonus_amount) : 0)
        return { p, role, myBonus }
    })

    const pending = rows.filter((r) => r.p.status === 'upcoming' || r.p.status === 'started')
    const forecastTotal = pending.reduce((sum, r) => sum + r.myBonus, 0)

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold">Moje placementy</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Umowy, w których jesteś Delivery Leadem lub Rekruterem. Premia nalicza się po
                    przepracowaniu 168h przez konsultanta (data poniżej to prognoza).
                </p>
            </header>

            {pending.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-4">
                    <span className="text-sm text-muted-foreground">Prognozowane premie (oczekujące): </span>
                    <span className="text-lg font-semibold">{pln(forecastTotal)}</span>
                </div>
            )}

            {rows.length === 0 ? (
                <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                    Nie masz jeszcze przypisanych placementów.
                </p>
            ) : (
                <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="p-2 text-left">Konsultant</th>
                                <th className="p-2 text-left">Klient</th>
                                <th className="p-2 text-left">Twoja rola</th>
                                <th className="p-2 text-left">Start</th>
                                <th className="p-2 text-left">Premia ~ od</th>
                                <th className="p-2 text-right">Twoja premia</th>
                                <th className="p-2 text-left">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(({ p, role, myBonus }) => (
                                <tr key={p.id} className="border-t">
                                    <td className="p-2 font-medium">{p.consultant_name}</td>
                                    <td className="p-2">{p.client_name}</td>
                                    <td className="p-2">{role}</td>
                                    <td className="p-2">{p.start_date}</td>
                                    <td className="p-2 text-muted-foreground">
                                        {p.status === 'bonus_confirmed' ? '—' : p.bonus_eligible_date}
                                    </td>
                                    <td className="p-2 text-right font-medium">{pln(myBonus)}</td>
                                    <td className="p-2">
                                        <Badge variant={statusVariant(p.status)}>
                                            {placementStatusLabelPl(p.status)}
                                        </Badge>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
