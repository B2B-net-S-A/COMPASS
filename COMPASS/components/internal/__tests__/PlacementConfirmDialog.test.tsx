import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlacementWithBonusStatus } from '@/lib/types/placement'

const { mockConfirmPlacementHours, mockToastError, mockToastSuccess } = vi.hoisted(() => ({
    mockConfirmPlacementHours: vi.fn(
        async (): Promise<
            { success: true; data: void } | { success: false; error: string }
        > => ({ success: true, data: undefined }),
    ),
    mockToastError: vi.fn(),
    mockToastSuccess: vi.fn(),
}))

vi.mock('@/lib/actions/placements', () => ({
    confirmPlacementHours: mockConfirmPlacementHours,
}))

vi.mock('@/lib/toast', () => ({
    toast: {
        error: mockToastError,
        success: mockToastSuccess,
    },
}))

import { PlacementConfirmDialog } from '../PlacementConfirmDialog'

function placement(overrides: Partial<PlacementWithBonusStatus> = {}): PlacementWithBonusStatus {
    return {
        id: 'placement-1',
        consultant_name: 'Marcin Szyłko',
        client_name: 'Nordea',
        position: 'Developer',
        start_date: '2026-07-13',
        signing_date: '2026-07-01',
        delivery_lead_id: 'dl-1',
        recruiter_id: 'recruiter-1',
        delivery_lead_raw: 'Marcin Kraszewski',
        recruiter_raw: 'Marlena Rosół',
        cost_rate: 100,
        revenue_rate: 145,
        margin_per_hour: 45,
        monthly_margin: 7560,
        bonus_eligible_date: '2026-08-18',
        dl_bonus_amount: 756,
        recruiter_tier: 2,
        recruiter_bonus_amount: 1500,
        status: 'started',
        hours_confirmed_at: null,
        hours_confirmed_by: null,
        cancelled_at: null,
        cancel_reason: null,
        dl_bonus_id: null,
        additional_dl_bonus_id: null,
        recruiter_bonus_id: null,
        tcm_ticket_id: null,
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:00:00Z',
        dl_bonus_status: null,
        additional_dl_bonus_status: null,
        recruiter_bonus_status: null,
        dl_bonus_actual_amount: null,
        additional_dl_bonus_actual_amount: null,
        recruiter_bonus_actual_amount: null,
        additional_dl_recipient_id: null,
        additional_dl_recipient_name: null,
        ...overrides,
    }
}

