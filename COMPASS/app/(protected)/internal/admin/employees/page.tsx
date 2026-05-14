import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function AdminEmployeesLegacyRedirect() {
    redirect('/internal/admin?tab=employees')
}
