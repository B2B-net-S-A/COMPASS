import { requireAdminLayout } from '@/lib/auth/internal-guard'

export const dynamic = 'force-dynamic'

export default async function InternalAdminLayout({ children }: { children: React.ReactNode }) {
    await requireAdminLayout()
    return <>{children}</>
}
