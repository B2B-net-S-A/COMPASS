import { Shimmer, CardShimmer } from '@/components/ui/shimmer-skeleton'

export default function SettingsLoading() {
    return (
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
            <Shimmer className="h-8 w-40" />
            <div className="flex gap-2 border-b border-white/10 pb-2">
                {[1, 2, 3, 4].map((i) => (
                    <Shimmer key={i} className="h-9 w-28 rounded-md" />
                ))}
            </div>
            <CardShimmer lines={4} />
            <CardShimmer lines={3} />
        </div>
    )
}