function renderDialog(placementOverrides: Partial<PlacementWithBonusStatus> = {}) {
    const onClose = vi.fn()
    const onConfirmed = vi.fn()
    render(
        <PlacementConfirmDialog
            placement={placement(placementOverrides)}
            onClose={onClose}
            onConfirmed={onConfirmed}
        />,
    )
    return { onClose, onConfirmed }
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('<PlacementConfirmDialog /> bonus selection', () => {
    it('keeps ordinary placements at two selected bonuses and preserves the two-bonus payload', async () => {
        const user = userEvent.setup()
        const { onConfirmed } = renderDialog()

        expect(screen.getAllByRole('checkbox')).toHaveLength(2)
        expect(screen.getByRole('checkbox', { name: /Premia Delivery Lead/i })).toBeChecked()
        expect(screen.getByRole('checkbox', { name: /Premia rekrutera/i })).toBeChecked()
        expect(screen.queryByText(/dodatkowy odbiorca/i)).not.toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Generuj 2 premie' }))

        await waitFor(() => {
            expect(mockConfirmPlacementHours).toHaveBeenCalledWith('placement-1', {
                dl: expect.objectContaining({ amount: 756, periodYear: 2026, periodMonth: 8 }),
                recruiter: expect.objectContaining({ amount: 1500, periodYear: 2026, periodMonth: 8 }),
            })
        })
        expect(mockToastSuccess).toHaveBeenCalledWith(
            'Potwierdzono 168h — 2 premie zostały naliczone.',
        )
        expect(onConfirmed).toHaveBeenCalledOnce()
    })

    it('starts an additional DL recipient with a third selected bonus cloned from the DL default', async () => {
        const user = userEvent.setup()
        const { onConfirmed } = renderDialog({
            delivery_lead_id: 'igor-1',
            delivery_lead_raw: 'Igor Twardowski',
            additional_dl_recipient_id: 'marcin-1',
            additional_dl_recipient_name: 'Marcin Kraszewski',
        })

        expect(screen.getAllByRole('checkbox')).toHaveLength(3)
        expect(screen.getByRole('checkbox', { name: 'Nalicz premię: Premia Delivery Lead' })).toBeChecked()
        expect(
            screen.getByRole('checkbox', {
                name: 'Nalicz premię: Premia Delivery Lead — Marcin Kraszewski',
            }),
        ).toBeChecked()
        expect(screen.getByRole('checkbox', { name: /Premia rekrutera/i })).toBeChecked()

        await user.click(screen.getByRole('button', { name: 'Generuj 3 premie' }))

        await waitFor(() => {
            expect(mockConfirmPlacementHours).toHaveBeenCalledWith('placement-1', {
                dl: expect.objectContaining({ amount: 756, periodYear: 2026, periodMonth: 8 }),
                additionalDl: expect.objectContaining({ amount: 756, periodYear: 2026, periodMonth: 8 }),
                recruiter: expect.objectContaining({ amount: 1500, periodYear: 2026, periodMonth: 8 }),
            })
        })
        expect(mockToastSuccess).toHaveBeenCalledWith(
            'Potwierdzono 168h — 3 premie zostały naliczone.',
        )
        expect(onConfirmed).toHaveBeenCalledOnce()
    })

    it('edits the additional DL bonus independently while opting out the primary DL', async () => {
        const user = userEvent.setup()
        renderDialog({
            delivery_lead_id: 'igor-1',
            delivery_lead_raw: 'Igor Twardowski',
            additional_dl_recipient_id: 'marcin-1',
            additional_dl_recipient_name: 'Marcin Kraszewski',
        })

        const amounts = screen.getAllByLabelText('Kwota [PLN]')
        const additionalAmount = amounts[1]
        expect(additionalAmount).toHaveValue(756)
        await user.clear(additionalAmount)
        await user.type(additionalAmount, '900')

        await user.click(screen.getByRole('checkbox', { name: 'Nalicz premię: Premia Delivery Lead' }))
        expect(screen.getByText(/Premia dla Igor Twardowski nie zostanie naliczona/)).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Generuj 2 premie' }))

        await waitFor(() => {
            expect(mockConfirmPlacementHours).toHaveBeenCalledWith('placement-1', {
                dl: null,
                additionalDl: expect.objectContaining({ amount: 900 }),
                recruiter: expect.objectContaining({ amount: 1500 }),
            })
        })
    })

    it('submits an explicit null when the additional DL bonus is unchecked', async () => {
        const user = userEvent.setup()
        renderDialog({
            delivery_lead_id: 'igor-1',
            delivery_lead_raw: 'Igor Twardowski',
            additional_dl_recipient_id: 'marcin-1',
            additional_dl_recipient_name: 'Marcin Kraszewski',
        })

        await user.click(
            screen.getByRole('checkbox', {
                name: 'Nalicz premię: Premia Delivery Lead — Marcin Kraszewski',
            }),
        )
        expect(screen.getByText(/Premia dla Marcin Kraszewski nie zostanie naliczona/)).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Generuj 2 premie' }))

        await waitFor(() => {
            expect(mockConfirmPlacementHours).toHaveBeenCalledWith('placement-1', {
                dl: expect.objectContaining({ amount: 756 }),
                additionalDl: null,
                recruiter: expect.objectContaining({ amount: 1500 }),
            })
        })
    })

    it('blocks an additional-DL placement when all three bonuses are unchecked', async () => {
        const user = userEvent.setup()
        renderDialog({
            delivery_lead_id: 'igor-1',
            delivery_lead_raw: 'Igor Twardowski',
            additional_dl_recipient_id: 'marcin-1',
            additional_dl_recipient_name: 'Marcin Kraszewski',
        })

        await user.click(screen.getByRole('checkbox', { name: 'Nalicz premię: Premia Delivery Lead' }))
        await user.click(
            screen.getByRole('checkbox', {
                name: 'Nalicz premię: Premia Delivery Lead — Marcin Kraszewski',
            }),
        )
        await user.click(screen.getByRole('checkbox', { name: /Premia rekrutera/i }))

        expect(screen.getByRole('alert')).toHaveTextContent('Wybierz co najmniej jedną premię.')
        expect(screen.getByRole('button', { name: 'Wybierz premię' })).toBeDisabled()
        expect(mockConfirmPlacementHours).not.toHaveBeenCalled()
    })

    it('can skip the DL bonus without validating or submitting its draft', async () => {
        const user = userEvent.setup()
        renderDialog()

        const dlAmount = document.querySelector<HTMLInputElement>('#premia-delivery-lead-amount')
        expect(dlAmount).not.toBeNull()
        await user.clear(dlAmount!)
        await user.click(screen.getByRole('checkbox', { name: /Premia Delivery Lead/i }))

        expect(screen.getByText(/Premia dla Marcin Kraszewski nie zostanie naliczona/)).toBeInTheDocument()
        expect(document.querySelector('#premia-delivery-lead-amount')).toBeNull()
        await user.click(screen.getByRole('button', { name: 'Generuj wybraną premię' }))

        await waitFor(() => {
            expect(mockConfirmPlacementHours).toHaveBeenCalledWith('placement-1', {
                dl: null,
                recruiter: expect.objectContaining({ amount: 1500 }),
            })
        })
        expect(mockToastError).not.toHaveBeenCalled()
        expect(mockToastSuccess).toHaveBeenCalledWith(
            'Potwierdzono 168h — wybrana premia została naliczona.',
        )
    })

    it('can independently skip the recruiter bonus', async () => {
        const user = userEvent.setup()
        renderDialog()

        await user.click(screen.getByRole('checkbox', { name: /Premia rekrutera/i }))
        expect(screen.getByText(/Premia dla Marlena Rosół nie zostanie naliczona/)).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Generuj wybraną premię' }))

        await waitFor(() => {
            expect(mockConfirmPlacementHours).toHaveBeenCalledWith('placement-1', {
                dl: expect.objectContaining({ amount: 756 }),
                recruiter: null,
            })
        })
    })

    it('blocks confirmation when both bonuses are deselected', async () => {
        const user = userEvent.setup()
        renderDialog()

        await user.click(screen.getByRole('checkbox', { name: /Premia Delivery Lead/i }))
        await user.click(screen.getByRole('checkbox', { name: /Premia rekrutera/i }))

        expect(screen.getByRole('alert')).toHaveTextContent('Wybierz co najmniej jedną premię.')
        expect(screen.getByRole('button', { name: 'Wybierz premię' })).toBeDisabled()
        expect(mockConfirmPlacementHours).not.toHaveBeenCalled()
    })

    it('shows a readable server rejection and keeps the dialog open', async () => {
        const user = userEvent.setup()
        mockConfirmPlacementHours.mockResolvedValueOnce({
            success: false,
            error: '168h zostało już potwierdzone. Odśwież listę placementów.',
        })
        const { onConfirmed } = renderDialog()

        await user.click(screen.getByRole('button', { name: 'Generuj 2 premie' }))

        await waitFor(() => {
            expect(mockToastError).toHaveBeenCalledWith(
                '168h zostało już potwierdzone. Odśwież listę placementów.',
            )
        })
        expect(mockToastSuccess).not.toHaveBeenCalled()
        expect(onConfirmed).not.toHaveBeenCalled()
    })
})
