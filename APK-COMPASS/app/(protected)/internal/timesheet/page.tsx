import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function TimesheetLegacyRedirect() {
    redirect('/internal?tab=timesheet')
}
