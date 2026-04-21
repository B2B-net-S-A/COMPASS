'use client'

import { cn } from '@/lib/utils'

/**
 * Shimmer Skeleton System
 * Professional shimmer wave animation for loading states.
 * Replaces plain animate-pulse with a moving gradient sweep.
 *
 * Performance: Pure CSS — zero JS runtime, GPU-accelerated.
 * Duration: 1.2s cycle (optimal for perceived loading speed).
 */

// Base shimmer block — the building brick
export function Shimmer({ className }: { className?: string }) {
    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-md bg-slate-700/20',
                className
            )}
        >
            <div className="shimmer-wave absolute inset-0" />
        </div>
    )
}

// Dashboard welcome panel skeleton
export function WelcomeSkeleton() {
    return (
        <div className="bg-gradient-to-r from-blue-900/40 to-slate-900/40 border border-white/10 rounded-xl p-6 flex items-center gap-4">
            <Shimmer className="w-16 h-16 rounded-full shrink-0" />
            <div className="space-y-2 flex-1">
                <Shimmer className="h-7 w-64" />
                <Shimmer className="h-4 w-40" />
            </div>
            <div className="hidden md:flex items-center gap-6">
                <div className="space-y-2">
                    <Shimmer className="h-3 w-20 ml-auto" />
                    <Shimmer className="h-6 w-24 ml-auto" />
                </div>
                <div className="space-y-2">
                    <Shimmer className="h-3 w-16 ml-auto" />
                    <Shimmer className="h-7 w-20 ml-auto" />
                </div>
            </div>
        </div>
    )
}

// Stat card skeleton (for dashboard stat cards: Konsultanci, Projekty, etc.)
export function StatCardSkeleton() {
    return (
        <div className="bg-card border border-white/10 rounded-xl p-6 space-y-3">
            <div className="flex items-center justify-between">
                <Shimmer className="h-4 w-28" />
                <Shimmer className="h-8 w-8 rounded-lg" />
            </div>
            <Shimmer className="h-9 w-16" />
            <Shimmer className="h-3 w-36" />
        </div>
    )
}

// Dashboard grid skeleton (4 stat cards)
export function DashboardStatsSkeleton() {
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
                <StatCardSkeleton key={i} />
            ))}
        </div>
    )
}

// Card skeleton with configurable lines
export function CardShimmer({ lines = 3, className }: { lines?: number; className?: string }) {
    return (
        <div className={cn('bg-card border border-white/10 rounded-xl p-6 space-y-4', className)}>
            <Shimmer className="h-5 w-1/2" />
            <div className="space-y-2">
                {Array.from({ length: lines }).map((_, i) => (
                    <Shimmer
                        key={i}
                        className={cn('h-4', i === lines - 1 ? 'w-3/5' : 'w-full')}
                    />
                ))}
            </div>
        </div>
    )
}

// Table/list skeleton with rows
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="space-y-2">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30">
                    <Shimmer className="w-10 h-10 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                        <Shimmer className="h-4 w-2/5" />
                        <Shimmer className="h-3 w-3/5" />
                    </div>
                    <Shimmer className="h-8 w-16 rounded-md" />
                </div>
            ))}
        </div>
    )
}

// Full page skeleton (welcome + stats + cards)
export function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            <WelcomeSkeleton />
            <DashboardStatsSkeleton />
            <div className="grid gap-4 md:grid-cols-2">
                <CardShimmer lines={4} />
                <CardShimmer lines={3} />
            </div>
        </div>
    )
}

// Projects list skeleton
export function ProjectsListSkeleton() {
    return (
        <div className="space-y-6">
            {/* Header + search */}
            <div className="flex items-center justify-between">
                <Shimmer className="h-8 w-48" />
                <Shimmer className="h-10 w-64 rounded-lg" />
            </div>
            {/* Filter tabs */}
            <div className="flex gap-2">
                {[1, 2, 3, 4].map((i) => (
                    <Shimmer key={i} className="h-9 w-24 rounded-full" />
                ))}
            </div>
            {/* Project cards grid */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="bg-card border border-white/10 rounded-xl p-5 space-y-4">
                        <div className="flex items-center justify-between">
                            <Shimmer className="h-5 w-32" />
                            <Shimmer className="h-6 w-16 rounded-full" />
                        </div>
                        <Shimmer className="h-4 w-full" />
                        <Shimmer className="h-4 w-3/4" />
                        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                            <Shimmer className="h-6 w-6 rounded-full" />
                            <Shimmer className="h-3 w-20" />
                            <Shimmer className="h-3 w-24 ml-auto" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// Messages/inbox skeleton
export function MessagesSkeleton() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <Shimmer className="h-8 w-40" />
                <div className="flex gap-2">
                    <Shimmer className="h-10 w-32 rounded-lg" />
                    <Shimmer className="h-10 w-10 rounded-lg" />
                </div>
            </div>
            {/* Message list */}
            <div className="bg-card border border-white/10 rounded-xl divide-y divide-white/5">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                    <div key={i} className="flex items-center gap-3 p-4">
                        <Shimmer className="w-10 h-10 rounded-full shrink-0" />
                        <div className="flex-1 space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Shimmer className="h-4 w-32" />
                                <Shimmer className="h-3 w-16" />
                            </div>
                            <Shimmer className="h-3 w-4/5" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

// Notifications skeleton
export function NotificationsSkeleton() {
    return (
        <div className="space-y-6">
            {/* Header + filters */}
            <div className="flex items-center justify-between">
                <Shimmer className="h-8 w-48" />
                <Shimmer className="h-10 w-40 rounded-lg" />
            </div>
            <div className="flex gap-2">
                {[1, 2, 3].map((i) => (
                    <Shimmer key={i} className="h-9 w-24 rounded-full" />
                ))}
            </div>
            {/* Notification items */}
            <div className="space-y-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="bg-card border border-white/10 rounded-xl p-4 flex items-start gap-3">
                        <Shimmer className="w-10 h-10 rounded-lg shrink-0" />
                        <div className="flex-1 space-y-2">
                            <Shimmer className="h-4 w-3/5" />
                            <Shimmer className="h-3 w-4/5" />
                            <Shimmer className="h-3 w-20" />
                        </div>
                        <Shimmer className="h-8 w-8 rounded-md shrink-0" />
                    </div>
                ))}
            </div>
        </div>
    )
}

// Admin panel skeleton
export function AdminPanelSkeleton() {
    return (
        <div className="space-y-6">
            <WelcomeSkeleton />
            <DashboardStatsSkeleton />
            {/* Tabs */}
            <div className="flex gap-2 border-b border-white/10 pb-2">
                {[1, 2, 3, 4, 5].map((i) => (
                    <Shimmer key={i} className="h-9 w-28 rounded-md" />
                ))}
            </div>
            <CardShimmer lines={6} />
        </div>
    )
}
