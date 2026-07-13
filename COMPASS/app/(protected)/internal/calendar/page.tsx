import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface PageProps {
    searchParams?: Promise<{ year?: string; month?: string; filter?: string }>
}

export default async function CalendarLegacyRedirect(props: PageProps) {
    const searchParams = await props.searchParams;
    const params = new URLSearchParams({ tab: 'calendar' })
    if (searchParams?.year) params.set('year', searchParams.year)
    if (searchParams?.month) params.set('month', searchParams.month)
    if (searchParams?.filter) params.set('filter', searchParams.filter)
    redirect(`/internal?${params.toString()}`)
}
