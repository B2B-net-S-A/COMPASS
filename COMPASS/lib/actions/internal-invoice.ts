'use server'

import { createHash } from 'crypto'
import { logCompat } from '@/lib/logger'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/admin'
import {
    requireInternalOrAdminAction,
    requireInvoiceReviewerAction,
} from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { sendInvoiceDecision, sendInvoiceSubmitted } from '@/lib/email'
import { sendPushToUserId } from '@/lib/actions/push-subscriptions'

// ─── Types ──────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'submitted' | 'approved' | 'rejected'

export interface InvoiceRow {
    id: string
    user_id: string
    invoice_number: string
    amount: number
    currency: string
    issue_date: string
    due_date: string | null
    period_year: number
    period_month: number
    file_path: string
    file_name: string
    file_size: number
    file_hash: string | null
    status: InvoiceStatus
    notes: string | null
    reviewed_by: string | null
    reviewed_at: string | null
    rejection_reason: string | null
    created_at: string
    updated_at: string
}

export interface InvoiceWithUser extends InvoiceRow {
    user_full_name: string | null
    user_email: string
}

export interface EligiblePeriod {
    year: number
    month: number
    approved_timesheet: boolean
    existing_invoices_count: number
}

export interface SubmitInvoiceInput {
    invoice_number: string
    amount: number
    currency?: string
    due_date?: string | null
    period_year: number
    period_month: number
    notes?: string | null
}

export interface UpdateRejectedInvoiceInput {
    invoice_number?: string
    amount?: number
    due_date?: string | null
    notes?: string | null
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const ALLOWED_MIME = 'application/pdf'
const BUCKET = 'invoices'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Sanitize filename for Supabase Storage — remove diacritics, spaces, unsafe chars. */
function sanitizeFileName(name: string): string {
    const withoutDiacritics = name.normalize('NFD').replace(/[̀-ͯ]/g, '')
    return withoutDiacritics
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .replace(/_+/g, '_')
}

function validatePeriod(year: number, month: number): void {
    if (!Number.isInteger(year) || year < 2024 || year > 2100) {
        throw new Error('Nieprawidłowy rok.')
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('Miesiąc musi być w zakresie 1–12.')
    }
}

function validateInvoiceFile(file: File): void {
    if (!file) throw new Error('Plik faktury jest wymagany.')
    if (file.size === 0) throw new Error('Plik jest pusty.')
    if (file.size > MAX_FILE_SIZE_BYTES) {
        throw new Error(`Plik za duży — maksymalnie 10 MB (twój: ${(file.size / 1024 / 1024).toFixed(1)} MB).`)
    }
    if (file.type !== ALLOWED_MIME) {
        throw new Error(`Tylko PDF (otrzymano: ${file.type || 'unknown'}).`)
    }
}

function validateSubmitInput(input: SubmitInvoiceInput): void {
    if (!input.invoice_number?.trim()) throw new Error('Numer faktury jest wymagany.')
    if (input.invoice_number.length > 100) throw new Error('Numer faktury za długi (max 100 znaków).')
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw new Error('Kwota musi być dodatnia.')
    }
    if (input.amount > 9_999_999.99) throw new Error('Kwota za duża.')
    validatePeriod(input.period_year, input.period_month)
    if (input.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(input.due_date)) {
        throw new Error('due_date musi być w formacie YYYY-MM-DD.')
    }
}

async function fileSha256(file: File): Promise<string> {
    const buf = Buffer.from(await file.arrayBuffer())
    return createHash('sha256').update(buf).digest('hex')
}

async function fetchInvoiceReviewerEmails(): Promise<string[]> {
    const admin = createServiceClient()
    const { data } = await admin
        .from('profiles')
        .select('email')
        .in('role', ['admin', 'finanse'])
    return (data ?? [])
        .map((r: { email: string | null }) => r.email)
        .filter((e): e is string => !!e)
}

