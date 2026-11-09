import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AcademyRunAudiencePanel } from '../sessions/AcademyRunAudiencePanel'

const mocks = vi.hoisted(() => ({ preview: vi.fn(), save: vi.fn(), confirm: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/actions/academy-run-audience', () => ({ previewAcademyRunAudience: mocks.preview, saveAcademyRunAudience: mocks.save }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => [mocks.confirm, () => null] }))
beforeEach(() => { vi.clearAllMocks(); mocks.confirm.mockResolvedValue(true); mocks.preview.mockResolvedValue({ success: true, data: { count: 55, excludedCount: 3, sample: [{ fullName: 'Anna', email: 'a@example.test' }], clients: [] } }) })
afterEach(cleanup)

const state = { available: true, held: 0, clients: ['Bank'], choice: null }

describe('AcademyRunAudiencePanel', () => {
    it('explains a pending migration instead of offering the form', () => {
        render(<AcademyRunAudiencePanel runId="r" state={{ ...state, available: false }} open />)
        expect(screen.getByText(/po zastosowaniu migracji/)).toBeInTheDocument()
        expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
    it('needs a calculated audience before saving', () => {
        render(<AcademyRunAudiencePanel runId="r" state={state} open />)
        expect(screen.getByRole('button', { name: 'Zapisz adresatów' })).toBeDisabled()
    })
    it('calculates with the chosen filters and exclusions', async () => {
        render(<AcademyRunAudiencePanel runId="r" state={state} open />)
        fireEvent.change(screen.getByLabelText('Klient'), { target: { value: 'Bank' } })
        fireEvent.change(screen.getByLabelText(/Wyklucz adresy/), { target: { value: 'A@example.test\nb@example.test' } })
        fireEvent.click(screen.getByRole('button', { name: 'Policz adresatów' }))
        await waitFor(() => expect(mocks.preview).toHaveBeenCalledWith({ runId: 'r', filter: { includeNexus: true, includeOffice: false, clients: ['Bank'] }, excluded: ['a@example.test', 'b@example.test'] }))
        expect(await screen.findByText('55 osób, wykluczono 3')).toBeInTheDocument()
    })
    it('drops a stale preview when a filter changes, so an old count cannot be saved', async () => {
        render(<AcademyRunAudiencePanel runId="r" state={state} open />)
        fireEvent.click(screen.getByRole('button', { name: 'Policz adresatów' }))
        await screen.findByText('55 osób, wykluczono 3')
        fireEvent.click(screen.getByLabelText('Pracownicy biura'))
        expect(screen.queryByText('55 osób, wykluczono 3')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Zapisz adresatów' })).toBeDisabled()
    })
    it('asks first and reports held rows after saving', async () => {
        mocks.save.mockResolvedValue({ success: true, data: { count: 55, held: 55, duplicates: 0, withdrawn: 0 } })
        render(<AcademyRunAudiencePanel runId="r" state={state} open />)
        fireEvent.click(screen.getByRole('button', { name: 'Policz adresatów' }))
        await screen.findByText('55 osób, wykluczono 3')
        fireEvent.click(screen.getByRole('button', { name: 'Zapisz adresatów' }))
        await waitFor(() => expect(mocks.save).toHaveBeenCalled())
        expect(mocks.confirm.mock.calls[0][0].description).toContain('wstrzymanych')
        expect(await screen.findByRole('status')).toHaveTextContent('W kolejce przybyło 55')
    })
    it('shows who chose last and the queue size', () => {
        render(<AcademyRunAudiencePanel runId="r" state={{ ...state, held: 12, choice: { count: 12, filter: { includeNexus: true, includeOffice: false, clients: [] }, excluded: [], chosenBy: 'Ewa Lis', chosenAt: '2026-11-08T15:00:00Z' } }} open />)
        expect(screen.getByText(/12 osób · Ewa Lis/)).toBeInTheDocument()
        expect(screen.getByText('W kolejce, wstrzymane').parentElement).toHaveTextContent('12')
    })
    it('locks the form when the edition is closed for invitations', () => {
        render(<AcademyRunAudiencePanel runId="r" state={state} open={false} />)
        expect(screen.getByRole('button', { name: 'Policz adresatów' })).toBeDisabled()
        expect(screen.getByText(/przed jej pierwszym spotkaniem/)).toBeInTheDocument()
    })
    it('reports a failed read', () => {
        render(<AcademyRunAudiencePanel runId="r" error="Nie udało się." open />)
        expect(screen.getByRole('alert')).toHaveTextContent('Nie udało się.')
    })
})
