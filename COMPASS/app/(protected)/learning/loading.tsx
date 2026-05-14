import { Shimmer, CardShimmer } from '@/components/ui/shimmer-skeleton'

export default function AkademiaLoading() {
    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <Shimmer className="h-9 w-48" />
                <Shimmer className="h-10 w-40 rounded-lg" />
            </div>
            <Shimmer className="h-4 w-full max-w-2xl" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <CardShimmer lines={5} />
                <CardShimmer lines={5} />
                <CardShimmer lines={5} />
            </div>
        </div>
    )
}
