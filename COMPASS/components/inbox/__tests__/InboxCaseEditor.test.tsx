import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InboxCaseEditor } from '../InboxCaseEditor'
import { CaseDeadline } from '../CaseDeadline'
import { ticket } from '@/lib/inbox/__tests__/fixtures'
const { save } = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('@/lib/actions/support-inbox', () => ({ updateInboxWorkspace: save }))
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const item = ticket({ assignee_id: null })
const props = { ticket: item, categories: [{ id: item.category_id, name_pl: 'Grafika', slug: 'inbox_grafika' }], handlers: [], onSaved: vi.fn() }
describe('case editing', () => {
    it('saves independent area, deadline and checklist with the original revision', async () => {
        save.mockResolvedValue({ success: true })
        render(<InboxCaseEditor {...props} />)
        fireEvent.change(screen.getByLabelText('Obszar'), { target: { value: 'marketing' } })
        fireEvent.change(screen.getByLabelText('Termin realizacji'), { target: { value: '2026-10-01' } })
        fireEvent.click(screen.getByRole('button', { name: 'Dodaj punkt' }))
        fireEvent.change(screen.getByLabelText('Punkt 1'), { target: { value: 'Akceptacja projektu' } })
        fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))
        await waitFor(() => expect(save).toHaveBeenCalled())
        expect(save.mock.calls[0][1]).toBe(item.updated_at)
        expect(save.mock.calls[0][2]).toMatchObject({ work_area: 'marketing', planned_due_date: '2026-10-01', category_id: item.category_id, checklist: [{ text: 'Akceptacja projektu', done: false }] })
        await waitFor(() => expect(props.onSaved).toHaveBeenCalled())
    })
    it('preserves a draft during refresh and exposes conflicts instead of overwriting', async () => {
        save.mockResolvedValue({ success: false, error: 'Sprawa została zmieniona przez inną osobę' })
        const { rerender } = render(<InboxCaseEditor {...props} />)
        fireEvent.change(screen.getByLabelText('Tytuł sprawy'), { target: { value: 'Mój szkic' } })
        rerender(<InboxCaseEditor {...props} ticket={{ ...item, subject: 'Zmiana współpracownika', updated_at: '2026-09-14T10:00:00Z' }} />)
        expect(screen.getByLabelText('Tytuł sprawy')).toHaveValue('Mój szkic')
        fireEvent.click(screen.getByRole('button', { name: 'Zapisz zmiany' }))
        await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Sprawa została zmieniona'))
        expect(save.mock.calls[0][1]).toBe(item.updated_at)
        expect(screen.getByLabelText('Tytuł sprawy')).toHaveValue('Mój szkic')
    })
})
describe('deadline badges', () => {
    it('shows the completion date without an overdue label', () => {
        render(<CaseDeadline ticket={ticket({ status: 'resolved', resolved_at: '2026-09-12T10:00:00Z' })} now={new Date('2026-09-14T10:00:00Z')} />)
        expect(screen.getByText(/Rozwiązano 12.09.2026/)).toBeInTheDocument()
        expect(screen.queryByText(/po terminie/)).not.toBeInTheDocument()
    })
})
