import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock auth guards — most tests assume an authenticated 'internal' user.
const authContextMock = vi.hoisted(() => ({
    userId: 'user-1',
    email: 'jan@b2bnetwork.pl',
    role: 'internal' as 'internal' | 'admin' | 'finanse' | 'consultant',
    isAdmin: false,
}))

vi.mock('@/lib/auth/internal-guard', () => ({
    requireInternalOrAdminAction: async () => authContextMock,
    requireInvoiceReviewerAction: async () => {
        if (authContextMock.role !== 'admin' && authContextMock.role !== 'finanse') {
            throw new Error('Wymagane uprawnienia: administrator lub finanse.')
        }
        return authContextMock
    },
}))

// Mock side effects (audit, email, push)
vi.mock('@/lib/actions/audit', () => ({
    logAudit: vi.fn(async () => {}),
}))
vi.mock('@/lib/email', () => ({
    sendInvoiceSubmitted: vi.fn(async () => ({ success: true })),
    sendInvoiceDecision: vi.fn(async () => ({ success: true })),
}))
vi.mock('@/lib/actions/push-subscriptions', () => ({
    sendPushToUserId: vi.fn(async () => ({ success: true })),
}))

// Phase 26: invoice server actions are gated by requireInvoicesEnabled().
// Tests assume invoices are ENABLED — make the guard a no-op.
vi.mock('@/lib/feature-flags', () => ({
    requireInvoicesEnabled: vi.fn(() => {}),
    isInvoicesEnabled: vi.fn(() => true),
    isInvoicesEnabledServer: vi.fn(() => true),
}))

// Supabase mocks — minimal stub returning canned data.
const supabaseState = vi.hoisted(() => ({
    approvedTimesheet: true as boolean,
    insertError: null as { message: string } | null,
    uploadError: null as { message: string } | null,
    existingInvoice: null as { id: string; status: string; user_id: string; file_path: string } | null,
    updateRowCount: 1 as number,
}))

function makeClientChain() {
    const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () =>
            supabaseState.approvedTimesheet
                ? { data: { status: 'approved' }, error: null }
                : { data: null, error: null },
        ),
        single: vi.fn(async () => {
            if (supabaseState.insertError) return { data: null, error: supabaseState.insertError }
            return {
                data: {
                    id: 'inv-1',
                    user_id: 'user-1',
                    invoice_number: 'FV/2026/05/001',
                    amount: 5000,
                    currency: 'PLN',
                    issue_date: '2026-05-10',
                    due_date: null,
                    period_year: 2026,
                    period_month: 5,
                    file_path: 'user-1/123_FV.pdf',
                    file_name: 'FV.pdf',
                    file_size: 1024,
                    file_hash: null,
                    status: 'submitted',
                    notes: null,
                    reviewed_by: null,
                    reviewed_at: null,
                    rejection_reason: null,
                    created_at: '2026-05-10T10:00:00Z',
                    updated_at: '2026-05-10T10:00:00Z',
                },
                error: null,
            }
        }),
        insert: vi.fn(() => chain),
        update: vi.fn(() => chain),
        order: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        in: vi.fn(() => chain),
    }
    return chain
}

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => ({
        from: vi.fn(() => makeClientChain()),
        storage: {
            from: vi.fn(() => ({
                upload: vi.fn(async () =>
                    supabaseState.uploadError ? { error: supabaseState.uploadError } : { error: null },
                ),
                remove: vi.fn(async () => ({ error: null })),
                createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed' }, error: null })),
            })),
        },
    }),
}))
vi.mock('@/lib/supabase/admin', () => ({
    createServiceClient: () => ({
        from: vi.fn(() => makeClientChain()),
        storage: {
            from: vi.fn(() => ({
                download: vi.fn(async () => ({
                    data: new Blob(['fake-pdf-content'], { type: 'application/pdf' }),
                    error: null,
                })),
            })),
        },
    }),
}))

