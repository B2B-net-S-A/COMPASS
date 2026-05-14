/**
 * Catch-all loading skeleton dla wszystkich route'ów w (protected).
 * Każdy route bez własnego loading.tsx automatycznie używa tego szkieletu.
 *
 * Route'y z własnym loading.tsx (projects, messages, notifications, admin, home)
 * mają dedykowane skeletony dopasowane do layoutu strony.
 */
import { Shimmer, CardShimmer } from '@/components/ui/shimmer-skeleton'

export default function ProtectedLoading() {
    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            {/* Generic page header */}
            <div className="flex items-center justify-between">
                <Shimmer className="h-8 w-56" />
                <Shimmer className="h-10 w-32 rounded-lg" />
            </div>
            {/* Content area */}
            <CardShimmer lines={5} />
            <div className="grid gap-4 md:grid-cols-2">
                <CardShimmer lines={3} />
                <CardShimmer lines={3} />
            </div>
        </div>
    )
}