async function fetchInvoiceReviewerUserIds(): Promise<string[]> {
    const admin = createServiceClient()
    const { data } = await admin
        .from('profiles')
        .select('id')
        .in('role', ['admin', 'finanse'])
    return (data ?? []).map((r: { id: string }) => r.id)
}

async function fetchUserContact(userId: string): Promise<{ email: string; full_name: string | null } | null> {
    const admin = createServiceClient()
    const { data } = await admin
        .from('profiles')
        .select('email, full_name')
        .eq('id', userId)
        .single<{ email: string | null; full_name: string | null }>()
    if (!data?.email) return null
    return { email: data.email, full_name: data.full_name }
}

async function fetchUserDisplayName(userId: string, fallback: string): Promise<string> {
    const admin = createServiceClient()
    const { data } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .single<{ full_name: string | null }>()
    return data?.full_name ?? fallback
}

async function hasApprovedTimesheet(userId: string, year: number, month: number): Promise<boolean> {
    const supabase = createClient()
    const { data } = await supabase
        .from('timesheets')
        .select('status')
        .eq('user_id', userId)
        .eq('year', year)
        .eq('month', month)
        .eq('status', 'approved')
        .maybeSingle<{ status: string }>()
    return !!data
}

// ─── User-side ──────────────────────────────────────────────────────────────

export async function listMyInvoices(): Promise<InvoiceRow[]> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('user_id', ctx.userId)
        .order('created_at', { ascending: false })
    if (error) throw new Error(`Błąd pobierania faktur: ${error.message}`)
    return (data ?? []) as InvoiceRow[]
}

export async function listEligiblePeriods(monthsBack = 12): Promise<EligiblePeriod[]> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    const now = new Date()
    const periods: Array<{ year: number; month: number }> = []
    for (let i = 0; i < monthsBack; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        periods.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
    }

    const minYear = Math.min(...periods.map((p) => p.year))
    const [tsRes, invRes] = await Promise.all([
        supabase
            .from('timesheets')
            .select('year, month, status')
            .eq('user_id', ctx.userId)
            .eq('status', 'approved')
            .gte('year', minYear),
        supabase
            .from('invoices')
            .select('period_year, period_month')
            .eq('user_id', ctx.userId)
            .gte('period_year', minYear),
    ])

    const approvedSet = new Set(
        ((tsRes.data ?? []) as Array<{ year: number; month: number }>).map((t) => `${t.year}-${t.month}`),
    )
    const invoiceCounts = new Map<string, number>()
    for (const inv of (invRes.data ?? []) as Array<{ period_year: number; period_month: number }>) {
        const k = `${inv.period_year}-${inv.period_month}`
        invoiceCounts.set(k, (invoiceCounts.get(k) ?? 0) + 1)
    }

    return periods.map((p) => ({
        year: p.year,
        month: p.month,
        approved_timesheet: approvedSet.has(`${p.year}-${p.month}`),
        existing_invoices_count: invoiceCounts.get(`${p.year}-${p.month}`) ?? 0,
    }))
}