vi.mock('@/lib/logger', () => ({
    logCompat: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
    submitInvoice,
    rejectInvoice,
    approveInvoice,
} from '../internal-invoice'

function makePdfFile(name = 'fv.pdf', size = 1024): File {
    const blob = new Blob([new Uint8Array(size)], { type: 'application/pdf' })
    return new File([blob], name, { type: 'application/pdf' })
}

beforeEach(() => {
    authContextMock.role = 'internal'
    authContextMock.isAdmin = false
    supabaseState.approvedTimesheet = true
    supabaseState.insertError = null
    supabaseState.uploadError = null
})

afterEach(() => {
    vi.clearAllMocks()
})

describe('submitInvoice', () => {
    it('rejects consultant role', async () => {
        authContextMock.role = 'consultant'
        await expect(
            submitInvoice(
                {
                    invoice_number: 'FV/1',
                    amount: 100,
                    period_year: 2026,
                    period_month: 5,
                },
                makePdfFile(),
            ),
        ).rejects.toThrow(/pracownicy biurowi/i)
    })

    it('Phase 19d: accepts finanse role (b2b HR-parity with internal)', async () => {
        authContextMock.role = 'finanse'
        const row = await submitInvoice(
            { invoice_number: 'FV/FIN/001', amount: 1234, period_year: 2026, period_month: 5 },
            makePdfFile(),
        )
        expect(row.id).toBe('inv-1')
    })

    it('rejects non-PDF MIME', async () => {
        const txt = new File([new Blob(['x'])], 'x.txt', { type: 'text/plain' })
        await expect(
            submitInvoice(
                { invoice_number: 'FV/1', amount: 100, period_year: 2026, period_month: 5 },
                txt,
            ),
        ).rejects.toThrow(/Tylko PDF/)
    })

    it('rejects files > 10 MB', async () => {
        const big = makePdfFile('big.pdf', 11 * 1024 * 1024)
        await expect(
            submitInvoice(
                { invoice_number: 'FV/1', amount: 100, period_year: 2026, period_month: 5 },
                big,
            ),
        ).rejects.toThrow(/Plik za duży/)
    })

    it('rejects empty invoice number', async () => {
        await expect(
            submitInvoice(
                { invoice_number: '   ', amount: 100, period_year: 2026, period_month: 5 },
                makePdfFile(),
            ),
        ).rejects.toThrow(/Numer faktury jest wymagany/)
    })

    it('rejects non-positive amount', async () => {
        await expect(
            submitInvoice(
                { invoice_number: 'FV/1', amount: 0, period_year: 2026, period_month: 5 },
                makePdfFile(),
            ),
        ).rejects.toThrow(/Kwota musi/)
    })

    it('rejects when no approved timesheet for period', async () => {
        supabaseState.approvedTimesheet = false
        await expect(
            submitInvoice(
                { invoice_number: 'FV/1', amount: 100, period_year: 2026, period_month: 5 },
                makePdfFile(),
            ),
        ).rejects.toThrow(/timesheet za 2026-05 nie jest zatwierdzony/)
    })

    it('accepts valid submission and returns row', async () => {
        const row = await submitInvoice(
            { invoice_number: 'FV/2026/05/001', amount: 5000, period_year: 2026, period_month: 5 },
            makePdfFile(),
        )
        expect(row.id).toBe('inv-1')
        expect(row.status).toBe('submitted')
    })
})

describe('approveInvoice', () => {
    it('blocks non-reviewer roles', async () => {
        authContextMock.role = 'internal'
        await expect(approveInvoice('inv-1')).rejects.toThrow(/Wymagane uprawnienia/)
    })

    it('allows finanse role for OTHER user invoice', async () => {
        authContextMock.role = 'finanse'
        authContextMock.userId = 'user-finance-2'  // different from invoice owner 'user-1'
        await expect(approveInvoice('inv-1')).resolves.toBeUndefined()
    })

    it('allows admin role', async () => {
        authContextMock.role = 'admin'
        authContextMock.isAdmin = true
        authContextMock.userId = 'admin-1'
        await expect(approveInvoice('inv-1')).resolves.toBeUndefined()
    })

    it('Phase 19d: blocks self-approval (finanse cannot approve own invoice)', async () => {
        authContextMock.role = 'finanse'
        authContextMock.userId = 'user-1'  // same as invoice owner
        await expect(approveInvoice('inv-1')).rejects.toThrow(/własnej faktury/)
    })
})

describe('rejectInvoice', () => {
    beforeEach(() => {
        authContextMock.role = 'finanse'
        authContextMock.userId = 'user-finance-2'  // different from invoice owner
    })

    it('requires a reason', async () => {
        await expect(rejectInvoice('inv-1', '   ')).rejects.toThrow(/Powód odrzucenia jest wymagany/)
    })

    it('accepts a valid reason', async () => {
        await expect(rejectInvoice('inv-1', 'Kwota nie pasuje do godzin')).resolves.toBeUndefined()
    })

    it('Phase 19d: blocks self-reject (finanse cannot reject own invoice)', async () => {
        authContextMock.userId = 'user-1'  // same as invoice owner
        await expect(rejectInvoice('inv-1', 'cokolwiek')).rejects.toThrow(/własnej faktury/)
    })
})
