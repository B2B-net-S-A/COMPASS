import { getMyLeaveBalance, listMyLeaveRequests } from '@/lib/actions/internal-leave'
import { LeaveStatsWidget } from '@/components/internal/LeaveStatsWidget'
import { LeaveRequestForm } from '@/components/internal/LeaveRequestForm'
import { MyLeaveList } from '@/components/internal/MyLeaveList'

export async function LeavePanel() {
    const [balance, requests] = await Promise.all([
        getMyLeaveBalance(),
        listMyLeaveRequests(),
    ])

    // Phase 30 — widget puli widoczny TYLKO gdy:
    //   - UoP (zawsze, nawet bez limitu — pokazuje "X wykorzystane / bez limitu"),
    //   - LUB B2B/zlecenie z ustawioną pulą (has_limit=true).
    // B2B/zlecenie bez puli → komponent w ogóle nie renderuje się
    // (zgodnie z user req: "jak nie ma, to nie pokazuj sekcji").
    const showBalanceWidget =
        balance.employment_type === 'uop' || balance.has_limit

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Moje urlopy</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Wnioski i historia. UoP — limit z Kodeksu pracy; B2B/zlecenie bez puli — urlop bezpłatny;
                    B2B/zlecenie z pulą (z kontraktu) — auto-split płatny (z puli) + bezpłatny dla nadwyżki.
                </p>
            </div>
            {showBalanceWidget && <LeaveStatsWidget balance={balance} />}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <LeaveRequestForm
                    isUop={balance.employment_type === 'uop'}
                    hasPool={balance.has_limit}
                />
                <MyLeaveList requests={requests} />
            </div>
        </section>
    )
}