export async function submitInvoice(
    input: SubmitInvoiceInput,
    file: File,
): Promise<InvoiceRow> {
    const ctx = await requireInternalOrAdminAction()
    // Phase 19d: finanse (jak internal) to b2b pracownik biurowy — może wystawiać faktury.
    if (ctx.role !== 'internal' && ctx.role !== 'finanse' && !ctx.isAdmin) {
        throw new Error('Tylko pracownicy biurowi (internal/finanse) mogą wystawiać faktury.')
    }
    validateSubmitInput(input)
    validateInvoiceFile(file)

    // App-layer gating: approved timesheet for period (DB trigger is defense-in-depth).
    if (!(await hasApprovedTimesheet(ctx.userId, input.period_year, input.period_month))) {
        throw new Error(
            `Nie możesz wystawić faktury — timesheet za ${input.period_year}-${String(input.period_month).padStart(2, '0')} nie jest zatwierdzony.`,
        )
    }

    const supabase = createClient()
    const safeName = sanitizeFileName(file.name)
    const filePath = `${ctx.userId}/${Date.now()}_${safeName}`

    // Upload first; insert row second.
    const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(filePath, file, {
        contentType: ALLOWED_MIME,
        upsert: false,
    })
    if (uploadErr) {
        throw new Error(`Błąd uploadu pliku: ${uploadErr.message}`)
    }

    const insertPayload = {
        user_id: ctx.userId,
        invoice_number: input.invoice_number.trim(),
        amount: input.amount,
        currency: input.currency?.trim() || 'PLN',
        due_date: input.due_date || null,
        period_year: input.period_year,
        period_month: input.period_month,
        file_path: filePath,
        file_name: file.name,
        file_size: file.size,
        notes: input.notes?.trim() || null,
    }

    const { data, error } = await supabase
        .from('invoices')
        .insert(insertPayload)
        .select('*')
        .single<InvoiceRow>()
    if (error || !data) {
        // Cleanup uploaded file on insert failure (best-effort).
        await supabase.storage.from(BUCKET).remove([filePath]).catch((e) =>
            logCompat.error('[submitInvoice] cleanup failed:', e),
        )
        throw new Error(`Błąd zapisu faktury: ${error?.message ?? 'unknown'}`)
    }

    await logAudit(ctx.userId, 'INVOICE_SUBMITTED', {
        invoice_id: data.id,
        period_year: data.period_year,
        period_month: data.period_month,
        amount: data.amount,
    })

    // Notify reviewers (email + push) — fire-and-forget.
    const requesterName = await fetchUserDisplayName(ctx.userId, ctx.email)
    fetchInvoiceReviewerEmails()
        .then((emails) =>
            sendInvoiceSubmitted(emails, requesterName, data.invoice_number, data.period_year, data.period_month),
        )
        .catch((e) => logCompat.error('[submitInvoice] email failed:', e))
    fetchInvoiceReviewerUserIds()
        .then(async (ids) => {
            for (const id of ids) {
                await sendPushToUserId(id, {
                    title: 'Nowa faktura do akceptacji',
                    body: `${requesterName}: ${data.invoice_number} (${data.period_year}-${String(data.period_month).padStart(2, '0')})`,
                    url: '/internal/admin?tab=invoices',
                    tag: `invoice-submit-${data.id}`,
                }).catch((e) => logCompat.error('[submitInvoice] push failed:', e))
            }
        })
        .catch((e) => logCompat.error('[submitInvoice] push gather failed:', e))

    return data
}

