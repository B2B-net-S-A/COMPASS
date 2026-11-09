import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditionClosingScreen } from '../sessions/EditionClosingScreen'
import type { ClosingStep } from '@/lib/academy/edition-closing'

const mocks = vi.hoisted(() => ({ notify: vi.fn(), confirm: vi.fn(), refresh: vi.fn() }))
vi.mock('@/lib/actions/academy-edition-closing', () => ({ notifyEditionClosed: mocks.notify }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock('@/components/shared/ConfirmDialog', () => ({ useConfirm: () => [mocks.confirm, () => null] }))
beforeEach(() => { vi.clearAllMocks(); mocks.confirm.mockResolvedValue(true) })
afterEach(cleanup)

const steps: ClosingStep[] = [
    { key: 'list', title: 'Lista', state: 'done', stateLabel: 'Gotowe', detail: 'Na liście 3.', actionLabel: 'Wczytaj', actionHref: '/x#import-webinaru' },
    { key: 'messages', title: 'Wiadomości po szkoleniu', state: 'off', stateLabel: 'Wysyłka wyłączona', detail: 'Adresaci.' },
]

describe('EditionClosingScreen', () => {
    it('counts finished steps, links to panels and hides the counter without data', () => {
        render(<EditionClosingScreen runId="r" steps={steps} counter={null} sessionsEnded />)
        expect(screen.getByText('1 z 2 kroków')).toBeInTheDocument()
        expect(screen.getByRole('link', { name: 'Wczytaj' })).toHaveAttribute('href', '/x#import-webinaru')
        expect(screen.queryByText(/Licznik operacji/)).not.toBeInTheDocument()
    })
    it('keeps preview and approval of outgoing messages inactive', () => {
        render(<EditionClosingScreen runId="r" steps={steps} counter={{ count: 3, minutes: 26 }} sessionsEnded />)
        expect(screen.getByRole('button', { name: 'Zatwierdź do wysyłki' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Podejrzyj' })).toBeDisabled()
        expect(screen.getByText('Licznik operacji: 3, 26 min')).toBeInTheDocument()
    })
    it('blocks the bell while sessions are still ahead', () => {
        render(<EditionClosingScreen runId="r" steps={steps} counter={null} sessionsEnded={false} />)
        expect(screen.getByRole('button', { name: 'Powiadom w aplikacji' })).toBeDisabled()
        expect(screen.getByText(/po zakończeniu wszystkich spotkań/)).toBeInTheDocument()
    })
    it('asks before notifying and reports the number of people', async () => {
        mocks.notify.mockResolvedValue({ success: true, data: { notified: 41 } })
        render(<EditionClosingScreen runId="r" steps={steps} counter={null} sessionsEnded />)
        fireEvent.click(screen.getByRole('button', { name: 'Powiadom w aplikacji' }))
        await waitFor(() => expect(mocks.notify).toHaveBeenCalledWith('r'))
        expect(mocks.confirm).toHaveBeenCalledOnce()
        expect(await screen.findByRole('status')).toHaveTextContent('Powiadomiono w aplikacji: 41.')
    })
    it('does nothing when the confirmation is declined', async () => {
        mocks.confirm.mockResolvedValue(false)
        render(<EditionClosingScreen runId="r" steps={steps} counter={null} sessionsEnded />)
        fireEvent.click(screen.getByRole('button', { name: 'Powiadom w aplikacji' }))
        await waitFor(() => expect(mocks.confirm).toHaveBeenCalled())
        expect(mocks.notify).not.toHaveBeenCalled()
    })
    it('shows a pending migration as a message, not a failure', async () => {
        mocks.notify.mockResolvedValue({ success: false, error: 'Ta funkcja czeka na migrację bazy danych.' })
        render(<EditionClosingScreen runId="r" steps={steps} counter={null} sessionsEnded />)
        fireEvent.click(screen.getByRole('button', { name: 'Powiadom w aplikacji' }))
        expect(await screen.findByRole('alert')).toHaveTextContent('czeka na migrację')
    })
})
