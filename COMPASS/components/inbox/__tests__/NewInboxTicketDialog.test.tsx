import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { NewInboxTicketDialog } from '../NewInboxTicketDialog'
const { create } = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/lib/actions/support-inbox', () => ({ createInboxTicket: create }))
vi.mock('../InboxCaseEditor', () => ({ fieldClass: '' }))
vi.mock('../ConsultantTypeahead', () => ({ ConsultantTypeahead: () => null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
it('creates a Marketing case with an independent planned date and collapsed contact fields', async () => {
    create.mockResolvedValue({ success: true, data: { ticketId: 'new' } })
    render(<NewInboxTicketDialog categories={[{ id: 'marketing', slug: 'inbox_marketing', name_pl: 'Marketing' }]} handlers={[{ id: 'user', full_name: 'Anna', email: 'anna@example.com' }]} currentUserId="user" defaultArea="marketing" />)
    fireEvent.click(screen.getByRole('button', { name: 'Dodaj sprawę' }))
    expect(screen.getByLabelText('Obszar')).toHaveValue('marketing')
    expect(screen.getByText('Dodatkowe dane: email, konsultant, telefon, klient').closest('details')).not.toHaveAttribute('open')
    fireEvent.change(screen.getByLabelText('Tytuł sprawy *'), { target: { value: 'Kampania jesienna' } })
    fireEvent.change(screen.getByLabelText('Treść / opis sprawy *'), { target: { value: 'Przygotować materiały na październik' } })
    fireEvent.change(screen.getByLabelText('Planowany termin'), { target: { value: '2026-10-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Utwórz sprawę' }))
    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({ work_area: 'marketing', planned_due_date: '2026-10-01', category_id: 'marketing', assignee_id: 'user' })))
})
