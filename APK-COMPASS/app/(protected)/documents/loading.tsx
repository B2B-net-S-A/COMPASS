import { Shimmer, ListSkeleton } from '@/components/ui/shimmer-skeleton'

export default function DocumentsLoading() {
    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <Shimmer className="h-8 w-40" />
                <Shimmer className="h-10 w-40 rounded-lg" />
            </div>
            <ListSkeleton rows={6} />
        </div>
    )
}
