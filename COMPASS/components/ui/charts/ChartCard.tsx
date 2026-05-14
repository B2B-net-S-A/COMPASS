'use client'

import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

interface ChartCardProps {
    title: string
    subtitle?: string
    children: ReactNode
    className?: string
}

export function ChartCard({ title, subtitle, children, className }: ChartCardProps) {
    return (
        <div
            className={cn(
                'rounded-xl border bg-card/80 backdrop-blur-sm p-4 sm:p-5 card-hover',
                className,
            )}
        >
            <div className="mb-3 sm:mb-4">
                <h3 className="text-sm font-semibold">{title}</h3>
                {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
            <div className="w-full">{children}</div>
        </div>
    )
}
