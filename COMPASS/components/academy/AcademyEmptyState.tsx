import type { ReactNode } from 'react'
import { BookOpen, Search, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AcademyEmptyStateProps {
    title: string
    description: string
    action?: ReactNode
    variant?: 'empty' | 'filtered' | 'error'
}

export function AcademyEmptyState({ title, description, action, variant = 'empty' }: AcademyEmptyStateProps) {
    const Icon = variant === 'error' ? TriangleAlert : variant === 'filtered' ? Search : BookOpen
    return (
        <div role={variant === 'error' ? 'alert' : undefined} className={cn('flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center', variant === 'error' && 'border-destructive/30 bg-destructive/5')}>
            <span className={cn('mb-5 rounded-2xl bg-muted p-4 text-muted-foreground', variant === 'error' && 'bg-destructive/10 text-destructive')}>
                <Icon className="size-7" aria-hidden="true" />
            </span>
            <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
            {action && <div className="mt-6">{action}</div>}
        </div>
    )
}
