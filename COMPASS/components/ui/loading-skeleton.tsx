export function LoadingSkeleton() {
    return (
        <div className="space-y-4 animate-pulse">
            <div className="h-8 bg-slate-700/50 rounded w-1/3"></div>
            <div className="h-4 bg-slate-700/30 rounded w-2/3"></div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-32 bg-slate-700/20 rounded-lg"></div>
                ))}
            </div>
        </div>
    )
}

export function CardSkeleton() {
    return (
        <div className="bg-card border border-white/10 rounded-lg p-6 animate-pulse">
            <div className="h-6 bg-slate-700/50 rounded w-1/2 mb-4"></div>
            <div className="space-y-2">
                <div className="h-4 bg-slate-700/30 rounded w-full"></div>
                <div className="h-4 bg-slate-700/30 rounded w-3/4"></div>
            </div>
        </div>
    )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
    return (
        <div className="space-y-3 animate-pulse">
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} className="h-12 bg-slate-700/20 rounded"></div>
            ))}
        </div>
    )
}
