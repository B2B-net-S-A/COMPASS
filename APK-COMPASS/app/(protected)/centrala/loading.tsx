import { Shimmer, CardShimmer, DashboardStatsSkeleton } from '@/components/ui/shimmer-skeleton'

export default function CentralaLoading() {
    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <Shimmer className="h-8 w-48" />
                <Shimmer className="h-10 w-36 rounded-lg" />
            </div>
            <DashboardStatsSkeleton />
            <div className="grid gap-4 md:grid-cols-2">
                <CardShimmer lines={4} />
                <CardShimmer lines={4} />
            </div>
        </div>
    )
}
