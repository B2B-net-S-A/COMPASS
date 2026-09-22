import Link from 'next/link'
import { getAcademyAccess } from '@/lib/actions/academy-access'
import { AcademyEmptyState } from '@/components/academy/AcademyEmptyState'
import { Button } from '@/components/ui/button'

export default async function AcademyLayout({ children }: { children: React.ReactNode }) {
    const access = await getAcademyAccess()
    if (!access.success) return <div className="mx-auto max-w-3xl p-4 sm:p-8"><AcademyEmptyState title="Akademia jest niedostępna" description={access.error} action={<Button asChild variant="outline"><Link href="/home">Wróć na stronę główną</Link></Button>} /></div>
    return <>{children}</>
}
