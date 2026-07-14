import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface PageProps {
    searchParams?: Promise<{ year?: string; month?: string }>
}

export default async function AttendanceLegacyRedirect(props: PageProps) {
    const searchParams = await props.searchParams;
    const params = new URLSearchParams({ tab: 'attendance' })
    if (searchParams?.year) params.set('year', searchParams.year)
    if (searchParams?.month) params.set('month', searchParams.month)
    redirect(`/internal?${params.toString()}`)
}
