import { Suspense } from 'react'
import { getDashboardStats } from '@/lib/actions/dashboard'
import { getRecentNotifications } from '@/lib/actions/notifications'
import { ServiceHubView } from '@/components/centrala/ServiceHubView'

// Skeleton loader
function DashboardSkeleton() {
    return (
        <div className="space-y-6 animate-pulse">
            <div className="h-48 bg-white/5 rounded-xl" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="h-64 bg-white/5 rounded-xl lg:col-span-2" />
                <div className="h-64 bg-white/5 rounded-xl" />
            </div>
        </div>
    )
}

export default async function AdminCentralaPage() {
    // Parallel data fetching
    const [statsResult, notificationsResult] = await Promise.all([
        getDashboardStats(),
        getRecentNotifications(5, true) // 5 recent unread
    ])

    const statsData = statsResult.success && statsResult.stats ? statsResult.stats : null
    const notifications = notificationsResult.success && notificationsResult.notifications ? notificationsResult.notifications : []

    if (!statsData) {
        return (
            <div className="p-8 text-center text-white">
                <h2 className="text-xl font-bold text-red-500">Błąd ładowania danych</h2>
                <p className="text-slate-400">Spróbuj odświeżyć stronę.</p>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-black text-white p-4 md:p-8 max-w-7xl mx-auto">
            <Suspense fallback={<DashboardSkeleton />}>
                <ServiceHubView stats={statsData} notifications={notifications} />
            </Suspense>
        </div>
    )
}
