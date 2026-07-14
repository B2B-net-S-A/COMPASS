import Link from 'next/link'
import { listSuccessConsultants } from '@/lib/actions/consultant-success'
import { PageHeader } from '@/components/ds/PageHeader'
import { Button } from '@/components/ui/button'
import { ConsultantsTable } from '@/components/internal/success/ConsultantsTable'
import { SuccessEmptyState, SuccessErrorState } from '@/components/internal/success/SuccessStates'

export const dynamic = 'force-dynamic'

interface PageProps {
    searchParams?: { q?: string; owner?: string; health?: string; monitoring?: string; client?: string }
}

export default async function SuccessConsultantsPage({ searchParams }: PageProps) {
    try {
        const consultants = await listSuccessConsultants()
        return (
            <main className="space-y-6">
                <PageHeader
                    eyebrow="Consultant Success"
                    title="Konsultanci"
                    description="Prywatne portfolio TCM: opiekun, rytm kontaktu, status relacji i otwarte ustalenia."
                    breadcrumb={[{ label: 'People Ops', href: '/internal/people' }, { label: 'Consultant Success', href: '/internal/people/success' }, { label: 'Konsultanci' }]}
                    actions={<Button asChild variant="outline" size="sm"><Link href="/internal/people/success/check-ins">Harmonogram check-inów</Link></Button>}
                />
                {consultants.length === 0
                    ? <SuccessEmptyState title="Brak konsultantów" description="Katalog zostanie zasilony istniejącymi rekordami kontraktorów. Dodawanie i dane bazowe pozostają w People Ops." action={{ label: 'Otwórz kontraktorów', href: '/internal/people?tab=kontraktorzy' }} />
                    : <ConsultantsTable consultants={consultants} initial={searchParams ?? {}} />}
            </main>
        )
    } catch {
        return <SuccessErrorState description="Nie udało się pobrać katalogu konsultantów." />
    }
}