export async function updateRejectedInvoice(
    invoiceId: string,
    input: UpdateRejectedInvoiceInput,
    newFile?: File,
): Promise<InvoiceRow> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()

    const { data: existing, error: fetchErr } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single<InvoiceRow>()
    if (fetchErr || !existing) throw new Error('Faktura nie istnieje.')
    if (existing.user_id !== ctx.userId && !ctx.isAdmin) {
        throw new Error('To nie jest Twoja faktura.')
    }
    if (existing.status !== 'rejected') {
        throw new Error('Można edytować tylko fakturę odrzuconą.')
    }

    let newFilePath: string | undefined
    let oldFilePathToCleanup: string | undefined

    if (newFile) {
        validateInvoiceFile(newFile)
        const safeName = sanitizeFileName(newFile.name)
        newFilePath = `${ctx.userId}/${Date.now()}_${safeName}`
        const { error: uploadErr } = await supabase.storage
            .from(BUCKET)
            .upload(newFilePath, newFile, { contentType: ALLOWED_MIME, upsert: false })
        if (uploadErr) throw new Error(`Błąd uploadu pliku: ${uploadErr.message}`)
        oldFilePathToCleanup = existing.file_path
    }

    const updates: Record<string, unknown> = {
        status: 'submitted',
        rejection_reason: null,
        reviewed_by: null,
        reviewed_at: null,
    }
    if (input.invoice_number !== undefined) {
        if (!input.invoice_number.trim()) throw new Error('Numer faktury nie może być pusty.')
        updates.invoice_number = input.invoice_number.trim()
    }
    if (input.amount !== undefined) {
        if (!Number.isFinite(input.amount) || input.amount <= 0) {
            throw new Error('Kwota musi być dodatnia.')
        }
        updates.amount = input.amount
    }
    if (input.due_date !== undefined) updates.due_date = input.due_date || null
    if (input.notes !== undefined) updates.notes = input.notes?.trim() || null
    if (newFile && newFilePath) {
        updates.file_path = newFilePath
        updates.file_name = newFile.name
        updates.file_size = newFile.size
        updates.file_hash = null // recomputed on next approve
    }

    const { data, error } = await supabase
        .from('invoices')
        .update(updates)
        .eq('id', invoiceId)
        .eq('status', 'rejected') // concurrency guard
        .select('*')
        .single<InvoiceRow>()
    if (error || !data) {
        // Rollback: best-effort cleanup of newly uploaded file.
        if (newFilePath) {
            await supabase.storage.from(BUCKET).remove([newFilePath]).catch((e) =>
                logCompat.error('[updateRejectedInvoice] cleanup new failed:', e),
            )
        }
        throw new Error(`Błąd aktualizacji: ${error?.message ?? 'unknown — status mogł się zmienić'}`)
    }

    // After successful DB commit, cleanup old file (best-effort, non-blocking).
    if (oldFilePathToCleanup) {
        supabase.storage.from(BUCKET).remove([oldFilePathToCleanup]).then(({ error: e }) => {
            if (e) logCompat.error('[updateRejectedInvoice] cleanup old failed:', e)
        })
    }

    await logAudit(ctx.userId, 'INVOICE_RESUBMITTED', {
        invoice_id: data.id,
        had_new_file: !!newFile,
    })

    // Notify reviewers
    const requesterName = await fetchUserDisplayName(ctx.userId, ctx.email)
    fetchInvoiceReviewerEmails()
        .then((emails) =>
            sendInvoiceSubmitted(emails, requesterName, data.invoice_number, data.period_year, data.period_month),
        )
        .catch((e) => logCompat.error('[updateRejectedInvoice] email failed:', e))

    return data
}

export async function getInvoiceFileSignedUrl(invoiceId: string): Promise<string> {
    const ctx = await requireInternalOrAdminAction()
    const supabase = createClient()
    const { data: inv, error } = await supabase
        .from('invoices')
        .select('user_id, file_path')
        .eq('id', invoiceId)
        .single<{ user_id: string; file_path: string }>()
    if (error || !inv) throw new Error('Faktura nie istnieje.')
    // RLS already enforces owner-or-reviewer for SELECT; double-check at app layer.
    if (inv.user_id !== ctx.userId && !ctx.isAdmin && ctx.role !== 'finanse') {
        throw new Error('Brak dostępu.')
    }

    const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(inv.file_path, 300) // 5 minutes
    if (signErr || !signed?.signedUrl) {
        throw new Error(`Błąd generowania linku: ${signErr?.message ?? 'unknown'}`)
    }
    return signed.signedUrl
}

// ─── Reviewer-side (admin + finanse) ─────────────────────────────────────────

export interface ListInvoicesForReviewFilters {
    status?: InvoiceStatus | 'all'
    periodYear?: number
    periodMonth?: number
    userId?: string
}

