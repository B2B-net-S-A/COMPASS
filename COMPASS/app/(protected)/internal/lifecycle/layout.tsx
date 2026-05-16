import { requireLifecycleHubLayout } from '@/lib/auth/internal-guard'

export const dynamic = 'force-dynamic'

export default async function LifecycleLayout({ children }: { children: React.ReactNode }) {
    await requireLifecycleHubLayout()
    return <>{children}</>
}
