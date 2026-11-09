import { AcademyShell } from '@/components/academy/AcademyShell'
import { AcademyAdminNav } from '@/components/academy/AcademyAdminNav'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { AcademyReadinessPanel } from '@/components/academy/AcademyReadinessPanel'
import { getAcademyReadiness } from '@/lib/actions/academy-readiness'

export const dynamic = 'force-dynamic'

// Rolę admina egzekwuje admin/learning/layout.tsx oraz requireAcademyContext({ admin: true }) w akcji.
export default async function AcademyReadinessPage() {
    const result = await getAcademyReadiness()
    return <AcademyShell activeTab="admin" access={{ isAdmin: true, canTeach: true }} title="Gotowość do startu" description="Wyniki scenariuszy, przełączniki i warunki bramki startu. Otwarcie Akademii to osobna decyzja właściciela.">
        <AcademyAdminNav active="readiness" />
        {result.success ? <AcademyReadinessPanel data={result.data} /> : <AcademyEmptyState variant="error" title="Nie udało się wczytać gotowości" description={result.error} />}
    </AcademyShell>
}
