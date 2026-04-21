'use client'

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, Trophy, Minus } from 'lucide-react'
import type { CategoryBreakdown } from '@/lib/actions/loyalty'

const CATEGORY_ICONS: Record<string, string> = {
    Performance: '⚡',
    Loyalty: '💎',
    Compass: '🧭',
    Quality: '✅',
    Recruitment: '🤝',
    Development: '📚',
    Inne: '📌',
}

interface Props {
    categories: CategoryBreakdown[]
    showUnearned?: boolean
}

export function LoyaltyCategoryBreakdown({ categories, showUnearned = true }: Props) {
    const [expandedCategory, setExpandedCategory] = useState<string | null>(
        categories.length > 0 ? categories[0].category : null
    )

    const toggle = (cat: string) => {
        setExpandedCategory(prev => prev === cat ? null : cat)
    }

    return (
        <div className="space-y-2">
            {categories.map(cat => {
                const isExpanded = expandedCategory === cat.category
                const icon = CATEGORY_ICONS[cat.category] || '📌'
                const earnedItems = cat.items.filter(i => i.count > 0)
                const unearnedItems = cat.items.filter(i => i.count === 0)

                return (
                    <div key={cat.category} className="border rounded-lg overflow-hidden">
                        <button
                            onClick={() => toggle(cat.category)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                        >
                            <span className="text-lg">{icon}</span>
                            <span className="flex-1 font-medium text-sm">{cat.category}</span>
                            <Badge variant="secondary" className="font-mono text-xs">
                                {cat.totalPoints.toLocaleString('pl-PL')} pkt
                            </Badge>
                            {cat.percentage > 0 && (
                                <span className="text-xs text-muted-foreground w-10 text-right">{cat.percentage}%</span>
                            )}
                            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                        </button>

                        {isExpanded && (
                            <div className="border-t bg-muted/20">
                                {earnedItems.map(item => (
                                    <div key={item.sourceType} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0">
                                        <Trophy className="h-4 w-4 text-primary shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium">{item.label}</p>
                                            {item.description && (
                                                <p className="text-xs text-muted-foreground">{item.description}</p>
                                            )}
                                        </div>
                                        <span className="text-xs text-muted-foreground shrink-0">{item.count}×</span>
                                        <Badge variant="default" className="font-mono text-xs shrink-0">
                                            {item.totalPoints.toLocaleString('pl-PL')}
                                        </Badge>
                                        {item.lastEarned && (
                                            <span className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">
                                                {new Date(item.lastEarned).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })}
                                            </span>
                                        )}
                                    </div>
                                ))}

                                {showUnearned && unearnedItems.length > 0 && (
                                    <>
                                        {earnedItems.length > 0 && (
                                            <div className="px-4 py-1.5 bg-muted/40">
                                                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                                                    Dostępne do zdobycia
                                                </p>
                                            </div>
                                        )}
                                        {unearnedItems.map(item => (
                                            <div key={item.sourceType} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 opacity-50">
                                                <Minus className="h-4 w-4 text-muted-foreground shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm">{item.label}</p>
                                                    {item.description && (
                                                        <p className="text-xs text-muted-foreground">{item.description}</p>
                                                    )}
                                                </div>
                                                <span className="text-xs text-muted-foreground shrink-0">0×</span>
                                                <Badge variant="outline" className="font-mono text-xs shrink-0">
                                                    +{item.rulePoints}/raz
                                                </Badge>
                                            </div>
                                        ))}
                                    </>
                                )}

                                {cat.items.length === 0 && (
                                    <div className="px-4 py-4 text-sm text-muted-foreground text-center">
                                        Brak reguł w tej kategorii
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
