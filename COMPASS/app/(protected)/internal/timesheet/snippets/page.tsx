import { listMyTemplates } from '@/lib/actions/internal-timesheet-templates'
import { TimesheetTemplatesManager } from '@/components/internal/TimesheetTemplatesManager'

export const dynamic = 'force-dynamic'

export default async function TimesheetSnippetsPage() {
    const templates = await listMyTemplates()
    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Moje snippety opisu usług</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Twórz krótkie szablony, których używasz najczęściej (np. „Konsultacje SAP”,
                    „Code review”, „Daily standup”). Wstawisz je do timesheet jednym klikiem przez
                    dropdown „Wstaw snippet” w oknie wpisu.
                </p>
            </div>
            <TimesheetTemplatesManager initialTemplates={templates} />
        </div>
    )
}
