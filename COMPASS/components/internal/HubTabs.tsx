import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface HubTab {
    id: string
    label: string
    icon: LucideIcon
    /**
     * Opcjonalny licznik „jest tu coś do zrobienia" (Phase 48). Renderowany tylko
     * gdy > 0, żeby zakładki bez zaległości wyglądały jak dotąd.
     */
    badge?: number
}

interface Props {
    basePath: string
    tabs: ReadonlyArray<HubTab>
    active: string
}

/**
 * Server-rendered tab navigation. Each tab is a regular Link to ?tab=<id>,
 * so deep-linking and SSR work without client-side state.
 */
export function HubTabs({ basePath, tabs, active }: Props) {
    return (
        <nav
            role="tablist"
            aria-label="Sekcje strefy wewnętrznej"
            className="border-b border-border flex gap-1 overflow-x-auto -mx-1 px-1"
        >
            {tabs.map((t) => {
                const Icon = t.icon
                const isActive = t.id === active
                return (
                    <Link
                        key={t.id}
                        href={`${basePath}?tab=${t.id}`}
                        role="tab"
                        aria-selected={isActive}
                        className={cn(
                            'relative inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                            'border-b-2 -mb-px',
                            isActive
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                        )}
                    >
                        <Icon className="h-4 w-4" />
                        {t.label}
                        {typeof t.badge === 'number' && t.badge > 0 && (
                            <span
                                aria-label={`${t.badge} do przeglądu`}
                                className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary"
                            >
                                {t.badge}
                            </span>
                        )}
                    </Link>
                )
            })}
        </nav>
    )
}
