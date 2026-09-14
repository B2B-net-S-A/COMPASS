import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InboxTicketWithMeta, TicketStatus } from '@/lib/types/support'
import { InboxWorkspace } from '../InboxWorkspace'

vi.mock('next/navigation', () => ({
    usePathname: () => '/internal/people',
    useSearchParams: () => new URLSearchParams(window.location.search),
}))
vi.mock('../KanbanBoard', () => ({
    KanbanBoard: ({ initialColumns }: { initialColumns: Record<TicketStatus, InboxTicketWithMeta[]> }) => (
        <div>{Object.entries(initialColumns).map(([status, tickets]) => (
            <section key={status} aria-label={status}>{tickets.map((ticket) => <span key={ticket.id}>{ticket.subject}</span>)}</section>
        ))}</div>
    ),
}))
vi.mock('../NewInboxTicketDialog', () => ({
    NewInboxTicketDialog: ({ categories, triggerLabel }: { categories: Array<{ slug: string }>; triggerLabel: string }) => (
        <button data-categories={categories.map((category) => category.slug).join(',')}>{triggerLabel}</button>
    ),
}))

afterEach(cleanup)

const statuses: TicketStatus[] = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed']
const columns = Object.fromEntries(statuses.map((status) => [status, [
    { id: `m-${status}`, subject: `Marketing ${status}`, category_slug: 'inbox_marketing', status },
    { id: `a-${status}`, subject: `Administracja ${status}`, category_slug: 'inbox_administracja', status },
]])) as Record<TicketStatus, InboxTicketWithMeta[]>
const props = {
    columns,
    categories: [
        { id: 'adm', slug: 'inbox_administracja', name_pl: 'Administracja' },
        { id: 'mkt', slug: 'inbox_marketing', name_pl: 'Marketing' },
    ],
    handlers: [{ id: 'user', full_name: 'Handler', email: 'handler@example.com' }],
    currentUserId: 'user',
}

describe('InboxWorkspace', () => {
    it('switches all five columns to Marketing and back, preserving the People Ops tab', () => {
        window.history.replaceState(null, '', '/internal/people?tab=sprawy')
        const { rerender } = render(<InboxWorkspace {...props} />)
        expect(screen.getByRole('button', { name: 'Wszystkie sprawy (10)' })).toHaveAttribute('aria-pressed', 'true')
        fireEvent.click(screen.getByRole('button', { name: 'Marketing (5)' }))
        expect(window.location.search).toBe('?tab=sprawy&board=marketing')
        rerender(<InboxWorkspace {...props} />)
        for (const status of statuses) {
            expect(screen.getByText(`Marketing ${status}`)).toBeInTheDocument()
            expect(screen.queryByText(`Administracja ${status}`)).not.toBeInTheDocument()
        }
        fireEvent.click(screen.getByRole('button', { name: 'Wszystkie sprawy (10)' }))
        rerender(<InboxWorkspace {...props} />)
        expect(window.location.search).toBe('?tab=sprawy')
        expect(screen.getByText('Administracja closed')).toBeInTheDocument()
        expect(screen.getByText('Marketing closed')).toBeInTheDocument()
    })

    it('opens the shared Marketing URL with a Marketing-only creation form', () => {
        window.history.replaceState(null, '', '/internal/people?tab=sprawy&board=marketing')
        render(<InboxWorkspace {...props} />)
        expect(screen.getByRole('button', { name: 'Marketing (5)' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.getByRole('button', { name: 'Dodaj sprawę Marketingu' })).toHaveAttribute('data-categories', 'inbox_marketing')
    })

    it('updates the filtered board after refresh and supports an empty Marketing board', () => {
        window.history.replaceState(null, '', '/internal/people?tab=sprawy&board=marketing')
        const { rerender } = render(<InboxWorkspace {...props} />)
        const refreshed = { ...columns, open: columns.open.filter((ticket) => ticket.category_slug !== 'inbox_marketing') }
        rerender(<InboxWorkspace {...props} columns={refreshed} />)
        expect(screen.getByRole('button', { name: 'Marketing (4)' })).toBeInTheDocument()
        expect(screen.queryByText('Marketing open')).not.toBeInTheDocument()
        const empty = Object.fromEntries(statuses.map((status) => [status, []])) as Record<TicketStatus, InboxTicketWithMeta[]>
        rerender(<InboxWorkspace {...props} columns={empty} />)
        expect(screen.getByRole('button', { name: 'Marketing (0)' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Dodaj sprawę Marketingu' })).toBeInTheDocument()
    })
})
