import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlacementWithBonusStatus } from '@/lib/types/placement'

const { mockConfirmPlacementHours, mockToastError, mockToastSuccess } = vi.hoisted(() => ({
    mockConfirmPlacementHours: vi.fn(async () => {}),
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

function placement(): PlacementWithBonusStatus {
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
        recruiter_bonus_id: null,
        tcm_ticket_id: null,
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-07-01T10:00:00Z',
        dl_bonus_status: null,
        recruiter_bonus_status: null,
        dl_bonus_actual_amount: null,
        recruiter_bonus_actual_amount: null,
    }
}

function renderDialog() {
    const onClose = vi.fn()
    const onConfirmed = vi.fn()
    render(
        <PlacementConfirmDialog
            placement={placement()}
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
    it('starts with both bonuses selected and preserves the two-bonus payload', async () => {
        const user = userEvent.setup()
        const { onConfirmed } = renderDialog()

        expect(screen.getByRole('checkbox', { name: /Premia Delivery Lead/i })).toBeChecked()
        expect(screen.getByRole('checkbox', { name: /Premia rekrutera/i })).toBeChecked()

        await user.click(screen.getByRole('button', { name: 'Generuj obie premie' }))

        await waitFor(() => {
            expect(mockConfirmPlacementHours).toHaveBeenCalledWith('placement-1', {
                dl: expect.objectContaining({ amount: 756, periodYear: 2026, periodMonth: 8 }),
                recruiter: expect.objectContaining({ amount: 1500, periodYear: 2026, periodMonth: 8 }),
            })
        })
        expect(mockToastSuccess).toHaveBeenCalledWith(
            'Potwierdzono 168h — obie premie zostały naliczone.',
        )
        expect(onConfirmed).toHaveBeenCalledOnce()
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
})
