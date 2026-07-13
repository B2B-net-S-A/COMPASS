import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface PageProps {
    searchParams?: Promise<{ year?: string; month?: string }>
}

export default async function AdminTimesheetsLegacyRedirect(props: PageProps) {
    const searchParams = await props.searchParams;
    const params = new URLSearchParams({ tab: 'timesheets' })
    if (searchParams?.year) params.set('year', searchParams.year)
    if (searchParams?.month) params.set('month', searchParams.month)
    redirect(`/internal/admin?${params.toString()}`)
}
