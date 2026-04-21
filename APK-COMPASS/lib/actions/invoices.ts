'use server'

import { createClient } from '@/lib/supabase/server'

// ============================================================
// Types
// ============================================================

export interface Invoice {
    id: string
    consultant_id: string
    invoice_number: string
    amount: number
    currency: string
    issue_date: string
    due_date: string | null
    period_month: number | null
    period_year: number | null
    file_url: string | null
    file_name: string | null
    status: 'submitted' | 'verified' | 'approved' | 'paid' | 'rejected'
    notes: string | null
    reviewed_by: string | null
    reviewed_at: string | null
    rejection_reason: string | null
    created_at: string
    updated_at: string
}

// ============================================================
// Consultant: Get own invoices
// ============================================================

export async function getMyInvoices(): Promise<{ data: Invoice[], error: string | null }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Brak autoryzacji' }

    const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('consultant_id', user.id)
        .order('created_at', { ascending: false })

    if (error) return { data: [], error: error.message }
    return { data: data as Invoice[], error: null }
}

// ============================================================
// Consultant: Submit invoice with PDF upload
// ============================================================

export async function submitInvoice(formData: FormData): Promise<{ success: boolean, error: string | null }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Brak autoryzacji' }

    const invoiceNumber = formData.get('invoiceNumber') as string
    const amount = parseFloat(formData.get('amount') as string)
    const periodMonth = parseInt(formData.get('periodMonth') as string)
    const periodYear = parseInt(formData.get('periodYear') as string)
    const notes = formData.get('notes') as string || null
    const file = formData.get('file') as File | null

    // Validation
    if (!invoiceNumber || !amount || !periodMonth || !periodYear) {
        return { success: false, error: 'Wypełnij wszystkie wymagane pola.' }
    }

    if (amount <= 0) {
        return { success: false, error: 'Kwota musi być większa od 0.' }
    }

    let fileUrl: string | null = null
    let fileName: string | null = null

    // Upload PDF if provided
    if (file && file.size > 0) {
        if (file.size > 10 * 1024 * 1024) {
            return { success: false, error: 'Plik jest za duży (max 10MB).' }
        }

        if (!file.name.toLowerCase().endsWith('.pdf')) {
            return { success: false, error: 'Akceptujemy tylko pliki PDF.' }
        }

        const fileExt = 'pdf'
        const filePath = `${user.id}/${periodYear}/${periodMonth}/${Date.now()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
            .from('invoices')
            .upload(filePath, file, {
                contentType: 'application/pdf',
                upsert: false,
            })

        if (uploadError) {
            console.error('Upload error:', uploadError)
            return { success: false, error: `Błąd uploadu: ${uploadError.message}` }
        }

        const { data: { publicUrl } } = supabase.storage
            .from('invoices')
            .getPublicUrl(filePath)

        fileUrl = publicUrl
        fileName = file.name
    }

    // Calculate due date (21st of next month)
    const dueDate = new Date(periodYear, periodMonth, 21) // month is 0-indexed, so periodMonth = next month
    const issueDateStr = new Date().toISOString().split('T')[0]

    // Insert invoice record
    const { error: insertError } = await supabase
        .from('invoices')
        .insert({
            consultant_id: user.id,
            invoice_number: invoiceNumber,
            amount,
            currency: 'PLN',
            issue_date: issueDateStr,
            due_date: dueDate.toISOString().split('T')[0],
            period_month: periodMonth,
            period_year: periodYear,
            file_url: fileUrl,
            file_name: fileName,
            status: 'submitted',
            notes,
        })

    if (insertError) {
        console.error('Insert error:', insertError)
        return { success: false, error: `Błąd zapisu: ${insertError.message}` }
    }

    return { success: true, error: null }
}

// ============================================================
// Admin: Get all invoices (with filtering)
// ============================================================

export async function getAllInvoices(filters?: {
    status?: string
    periodMonth?: number
    periodYear?: number
}): Promise<{ data: (Invoice & { consultant_name?: string, consultant_email?: string })[], error: string | null }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: [], error: 'Brak autoryzacji' }

    // Check admin role
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

    if (!profile || !['administrator', 'admin', 'centrala'].includes(profile.role)) {
        return { data: [], error: 'Brak uprawnień' }
    }

    let query = supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false })

    if (filters?.status) {
        query = query.eq('status', filters.status)
    }
    if (filters?.periodMonth) {
        query = query.eq('period_month', filters.periodMonth)
    }
    if (filters?.periodYear) {
        query = query.eq('period_year', filters.periodYear)
    }

    const { data, error } = await query

    if (error) return { data: [], error: error.message }

    // Enrich with consultant names
    const consultantIds = Array.from(new Set((data || []).map(i => i.consultant_id)))
    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', consultantIds)

    const profileMap = new Map(profiles?.map(p => [p.id, p]) || [])

    const enriched = (data || []).map(inv => ({
        ...inv,
        consultant_name: profileMap.get(inv.consultant_id)?.full_name || null,
        consultant_email: profileMap.get(inv.consultant_id)?.email || null,
    }))

    return { data: enriched as any, error: null }
}

// ============================================================
// Admin: Update invoice status
// ============================================================

export async function updateInvoiceStatus(
    invoiceId: string,
    status: 'verified' | 'approved' | 'paid' | 'rejected',
    rejectionReason?: string
): Promise<{ success: boolean, error: string | null }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Brak autoryzacji' }

    const updateData: Record<string, any> = {
        status,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }

    if (status === 'rejected' && rejectionReason) {
        updateData.rejection_reason = rejectionReason
    }

    const { error } = await supabase
        .from('invoices')
        .update(updateData)
        .eq('id', invoiceId)

    if (error) return { success: false, error: error.message }
    return { success: true, error: null }
}
