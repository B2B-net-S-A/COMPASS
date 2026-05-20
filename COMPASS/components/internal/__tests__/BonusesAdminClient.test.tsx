import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { BonusWithUsers } from '@/lib/types/bonus'

// updateBonus is the server action under test for the edit flow; control its return per test.
const { mockUpdateBonus } = vi.hoisted(() => ({ mockUpdateBonus: vi.fn() }))

vi.mock('@/lib/actions/internal-bonus', () => ({
    updateBonus: mockUpdateBonus,
    assignBonus: vi.fn(),
    cancelBonus: vi.fn(),
    getBonusAttachmentSignedUrl: vi.fn(),
    uploadBonusAttachment: vi.fn(),
}))

vi.mock('@/lib/actions/internal-clients', () => ({
    listActiveClients: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/toast', () => ({
    toast: { error: vi.fn(), success: vi.fn() },
    toastSuccess: vi.fn(),
}))

vi.mock('@/lib/toast-success', () => ({ toastSuccess: vi.fn() }))

import { BonusesAdminClient } from '../BonusesAdminClient'

function buildBonus(overrides: Partial<BonusWithUsers> = {}): BonusWithUsers {
    return {
        id: 'bonus-1',
        recipient_user_id: 'emp-1',
        proposed_by: 'admin-1',
        amount: 1000,
        currency: 'PLN',
        reason: 'Zatrudnienie Michał Biegała',
        status: 'assigned',
        period_year: 2026,
        period_month: 5,
        linked_invoice_id: null,
        paid_at: null,
        cancelled_at: null,
        cancelled_by: null,
        cancellation_reason: null,
        notes: null,
        created_at: '2026-05-01T10:00:00Z',
        updated_at: '2026-05-01T10:00:00Z',
        category: 'custom',
        client_name: null,
        delivery_candidate_name: null,
        sales_client_name: null,
        sales_service_description: null,
        delivery_consultant_id: null,
        delivery_margin_amount: null,
        delivery_margin_percent: null,
        recruiter_margin_per_hour: null,
        recruiter_candidate_name: null,
        recruiter_calculated_tier: null,
        custom_email_memo: 'Test memo',
        attachment_path: null,
        attachment_filename: null,
        attachment_size_bytes: null,
        attachment_mime: null,
        recipient_full_name: 'Dawid Skowronek',
        recipient_email: 'dawid@b2bnetwork.pl',
        proposer_full_name: 'Admin Test',
        proposer_email: 'admin@b2bnetwork.pl',
        linked_invoice_number: null,
        ...overrides,
    }
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('<BonusesAdminClient /> edit flow', () => {
    // Regression: the success toast fired but the list kept showing the old amount
    // because onSuccess merged the stale editTarget instead of the saved row.
    it('reflects the saved amount in the list after editing', async () => {
        const bonus = buildBonus()
        mockUpdateBonus.mockResolvedValue({ ...bonus, amount: 1500 })

        render(
            <BonusesAdminClient
                initialBonuses={[bonus]}
                candidates={[]}
                viewerMode="admin"
                currentUserId="admin-1"
            />,
        )

        expect(screen.getAllByText('1000.00 PLN').length).toBeGreaterThan(0)

        fireEvent.click(screen.getByRole('button', { name: /Edytuj/ }))

        const amountInput = await screen.findByLabelText('Kwota')
        fireEvent.change(amountInput, { target: { value: '1500' } })

        const form = amountInput.closest('form')
        expect(form).not.toBeNull()
        fireEvent.submit(form as HTMLFormElement)

        await waitFor(() => {
            expect(mockUpdateBonus).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'bonus-1', amount: 1500 }),
            )
        })

        await waitFor(() => {
            expect(screen.getAllByText('1500.00 PLN').length).toBeGreaterThan(0)
        })
        expect(screen.queryByText('1000.00 PLN')).toBeNull()
    })
})
