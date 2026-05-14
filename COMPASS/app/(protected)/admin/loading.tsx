import { AdminPanelSkeleton } from '@/components/ui/shimmer-skeleton'

export default function AdminLoading() {
    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
            <AdminPanelSkeleton />
        </div>
    )
}