export async function listInvoicesForReview(
    filters: ListInvoicesForReviewFilters = {},
): Promise<InvoiceWithUser[]> {
    await requireInvoiceReviewerAction()
    const admin = createServiceClient()
    let query = admin
        .from('invoices')
        .select(`
            *,
            profiles:profiles!invoices_user_id_fkey(full_name, email)
        `)
        .order('created_at', { ascending: false })

    if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status)
    if (filters.periodYear) query = query.eq('period_year', filters.periodYear)
    if (filters.periodMonth) query = query.eq('period_month', filters.periodMonth)
    if (filters.userId) query = query.eq('user_id', filters.userId)

    const { data, error } = await query
    if (error) throw new Error(`Błąd pobierania faktur: ${error.message}`)
    const rows = (data ?? []) as Array<InvoiceRow & { profiles: { full_name: string | null; email: string } | null }>
    return rows.map((r) => ({
        id: r.id,
        user_id: r.user_id,
        invoice_number: r.invoice_number,
        amount: r.amount,
        currency: r.currency,
        issue_date: r.issue_date,
        due_date: r.due_date,
        period_year: r.period_year,
        period_month: r.period_month,
        file_path: r.file_path,
        file_name: r.file_name,
        file_size: r.file_size,
        file_hash: r.file_hash,
        status: r.status,
        notes: r.notes,
        reviewed_by: r.reviewed_by,
        reviewed_at: r.reviewed_at,
        rejection_reason: r.rejection_reason,
        created_at: r.created_at,
        updated_at: r.updated_at,
        user_full_name: r.profiles?.full_name ?? null,
        user_email: r.profiles?.email ?? '',
    }))
}

export interface TimesheetSummaryForInvoiceData {
    timesheet_id: string | null
    status: string | null
    total_hours: number
    entries: Array<{
        work_date: string
        hours: number
        project: string | null
        description: string
    }>
}

export async function getTimesheetForInvoiceReview(
    invoiceId: string,
): Promise<TimesheetSummaryForInvoiceData> {
    await requireInvoiceReviewerAction()
    const admin = createServiceClient()

    const { data: inv, error: invErr } = await admin
        .from('invoices')
        .select('user_id, period_year, period_month')
        .eq('id', invoiceId)
        .single<{ user_id: string; period_year: number; period_month: number }>()
    if (invErr || !inv) throw new Error('Faktura nie istnieje.')

    const { data: ts } = await admin
        .from('timesheets')
        .select('id, status')
        .eq('user_id', inv.user_id)
        .eq('year', inv.period_year)
        .eq('month', inv.period_month)
        .maybeSingle<{ id: string; status: string }>()
    if (!ts) {
        return { timesheet_id: null, status: null, total_hours: 0, entries: [] }
    }

    const { data: entries } = await admin
        .from('timesheet_entries')
        .select('work_date, hours, project, description')
        .eq('timesheet_id', ts.id)
        .order('work_date')

    const rows = (entries ?? []) as Array<{
        work_date: string
        hours: number
        project: string | null
        description: string
    }>
    const total = rows.reduce((sum, e) => sum + Number(e.hours), 0)

    return {
        timesheet_id: ts.id,
        status: ts.status,
        total_hours: total,
        entries: rows,
    }
}

