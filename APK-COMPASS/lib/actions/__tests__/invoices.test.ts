import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, type MockSupabase, type MockSupabaseConfig } from '@/test/mocks/supabase'

let currentClient: MockSupabase

vi.mock('@/lib/supabase/server', () => ({
    createClient: () => currentClient,
}))

function setup(cfg: MockSupabaseConfig = {}): MockSupabase {
    currentClient = createMockSupabaseClient(cfg)
    return currentClient
}

function makeFormData(fields: Record<string, string | File>): FormData {
    const fd = new FormData()
    for (const [k, v] of Object.entries(fields)) fd.set(k, v as never)
    return fd
}

afterEach(() => {
    vi.clearAllMocks()
})

describe('getMyInvoices', () => {
    it('returns Brak autoryzacji when not signed in', async () => {
        setup({ user: null })
        const { getMyInvoices } = await import('../invoices')
        const result = await getMyInvoices()
        expect(result.error).toBe('Brak autoryzacji')
        expect(result.data).toEqual([])
    })

    it('returns only own invoices, sorted desc by created_at', async () => {
        setup({
            user: { id: 'u1', email: 'c@x.com' },
            tables: {
                invoices: [
                    { id: 'i1', consultant_id: 'u1', invoice_number: 'INV-1', amount: 1000, currency: 'PLN', issue_date: '2026-04-01', due_date: null, period_month: 4, period_year: 2026, file_url: null, file_name: null, status: 'submitted', notes: null, reviewed_by: null, reviewed_at: null, rejection_reason: null, created_at: '2026-04-01', updated_at: '2026-04-01' },
                    { id: 'i2', consultant_id: 'u2', invoice_number: 'INV-2', amount: 1000, currency: 'PLN', issue_date: '2026-04-01', due_date: null, period_month: 4, period_year: 2026, file_url: null, file_name: null, status: 'submitted', notes: null, reviewed_by: null, reviewed_at: null, rejection_reason: null, created_at: '2026-04-15', updated_at: '2026-04-15' },
                    { id: 'i3', consultant_id: 'u1', invoice_number: 'INV-3', amount: 2000, currency: 'PLN', issue_date: '2026-04-10', due_date: null, period_month: 4, period_year: 2026, file_url: null, file_name: null, status: 'paid', notes: null, reviewed_by: null, reviewed_at: null, rejection_reason: null, created_at: '2026-04-10', updated_at: '2026-04-10' },
                ],
            },
        })
        const { getMyInvoices } = await import('../invoices')
        const result = await getMyInvoices()
        expect(result.data.map(i => i.id)).toEqual(['i3', 'i1'])
    })
})

describe('submitInvoice — validation', () => {
    it('rejects when not signed in', async () => {
        setup({ user: null })
        const { submitInvoice } = await import('../invoices')
        const result = await submitInvoice(makeFormData({}))
        expect(result.success).toBe(false)
        expect(result.error).toBe('Brak autoryzacji')
    })

    it('rejects when required fields are missing', async () => {
        setup({ user: { id: 'u1', email: 'c@x.com' } })
        const { submitInvoice } = await import('../invoices')
        const result = await submitInvoice(makeFormData({}))
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/wymagane pola/i)
    })

    it('rejects when amount is negative (zero is caught earlier as missing field)', async () => {
        setup({ user: { id: 'u1', email: 'c@x.com' } })
        const { submitInvoice } = await import('../invoices')
        const result = await submitInvoice(makeFormData({
            invoiceNumber: 'INV-1', amount: '-100', periodMonth: '4', periodYear: '2026',
        }))
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/większa od 0/)
    })

    it('rejects file >10MB', async () => {
        setup({ user: { id: 'u1', email: 'c@x.com' } })
        const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
        const { submitInvoice } = await import('../invoices')
        const result = await submitInvoice(makeFormData({
            invoiceNumber: 'INV-1', amount: '1000', periodMonth: '4', periodYear: '2026', file: big,
        }))
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/za duży/i)
    })

    it('rejects non-PDF files', async () => {
        setup({ user: { id: 'u1', email: 'c@x.com' } })
        const docx = new File(['fake'], 'invoice.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
        const { submitInvoice } = await import('../invoices')
        const result = await submitInvoice(makeFormData({
            invoiceNumber: 'INV-1', amount: '1000', periodMonth: '4', periodYear: '2026', file: docx,
        }))
        expect(result.success).toBe(false)
        expect(result.error).toMatch(/PDF/)
    })
})
