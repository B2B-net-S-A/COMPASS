import { getOrCreateMyTimesheet } from '@/lib/actions/internal-timesheet'
import {
    suggestTimesheetEntriesFromClock,
    markTimesheetAutoFilled,
} from '@/lib/actions/internal-clock'
import { TimesheetEditor } from '@/components/internal/TimesheetEditor'

interface Props {
    year?: number
    month?: number
}

// Phase 17b R5 (PR-A2): Timer widget (PR #50, H3.6) usunięty z UI.
// Smart Work Clock (Phase 17, floating button "Start pracy") jest jedynym
// trackerem.
//
// Phase 17b R8 (PR-B): auto-fill timesheet jako default flow. Gdy user otwiera
// pusty draft i nie wyczyścił auto-fill, system automatycznie wstawia entries
// z work_clock_daily. Banner "Draft gotowy" w TimesheetEditor pokazuje status.
export async function TimesheetPanel({ year, month }: Props) {
    const now = new Date()
    const y = year ?? now.getFullYear()
    const m = Math.min(12, Math.max(1, month ?? now.getMonth() + 1))
    let timesheet = await getOrCreateMyTimesheet(y, m)

    // R8: auto-fill on first open of an empty draft (idempotent via auto_filled_at)
    const isEligibleForAutoFill =
        timesheet.status === 'draft' &&
        timesheet.entries.length === 0 &&
        !timesheet.auto_filled_at &&
        !timesheet.user_cleared_auto_fill
    if (isEligibleForAutoFill) {
        try {
            const result = await suggestTimesheetEntriesFromClock({
                timesheetId: timesheet.id,
                overwriteSuggestions: false,
            })
            if (result.inserted > 0) {
                await markTimesheetAutoFilled(timesheet.id)
            } else {
                // No clock data → still mark to prevent retry on every refresh
                await markTimesheetAutoFilled(timesheet.id)
            }
            // Refetch to get fresh entries + auto_filled_at flag
            timesheet = await getOrCreateMyTimesheet(y, m)
        } catch (e) {
            // Non-fatal: log and continue with empty draft
            console.error('[TimesheetPanel] auto-fill failed', e)
        }
    }

    return (
        <section className="space-y-4">
            <div>
                <h2 className="text-xl font-semibold">Timesheet</h2>
                <p className="text-sm text-muted-foreground mt-1">
                    Loguj godziny przepracowane w danym miesiącu. Po złożeniu admin akceptuje
                    timesheet i generowany jest PDF do podpisania.
                </p>
            </div>
            <TimesheetEditor timesheet={timesheet} />
        </section>
    )
}
