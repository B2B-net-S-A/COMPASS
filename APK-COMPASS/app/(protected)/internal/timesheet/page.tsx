import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function TimesheetIndex() {
    const now = new Date()
    redirect(`/internal/timesheet/${now.getFullYear()}/${now.getMonth() + 1}`)
}
