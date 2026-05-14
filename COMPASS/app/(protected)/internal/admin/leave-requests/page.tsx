import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AdminLeaveRequestsLegacyRedirect() {
    redirect('/internal/admin?tab=leave-requests')
}
