import { Shimmer, CardShimmer, DashboardStatsSkeleton } from '@/components/ui/shimmer-skeleton'

export default function LoyaltyLoading() {
    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <Shimmer className="h-8 w-56" />
                <Shimmer className="h-10 w-32 rounded-lg" />
            </div>
            <DashboardStatsSkeleton />
            <CardShimmer lines={6} />
        </div>
    )
}
