import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from '../ConfirmDialog'

afterEach(() => {
    vi.clearAllMocks()
})

const baseProps = {
    title: 'Czy na pewno?',
    description: 'Ta akcja usunie kandydata permanentnie.',
    confirmLabel: 'Usuń',
    cancelLabel: 'Anuluj',
    variant: 'destructive' as const,
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    onOpenChange: vi.fn(),
}

describe('<ConfirmDialog />', () => {
    it('renders nothing when closed (open=false)', () => {
        render(<ConfirmDialog {...baseProps} open={false} />)
        expect(screen.queryByText('Czy na pewno?')).not.toBeInTheDocument()
    })

    it('renders title, description, and both buttons when open=true', () => {
        render(<ConfirmDialog {...baseProps} open={true} />)
        expect(screen.getByText('Czy na pewno?')).toBeInTheDocument()
        expect(screen.getByText(/Ta akcja usunie kandydata/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Usuń' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Anuluj' })).toBeInTheDocument()
    })

    it('calls onConfirm when the confirm button is clicked', async () => {
        const onConfirm = vi.fn()
        render(<ConfirmDialog {...baseProps} open={true} onConfirm={onConfirm} />)
        await userEvent.click(screen.getByRole('button', { name: 'Usuń' }))
        expect(onConfirm).toHaveBeenCalledTimes(1)
    })

    it('calls onCancel when the cancel button is clicked', async () => {
        const onCancel = vi.fn()
        render(<ConfirmDialog {...baseProps} open={true} onCancel={onCancel} />)
        await userEvent.click(screen.getByRole('button', { name: 'Anuluj' }))
        expect(onCancel).toHaveBeenCalledTimes(1)
    })

    it('confirm button has destructive (red) class when variant=destructive', () => {
        render(<ConfirmDialog {...baseProps} open={true} variant="destructive" />)
        const btn = screen.getByRole('button', { name: 'Usuń' })
        expect(btn.className).toMatch(/bg-red/)
    })

    it('confirm button does NOT have destructive class for default variant', () => {
        render(<ConfirmDialog {...baseProps} open={true} variant="default" confirmLabel="OK" />)
        const btn = screen.getByRole('button', { name: 'OK' })
        expect(btn.className).not.toMatch(/bg-red/)
    })
})
