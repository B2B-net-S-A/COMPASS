'use client'

import { useMemo } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { KanbanBoard } from './KanbanBoard'
import { NewInboxTicketDialog } from './NewInboxTicketDialog'
import type { InboxTicketWithMeta, TicketStatus } from '@/lib/types/support'

interface InboxWorkspaceProps {
    columns: Record<TicketStatus, InboxTicketWithMeta[]>
    categories: Array<{ id: string; slug: string; name_pl: string }>
    handlers: Array<{ id: string; full_name: string | null; email: string }>
    currentUserId: string
}

export function InboxWorkspace({ columns, categories, handlers, currentUserId }: InboxWorkspaceProps) {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const board = searchParams.get('board') === 'marketing' ? 'marketing' : 'all'
    const marketingCategories = categories.filter((category) => category.slug === 'inbox_marketing')
    const marketingColumns = useMemo(() => Object.fromEntries(
        Object.entries(columns).map(([status, tickets]) => [
            status, tickets.filter((ticket) => ticket.category_slug === 'inbox_marketing'),
        ])
    ) as Record<TicketStatus, InboxTicketWithMeta[]>, [columns])
    const totalCount = Object.values(columns).reduce((sum, tickets) => sum + tickets.length, 0)
    const marketingCount = Object.values(marketingColumns).reduce((sum, tickets) => sum + tickets.length, 0)
    const formCategories = board === 'marketing' ? marketingCategories : categories
    const canAdd = handlers.length > 0 && formCategories.length > 0 && currentUserId !== ''

    function selectBoard(value: 'all' | 'marketing') {
        const params = new URLSearchParams(searchParams.toString())
        if (value === 'marketing') params.set('board', 'marketing')
        else params.delete('board')
        const query = params.toString()
        // Next synchronizes useSearchParams with native history. No refetch is
        // needed: both views use the same tickets and realtime subscription.
        window.history.pushState(null, '', `${pathname}${query ? `?${query}` : ''}`)
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div role="group" aria-label="Widok Kanban" className="flex flex-wrap gap-2">
                    <Button variant={board === 'all' ? 'default' : 'outline'} aria-pressed={board === 'all'} onClick={() => selectBoard('all')}>
                        Wszystkie sprawy ({totalCount})
                    </Button>
                    <Button variant={board === 'marketing' ? 'default' : 'outline'} aria-pressed={board === 'marketing'} onClick={() => selectBoard('marketing')}>
                        Marketing ({marketingCount})
                    </Button>
                </div>
                {canAdd && (
                    <NewInboxTicketDialog
                        key={board}
                        categories={formCategories}
                        handlers={handlers}
                        currentUserId={currentUserId}
                        triggerLabel={board === 'marketing' ? 'Dodaj sprawę Marketingu' : 'Dodaj sprawę'}
                    />
                )}
            </div>
            {board === 'marketing' && (
                <p className="text-sm text-muted-foreground">
                    Sprawy z kategorią Marketing. Są też widoczne na tablicy „Wszystkie sprawy”.
                </p>
            )}
            <KanbanBoard key={board} initialColumns={board === 'marketing' ? marketingColumns : columns} />
        </div>
    )
}
