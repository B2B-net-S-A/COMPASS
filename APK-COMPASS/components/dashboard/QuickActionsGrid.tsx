'use client'

import { Card, CardContent } from '@/components/ui/card'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface QuickAction {
    id: string
    title_pl: string
    title_en: string
    description_pl: string
    description_en: string
    icon: string
    url: string
    priority: string
}

interface QuickActionsGridProps {
    actions?: QuickAction[]
    locale?: 'pl' | 'en'
    onActionClick?: (id: string) => void
}

const priorityColors = {
    high: 'border-l-4 border-l-primary hover:border-l-burgundy',
    normal: 'border-l-4 border-l-gray-300 hover:border-l-gray-400',
    low: 'border-l-4 border-l-gray-200 hover:border-l-gray-300'
}

export function QuickActionsGrid({ actions = [], locale = 'pl', onActionClick }: QuickActionsGridProps) {
    const t = locale === 'pl' ? {
        title: 'Szybkie Akcje',
        noActions: 'Brak dostępnych akcji'
    } : {
        title: 'Quick Actions',
        noActions: 'No actions available'
    }

    if (actions.length === 0) {
        return (
            <Card>
                <CardContent className="pt-6">
                    <div className="text-center py-4">
                        <p className="text-sm text-muted-foreground">{t.noActions}</p>
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <div className="space-y-3">
            {actions.map((action) => {
                const CardElement = (
                    <Card
                        className={cn(
                            'transition-all hover:shadow-md cursor-pointer group',
                            priorityColors[action.priority as keyof typeof priorityColors]
                        )}
                    >
                        <CardContent className="p-4">
                            <div className="flex items-center gap-3">
                                {/* Icon */}
                                <div className="flex-shrink-0 text-3xl">
                                    {action.icon}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-semibold text-sm group-hover:text-burgundy dark:group-hover:text-slate-200 transition-colors">
                                        {locale === 'pl' ? action.title_pl : action.title_en}
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                        {locale === 'pl' ? action.description_pl : action.description_en}
                                    </p>
                                </div>

                                {/* Arrow */}
                                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-burgundy dark:group-hover:text-slate-200 group-hover:translate-x-1 transition-all flex-shrink-0" />
                            </div>
                        </CardContent>
                    </Card>
                )

                if (onActionClick && (action.id === 'recommend_friend')) {
                    return (
                        <div key={action.id} onClick={() => onActionClick(action.id)}>
                            {CardElement}
                        </div>
                    )
                }

                return (
                    <Link key={action.id} href={action.url}>
                        {CardElement}
                    </Link>
                )
            })}
        </div>
    )
}
