import { redirect } from 'next/navigation'
import { getUnifiedDashboardData } from '@/lib/actions/unified-dashboard'
import { UnifiedDashboardClient } from '@/components/dashboard/UnifiedDashboardClient'

export default async function HomePage() {
    try {
        const data = await getUnifiedDashboardData()
        if (!data.success) {
            redirect('/login')
        }
        return (
            <UnifiedDashboardClient
                role={data.role || 'consultant'}
                centralaSubRole={data.centralaSubRole ?? null}
                userProfile={data.userProfile ?? null}
                centralaStats={data.centralaStats ?? null}
                consultantsList={data.consultantsList ?? null}
                consultantDashboard={data.consultantDashboard ?? null}
                adminKpi={data.adminKpi ?? null}
                recruiterInfo={data.recruiterInfo ?? null}
                adminDashboardData={data.adminDashboardData ?? null}
                isSuperAdmin={data.isSuperAdmin ?? false}
            />
        )
    } catch {
        redirect('/login')
    }
}
