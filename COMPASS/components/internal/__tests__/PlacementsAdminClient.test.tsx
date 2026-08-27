import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlacementWithBonusStatus } from '@/lib/types/placement'

vi.mock('@/lib/actions/placements', () => ({
    cancelPlacement: vi.fn(),
    deletePlacementBonus: vi.fn(),
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
        recruiter_bonus_id: 'recruiter-bonus-1',
        tcm_ticket_id: null,
        created_at: '2026-07-01T10:00:00Z',
        updated_at: '2026-08-18T10:00:00Z',
        dl_bonus_status: null,
        recruiter_bonus_status: 'assigned',
        dl_bonus_actual_amount: null,
        recruiter_bonus_actual_amount: 1600,
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
})
