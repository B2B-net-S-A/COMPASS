import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface PageProps {
    searchParams?: { year?: string; month?: string }
}

export default function AdminTimesheetsLegacyRedirect({ searchParams }: PageProps) {
    const params = new URLSearchParams({ tab: 'timesheets' })
    if (searchParams?.year) params.set('year', searchParams.year)
    if (searchParams?.month) params.set('month', searchParams.month)
    redirect(`/internal/admin?${params.toString()}`)
}
