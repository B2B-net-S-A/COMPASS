import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireInternalOrAdminAction } from '@/lib/auth/internal-guard'
import { logAudit } from '@/lib/actions/audit'
import { computeTimesheetHash } from '@/lib/hr/timesheet-hash'
import {
    generateTimesheetPdf,
    timesheetPdfFilename,
    type ProfileForPdf,
    type TimesheetEntryForPdf,
    type TimesheetForPdf,
} from '@/lib/pdf/timesheet-pdf'

export const dynamic = 'force-dynamic'

export async function GET(
    request: NextRequest,
    { params }: { params: { year: string; month: string } },
) {
    const year = Number(params.year)
    const month = Number(params.month)
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return new Response('Invalid params', { status: 400 })
    }

    const ctx = await requireInternalOrAdminAction().catch(() => null)
    if (!ctx) return new Response('Unauthorized', { status: 401 })

    const userParam = request.nextUrl.searchParams.get('user')
    let targetUserId = ctx.userId
    if (userParam && userParam !== ctx.userId) {
        if (!ctx.isAdmin) return new Response('Forbidden', { status: 403 })
        targetUserId = userParam
    }

    const admin = createServiceClient()
    const { data: header } = await admin
        .from('timesheets')
        .select('id, user_id, year, month, status, pdf_hash, approved_at')
        .eq('user_id', targetUserId)
        .eq('year', year)
        .eq('month', month)
        .maybeSingle<{
            id: string
            user_id: string
            year: number
            month: number
            status: string
            pdf_hash: string | null
            approved_at: string | null
        }>()
    if (!header) return new Response('Not found', { status: 404 })
    if (header.status !== 'approved') {
        return new Response('Timesheet must be approved before downloading PDF.', { status: 400 })
    }

    const [entriesRes, profileRes] = await Promise.all([
        admin
            .from('timesheet_entries')
            .select('work_date, hours, project, description')
            .eq('timesheet_id', header.id)
            .order('work_date'),
        admin
            .from('profiles')
            .select('full_name, email, employment_type, work_start_date')
            .eq('id', targetUserId)
            .single<ProfileForPdf>(),
    ])

    if (!profileRes.data) return new Response('Profile missing', { status: 500 })

    const entries: TimesheetEntryForPdf[] = (entriesRes.data ?? []) as TimesheetEntryForPdf[]

    // H2.8: tamper-evidence check — recompute hash z aktualnych entries
    // i porównaj z hashem zapisanym przy approve. Mismatch = ktoś zmienił dane
    // przez bypass RLS (admin direct DB access). Loguj do audit, blokuj download.
    if (header.pdf_hash) {
        const currentHash = computeTimesheetHash(
            entries.map((e) => ({
                work_date: e.work_date,
                hours: e.hours,
                project: e.project,
                description: e.description,
            })),
        )
        if (currentHash !== header.pdf_hash) {
            await logAudit(ctx.userId, 'TIMESHEET_HASH_MISMATCH', {
                timesheet_id: header.id,
                target_user_id: targetUserId,
                stored_hash: header.pdf_hash,
                current_hash: currentHash,
            }).catch(() => {})
            return new Response(
                'Wykryto rozbieżność integralności timesheetu (hash mismatch). Skontaktuj się z adminem.',
                { status: 409 },
            )
        }
    }

    const tsForPdf: TimesheetForPdf = {
        year: header.year,
        month: header.month,
        pdf_hash: header.pdf_hash,
        approved_at: header.approved_at,
    }
    const pdfBytes = await generateTimesheetPdf({
        timesheet: tsForPdf,
        entries,
        profile: profileRes.data,
    })

    const filename = timesheetPdfFilename(profileRes.data, year, month)
    return new Response(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
        },
    })
}
