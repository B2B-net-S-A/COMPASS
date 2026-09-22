import Link from 'next/link'
import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyAdminNav } from '@/components/academy/AcademyAdminNav'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyCertificatesPanel } from '@/components/academy/AcademyCertificatesPanel'
import { listAcademyCertificates } from '@/lib/actions/academy-certificates'

export const dynamic = 'force-dynamic'
export default async function CertificatesAdminPage({ searchParams }: { searchParams: { q?: string; page?: string } }) {
    const search = typeof searchParams.q === 'string' ? searchParams.q.slice(0, 100) : ''
    const page = Math.min(10000, Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1))
    const result = await listAcademyCertificates(search, page)
    const href = (target: number) => `/admin/learning/certificates?${new URLSearchParams({ q: search, page: String(target) })}`
    return <AcademyShell activeTab="admin" access={{ isAdmin: true, canTeach: true }} title="Ukończenia i certyfikaty" description="Sprawdź aktualną ważność i audytowane decyzje o unieważnieniu błędnego ukończenia.">
        <AcademyAdminNav active="certificates" />
        {result.success ? <><AcademyCertificatesPanel items={result.data.items} viewerId={result.data.viewerId} search={search} /><nav aria-label="Strony certyfikatów" className="flex justify-between text-sm text-primary">{page > 1 ? <Link href={href(page - 1)}>← Poprzednia strona</Link> : <span />}{result.data.hasMore && <Link href={href(page + 1)}>Następna strona →</Link>}</nav></> : <AcademyEmptyState variant="error" title="Nie udało się wczytać ukończeń" description="Sprawdź uprawnienia administratora lub spróbuj ponownie." />}
    </AcademyShell>
}
