import { listTeamMembersForLeaveOnBehalf } from '@/lib/actions/internal-leave'
import { CreateLeaveOnBehalfForm } from '@/components/internal/CreateLeaveOnBehalfForm'

export async function LeaveOnBehalfPanel() {
    const candidates = await listTeamMembersForLeaveOnBehalf()

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Wpisz urlop w imieniu pracownika</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Post-factum rejestracja urlopu, który pracownik zapomniał zgłosić. Wpis zostanie automatycznie
                    zatwierdzony, a pracownik otrzyma email i powiadomienie push z informacją, kto wprowadził wpis.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                    Dla urlopów ongoing/future system ustawi Out of Office w Outlooku i wyśle email do zastępcy.
                    Dla urlopów zakończonych pomijamy te kroki — wpis trafia tylko do historii + przelicza obecności.
                </p>
            </div>
            <CreateLeaveOnBehalfForm candidates={candidates} />
        </section>
    )
}
