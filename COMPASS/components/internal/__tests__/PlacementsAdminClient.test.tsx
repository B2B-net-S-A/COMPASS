import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlacementWithBonusStatus } from '@/lib/types/placement'

const { mockDeletePlacementBonus, mockToastSuccess } = vi.hoisted(() => ({
    mockDeletePlacementBonus: vi.fn(async () => {}),
    mockToastSuccess: vi.fn(),
}))

vi.mock('@/lib/actions/placements', () => ({
    cancelPlacement: vi.fn(),
    deletePlacementBonus: mockDeletePlacementBonus,
}))

vi.mock('@/lib/toast', () => ({
    toast: {
        error: vi.fn(),
        success: mockToastSuccess,
    },
}))

vi.mock('@/components/internal/PlacementImportDialog', () => ({
    PlacementImportDialog: () => null,
}))

vi.mock('@/components/internal/PlacementConfirmDialog', () => ({
    PlacementConfirmDialog: () => null,
}))

import { PlacementsAdminClient } from '../PlacementsAdminClient'

function confirmedPlacement(): PlacementWithBonusStatus {
    return {
        id: 'placement-1',
        consultant_name: 'Marcin Szyłko',
        client_name: 'Nordea',
        position: 'Developer',
        start_date: '2026-07-13',
        signing_date: null,
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
        status: 'bonus_confirmed',
        hours_confirmed_at: '2026-08-18T10:00:00Z',
        hours_confirmed_by: 'manager-1',
        cancelled_at: null,
        cancel_reason: null,
        dl_bonus_id: null,
        additional_dl_bonus_id: null,
        recruiter_bonus_id: 'recruiter-bonus-1',
        tcm_ticket_id: null,
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-08-18T10:00:00Z',
        dl_bonus_status: null,
        additional_dl_bonus_status: null,
        recruiter_bonus_status: 'assigned',
        dl_bonus_actual_amount: null,
        additional_dl_bonus_actual_amount: null,
        recruiter_bonus_actual_amount: 1600,
        additional_dl_recipient_id: null,
        additional_dl_recipient_name: null,
    }
}

describe('<PlacementsAdminClient /> skipped bonus display', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllGlobals()
    })

    it('shows an explicit opt-out instead of the imported forecast amount', () => {
        render(<PlacementsAdminClient placements={[confirmedPlacement()]} />)

        expect(screen.getByText('Brak aktywnej premii')).toBeInTheDocument()
        expect(screen.queryByText('756 zł')).not.toBeInTheDocument()
        expect(screen.queryByText(/1500|1\s?500/)).not.toBeInTheDocument()
        expect(screen.getByText(/1600|1\s?600/)).toBeInTheDocument()
    })

    it('uses the saved amount rather than the imported forecast in the delete prompt', async () => {
        const user = userEvent.setup()
        const prompt = vi.fn((_message: string, _defaultValue?: string): string | null => null)
        vi.stubGlobal('prompt', prompt)
        render(<PlacementsAdminClient placements={[confirmedPlacement()]} />)

        await user.click(screen.getByRole('button', { name: 'Usuń rekr.' }))

        expect(prompt).toHaveBeenCalledOnce()
        expect(prompt.mock.calls[0]?.[0]).toMatch(/1[\s\u00a0]?600 zł/)
        expect(prompt.mock.calls[0]?.[0]).not.toMatch(/1[\s\u00a0]?500 zł/)
    })

    it('shows and independently deletes the additional DL bonus', async () => {
        const user = userEvent.setup()
        const prompt = vi.fn(
            (_message: string, _defaultValue?: string): string | null => 'Błędnie naliczona premia',
        )
        vi.stubGlobal('prompt', prompt)
        render(
            <PlacementsAdminClient
                placements={[
                    {
                        ...confirmedPlacement(),
                        additional_dl_bonus_id: 'additional-dl-bonus-1',
                        additional_dl_bonus_status: 'assigned',
                        additional_dl_bonus_actual_amount: 800,
                        additional_dl_recipient_id: 'marcin-1',
                        additional_dl_recipient_name: 'Marcin Kraszewski',
                    },
                ]}
            />,
        )

        expect(screen.getByText('Marcin Kraszewski:')).toBeInTheDocument()
        expect(screen.getByText(/800 zł/)).toBeInTheDocument()

        await user.click(screen.getByRole('button', { name: 'Usuń dodatk. DL' }))

        expect(prompt.mock.calls[0]?.[0]).toMatch(/Marcin Kraszewski/)
        expect(prompt.mock.calls[0]?.[0]).toMatch(/800 zł/)
        expect(mockDeletePlacementBonus).toHaveBeenCalledWith({
            placementId: 'placement-1',
            bonusKind: 'additional_dl',
            deletionReason: 'Błędnie naliczona premia',
        })
        expect(mockToastSuccess).toHaveBeenCalledWith('Premia dodatkowego DL usunięta.')
    })

    it('keeps ordinary placements free of additional-DL labels and actions', () => {
        render(<PlacementsAdminClient placements={[confirmedPlacement()]} />)

        expect(screen.queryByText(/Dodatkowy DL|Marcin Kraszewski:/)).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Usuń dodatk. DL' })).not.toBeInTheDocument()
    })
})