export async function approveInvoice(invoiceId: string): Promise<void> {
    const ctx = await requireInvoiceReviewerAction()
    const admin = createServiceClient()

    const { data: inv, error: fetchErr } = await admin
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single<InvoiceRow>()
    if (fetchErr || !inv) throw new Error('Faktura nie istnieje.')
    if (inv.status !== 'submitted') {
        throw new Error('Można zaakceptować tylko fakturę w statusie "submitted".')
    }
    // Phase 19d: self-approval guard. Finanse może wystawiać własne faktury, ale
    // nie może ich sam zatwierdzać — must be approved by another reviewer.
    if (inv.user_id === ctx.userId) {
        throw new Error('Nie możesz zaakceptować własnej faktury — poproś drugiego reviewera (admin lub finanse).')
    }

    // Compute file hash from current file (audit-grade).
    let fileHash: string | null = null
    try {
        const { data: dl, error: dlErr } = await admin.storage.from(BUCKET).download(inv.file_path)
        if (!dlErr && dl) {
            const buf = Buffer.from(await dl.arrayBuffer())
            fileHash = createHash('sha256').update(buf).digest('hex')
        }
    } catch (e) {
        logCompat.error('[approveInvoice] hash compute failed:', e)
    }

    const { data: updated, error } = await admin
        .from('invoices')
        .update({
            status: 'approved',
            reviewed_by: ctx.userId,
            reviewed_at: new Date().toISOString(),
            file_hash: fileHash,
            rejection_reason: null,
        })
        .eq('id', invoiceId)
        .eq('status', 'submitted') // concurrency guard
        .select('*')
        .single<InvoiceRow>()
    if (error || !updated) {
        throw new Error('Faktura została już zaakceptowana lub odrzucona przez innego użytkownika.')
    }

    await logAudit(ctx.userId, 'INVOICE_APPROVED', {
        invoice_id: invoiceId,
        target_user_id: inv.user_id,
        amount: inv.amount,
    })

    const userInfo = await fetchUserContact(inv.user_id)
    if (userInfo) {
        sendInvoiceDecision(
            userInfo.email,
            userInfo.full_name ?? userInfo.email,
            'approved',
            inv.invoice_number,
            inv.period_year,
            inv.period_month,
        ).catch((e) => logCompat.error('[approveInvoice] email failed:', e))
    }
    sendPushToUserId(inv.user_id, {
        title: 'Faktura zatwierdzona',
        body: `${inv.invoice_number} (${inv.period_year}-${String(inv.period_month).padStart(2, '0')})`,
        url: '/internal?tab=invoices',
        tag: `invoice-${invoiceId}`,
    }).catch((e) => logCompat.error('[approveInvoice] push failed:', e))
}

export async function rejectInvoice(invoiceId: string, reason: string): Promise<void> {
    const ctx = await requireInvoiceReviewerAction()
    if (!reason?.trim()) throw new Error('Powód odrzucenia jest wymagany.')
    const admin = createServiceClient()

    const { data: inv, error: fetchErr } = await admin
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single<InvoiceRow>()
    if (fetchErr || !inv) throw new Error('Faktura nie istnieje.')
    // Phase 19d: self-reject guard (symmetric to approve).
    if (inv.user_id === ctx.userId) {
        throw new Error('Nie możesz odrzucić własnej faktury — poproś drugiego reviewera (admin lub finanse).')
    }
    if (inv.status !== 'submitted') {
        throw new Error('Można odrzucić tylko fakturę w statusie "submitted".')
    }

    const { data: updated, error } = await admin
        .from('invoices')
        .update({
            status: 'rejected',
            reviewed_by: ctx.userId,
            reviewed_at: new Date().toISOString(),
            rejection_reason: reason.trim(),
        })
        .eq('id', invoiceId)
        .eq('status', 'submitted')
        .select('*')
        .single<InvoiceRow>()
    if (error || !updated) {
        throw new Error('Faktura została już zaakceptowana lub odrzucona przez innego użytkownika.')
    }

    await logAudit(ctx.userId, 'INVOICE_REJECTED', {
        invoice_id: invoiceId,
        target_user_id: inv.user_id,
        reason: reason.trim(),
    })

    const userInfo = await fetchUserContact(inv.user_id)
    if (userInfo) {
        sendInvoiceDecision(
            userInfo.email,
            userInfo.full_name ?? userInfo.email,
            'rejected',
            inv.invoice_number,
            inv.period_year,
            inv.period_month,
            reason,
        ).catch((e) => logCompat.error('[rejectInvoice] email failed:', e))
    }
    sendPushToUserId(inv.user_id, {
        title: 'Faktura odrzucona — popraw',
        body: `${inv.invoice_number}: ${reason.slice(0, 80)}`,
        url: '/internal?tab=invoices',
        tag: `invoice-${invoiceId}`,
    }).catch((e) => logCompat.error('[rejectInvoice] push failed:', e))
}
