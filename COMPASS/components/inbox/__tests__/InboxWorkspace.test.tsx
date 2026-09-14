import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ticket } from '@/lib/inbox/__tests__/fixtures'
import { groupInboxTickets } from '@/lib/inbox/workspace'
import type { InboxTicketWithMeta, TicketStatus } from '@/lib/types/support'
import { InboxWorkspace } from '../InboxWorkspace'
vi.mock('next/navigation', () => ({ usePathname: () => '/internal/people', useSearchParams: () => new URLSearchParams(window.location.search) }))
vi.mock('../InboxCaseEditor', () => ({ fieldClass: '' }))
vi.mock('../InboxCasePanel', () => ({ InboxCasePanel: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>Zamknij szczegóły</button> }))
vi.mock('../KanbanBoard', () => ({ KanbanBoard: ({ initialColumns, columnOrder, onOpenTicket }: { initialColumns: Record<TicketStatus, InboxTicketWithMeta[]>; columnOrder: TicketStatus[]; onOpenTicket: (id: string) => void }) => <div>{columnOrder.map((status) => <section key={status} aria-label={status}>{initialColumns[status].map((item) => <button key={item.id} onClick={() => onOpenTicket(item.id)}>{item.subject}</button>)}</section>)}</div> }))
vi.mock('../NewInboxTicketDialog', () => ({ NewInboxTicketDialog: ({ categories, triggerLabel, defaultArea }: { categories: Array<{ slug: string }>; triggerLabel: string; defaultArea: string }) => <button data-area={defaultArea} data-categories={categories.map((category) => category.slug).join(',')}>{triggerLabel}</button> }))
afterEach(cleanup)
const marketing = ticket({ id: 'm', subject: 'Marketing aktywna', meta: { ...ticket().meta, work_area: 'marketing' } })
const props = { columns: groupInboxTickets([marketing, ticket({ subject: 'Administracja aktywna' }), ticket({ id: 'closed', subject: 'Administracja zakończona', status: 'closed' })]), categories: [{ id: ticket().category_id, slug: 'inbox_grafika', name_pl: 'Grafika' }, { id: 'mkt', slug: 'inbox_marketing', name_pl: 'Marketing' }], handlers: [{ id: 'user', full_name: 'Handler', email: 'handler@example.com' }], currentUserId: 'user' }
describe('InboxWorkspace', () => {
    it('switches areas and archive while preserving the People Ops route', () => {
        window.history.replaceState(null, '', '/internal/people?tab=sprawy')
        const { rerender } = render(<InboxWorkspace {...props} />)
        expect(screen.getByRole('button', { name: 'Wszystkie sprawy' })).toHaveAttribute('aria-pressed', 'true')
        expect(screen.queryByText('Administracja zakończona')).not.toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Marketing' }))
        rerender(<InboxWorkspace {...props} />)
        expect(window.location.search).toBe('?tab=sprawy&board=marketing')
        expect(screen.queryByText('Administracja aktywna')).not.toBeInTheDocument()
        expect(screen.getByText('Marketing aktywna')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Wszystkie sprawy' }))
        rerender(<InboxWorkspace {...props} />)
        fireEvent.click(screen.getByRole('button', { name: 'Archiwum (1)' }))
        rerender(<InboxWorkspace {...props} />)
        expect(screen.getByText('Administracja zakończona')).toBeInTheDocument()
        expect(screen.queryByText('Administracja aktywna')).not.toBeInTheDocument()
    })
    it('prefills Marketing while keeping the independent case types available', () => {
        window.history.replaceState(null, '', '/internal/people?tab=sprawy&board=marketing')
        render(<InboxWorkspace {...props} />)
        const create = screen.getByRole('button', { name: 'Dodaj sprawę Marketingu' })
        expect(create).toHaveAttribute('data-area', 'marketing')
        expect(create).toHaveAttribute('data-categories', 'inbox_grafika,inbox_marketing')
    })
    it('preserves filters when closing the side panel and clears them on demand', () => {
        window.history.replaceState(null, '', '/internal/people?tab=sprawy&board=marketing&q=aktywna&sort=priority')
        const { rerender } = render(<InboxWorkspace {...props} />)
        fireEvent.click(screen.getByRole('button', { name: 'Marketing aktywna' }))
        fireEvent.click(screen.getByRole('button', { name: 'Zamknij szczegóły' }))
        expect(screen.getByLabelText('Szukaj sprawy')).toHaveValue('aktywna')
        expect(screen.getByLabelText('Sortowanie')).toHaveValue('priority')
        fireEvent.click(screen.getByRole('button', { name: 'Wyczyść filtry' }))
        rerender(<InboxWorkspace {...props} />)
        expect(window.location.search).toBe('?tab=sprawy&board=marketing')
    })
    it('updates the selected area after a realtime refresh', () => {
        window.history.replaceState(null, '', '/internal/people?tab=sprawy&board=marketing')
        const { rerender } = render(<InboxWorkspace {...props} />)
        rerender(<InboxWorkspace {...props} columns={groupInboxTickets([])} />)
        expect(screen.getByRole('status')).toHaveTextContent('Widoczne sprawy: 0')
        expect(screen.queryByText('Marketing aktywna')).not.toBeInTheDocument()
    })
})
