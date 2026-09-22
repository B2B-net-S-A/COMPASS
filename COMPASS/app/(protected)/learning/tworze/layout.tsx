import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getAcademyAccess } from '@/lib/actions/academy-access'

export default async function AcademyAuthorLayout({ children }: { children: ReactNode }) {
    const result = await getAcademyAccess()
    if (!result.success || (!result.data.canTeach && !result.data.isAdmin)) redirect('/learning')
    return <>{children}</>
}
