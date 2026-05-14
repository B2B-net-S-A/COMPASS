import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface PageProps {
    searchParams?: { year?: string; month?: string }
}

export default function AttendanceLegacyRedirect({ searchParams }: PageProps) {
    const params = new URLSearchParams({ tab: 'attendance' })
    if (searchParams?.year) params.set('year', searchParams.year)
    if (searchParams?.month) params.set('month', searchParams.month)
    redirect(`/internal?${params.toString()}`)
}
