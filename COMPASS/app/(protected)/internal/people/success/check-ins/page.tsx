import { listSuccessCheckIns } from '@/lib/actions/consultant-success'
import { PageHeader } from '@/components/ds/PageHeader'
import { CheckInsTable } from '@/components/internal/success/CheckInsTable'
import { SuccessEmptyState, SuccessErrorState } from '@/components/internal/success/SuccessStates'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams?: { q?: string; owner?: string; state?: string; view?: string } }

export default async function SuccessCheckInsPage({ searchParams }: PageProps) {
    try {
        const checkIns = await listSuccessCheckIns()
        return (
            <main className="space-y-6">
                <PageHeader eyebrow="Consultant Success" title="Check-iny" description="Wspólny harmonogram, zaległe kontakty i historia rozmów TCM." breadcrumb={[{ label: 'Consultant Success', href: '/internal/people/success' }, { label: 'Check-iny' }]} />
                {checkIns.length === 0 ? <SuccessEmptyState title="Brak check-inów" description="Pierwszy termin zaplanujesz z prywatnego profilu konsultanta." action={{ label: 'Otwórz konsultantów', href: '/internal/people/success/consultants' }} /> : <CheckInsTable checkIns={checkIns} initial={searchParams ?? {}} />}
            </main>
        )
    } catch {
        return <SuccessErrorState description="Nie udało się pobrać harmonogramu check-inów." />
    }
}
