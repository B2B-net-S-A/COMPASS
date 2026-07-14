import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/admin'
import { requireAdminAction } from '@/lib/auth/internal-guard'
import { generateTimesheetZip } from '@/lib/pdf/timesheet-zip'
import type { ProfileForPdf, TimesheetEntryForPdf } from '@/lib/pdf/timesheet-pdf'

export const dynamic = 'force-dynamic'

export async function GET(
    _request: NextRequest,
    props: { params: Promise<{ year: string; month: string }> }
) {
    const params = await props.params;
    const year = Number(params.year)
    const month = Number(params.month)
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return new Response('Invalid params', { status: 400 })
    }

    const ctx = await requireAdminAction().catch(() => null)
    if (!ctx) return new Response('Forbidden', { status: 403 })

    const admin = createServiceClient()
    const { data: timesheets } = await admin
        .from('timesheets')
        .select('id, user_id, year, month, status, pdf_hash, approved_at')
        .eq('year', year)
        .eq('month', month)
        .eq('status', 'approved')

    if (!timesheets || timesheets.length === 0) {
        return new Response('Brak zaakceptowanych timesheetów dla tego miesiąca.', { status: 404 })
    }

    // Fetch entries + profiles per timesheet
    const items = await Promise.all(
        timesheets.map(async (h: any) => {
            const [entriesRes, profileRes] = await Promise.all([
                admin
                    .from('timesheet_entries')
                    .select('work_date, hours, project, description')
                    .eq('timesheet_id', h.id)
                    .order('work_date'),
                admin
                    .from('profiles')
                    .select('full_name, email, employment_type, work_start_date')
                    .eq('id', h.user_id)
                    .single<ProfileForPdf>(),
            ])

            return {
                timesheet: {
                    year: h.year,
                    month: h.month,
                    pdf_hash: h.pdf_hash,
                    approved_at: h.approved_at,
                },
                entries: (entriesRes.data ?? []) as TimesheetEntryForPdf[],
                profile: profileRes.data ?? {
                    full_name: null,
                    email: 'unknown@compass',
                    employment_type: null,
                    work_start_date: null,
                },
            }
        }),
    )

    const zipBytes = await generateTimesheetZip(items)
    const filename = `timesheets-${year}-${String(month).padStart(2, '0')}.zip`

    return new Response(Buffer.from(zipBytes), {
        status: 200,
        headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${filename}"`,
        },
    })
}
