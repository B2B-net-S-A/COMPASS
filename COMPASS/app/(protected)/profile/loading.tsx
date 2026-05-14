import { Shimmer, CardShimmer } from '@/components/ui/shimmer-skeleton'

export default function ProfileLoading() {
    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Shimmer className="w-20 h-20 rounded-full shrink-0" />
                <div className="space-y-2 flex-1">
                    <Shimmer className="h-7 w-48" />
                    <Shimmer className="h-4 w-32" />
                    <Shimmer className="h-4 w-56" />
                </div>
            </div>
            <div className="flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                    <Shimmer key={i} className="h-9 w-28 rounded-md" />
                ))}
            </div>
            <CardShimmer lines={5} />
            <CardShimmer lines={3} />
        </div>
    )
}
