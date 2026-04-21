import { DashboardSkeleton } from '@/components/ui/shimmer-skeleton'

export default function HomeLoading() {
    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
            <DashboardSkeleton />
        </div>
    )
}
