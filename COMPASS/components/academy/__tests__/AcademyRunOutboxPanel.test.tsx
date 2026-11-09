import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AcademyRunOutboxPanel } from '../sessions/AcademyRunOutboxPanel'

const mocks = vi.hoisted(() => ({ preview: vi.fn(), test: vi.fn(), approve: vi.fn(), confirm: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/actions/academy-run-outbox', () => ({ previewAcademyOutboxMessage: mocks.preview, sendAcademyOutboxTest: mocks.test, approveAcademyRunOutboxBatch: mocks.approve }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => [mocks.confirm, () => null] }))
beforeEach(() => { vi.clearAllMocks(); mocks.confirm.mockResolvedValue(true) })
afterEach(cleanup)

const batch = { batchId: 'b1', kind: 'academy.run_reminder', status: 'held', count: 55, expiresAt: '2027-02-16T09:00:00Z', sampleId: 'm1', subject: 'Przypomnienie: PEGA' }
const state = (patch = {}) => ({ available: true, mailEnabled: false, batches: [batch], ...patch })

describe('AcademyRunOutboxPanel', () => {
    it('keeps approval inactive while sending is off', () => {
        render(<AcademyRunOutboxPanel runId="r" state={state()} />)
        expect(screen.getByRole('button', { name: 'Zatwierdź paczkę' })).toBeDisabled()
        expect(screen.getByText(/Wysyłka wyłączona/)).toBeInTheDocument()
    })
    it('allows approval only with the switch and after confirmation', async () => {
        mocks.approve.mockResolvedValue({ success: true, data: { count: 55 } })
        render(<AcademyRunOutboxPanel runId="r" state={state({ mailEnabled: true })} />)
        fireEvent.click(screen.getByRole('button', { name: 'Zatwierdź paczkę' }))
        await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith({ batchId: 'b1', runId: 'r' }))
        expect(mocks.confirm).toHaveBeenCalledOnce()
    })
    it('does not approve when the person declines', async () => {
        mocks.confirm.mockResolvedValue(false)
        render(<AcademyRunOutboxPanel runId="r" state={state({ mailEnabled: true })} />)
        fireEvent.click(screen.getByRole('button', { name: 'Zatwierdź paczkę' }))
        await waitFor(() => expect(mocks.confirm).toHaveBeenCalled())
        expect(mocks.approve).not.toHaveBeenCalled()
    })
    it('shows message content in a sandboxed frame', async () => {
        mocks.preview.mockResolvedValue({ success: true, data: { subject: 'Temat', html: '<p>treść</p>', recipient: 'a@x.test', expiresAt: 'x' } })
        render(<AcademyRunOutboxPanel runId="r" state={state()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Podejrzyj' }))
        const frame = await screen.findByTitle('Podgląd wiadomości')
        expect(frame).toHaveAttribute('sandbox', '')
        expect(frame).toHaveAttribute('srcdoc', '<p>treść</p>')
    })
    it('shows the refusal of a test to a mailbox outside the owner list', async () => {
        mocks.test.mockResolvedValue({ success: false, error: 'Test wysyła się wyłącznie na skrzynki właściciela.' })
        render(<AcademyRunOutboxPanel runId="r" state={state()} />)
        fireEvent.click(screen.getByRole('button', { name: 'Wyślij test' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('skrzynki właściciela')
    })
    it('offers test and approval only for held rows', () => {
        render(<AcademyRunOutboxPanel runId="r" state={state({ batches: [{ ...batch, status: 'expired' }] })} />)
        expect(screen.queryByRole('button', { name: 'Wyślij test' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Zatwierdź paczkę' })).not.toBeInTheDocument()
        expect(screen.getByText(/Wygasłe/)).toBeInTheDocument()
    })
    it('explains a pending migration and an empty queue', () => {
        const { rerender } = render(<AcademyRunOutboxPanel runId="r" state={state({ available: false })} />)
        expect(screen.getByText(/po zastosowaniu migracji/)).toBeInTheDocument()
        rerender(<AcademyRunOutboxPanel runId="r" state={state({ batches: [] })} />)
        expect(screen.getByText('W kolejce nie ma wiadomości tej edycji.')).toBeInTheDocument()
    })
})
