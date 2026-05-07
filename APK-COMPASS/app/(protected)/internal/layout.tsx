import { requireInternalOrAdminLayout } from '@/lib/auth/internal-guard'

export const dynamic = 'force-dynamic'

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
    await requireInternalOrAdminLayout()
    return <>{children}</>
}
