import { requireLifecycleHubLayout } from '@/lib/auth/internal-guard'
import { MovedToNexusBanner } from '@/components/internal/MovedToNexusBanner'

export const dynamic = 'force-dynamic'

export default async function LifecycleLayout({ children }: { children: React.ReactNode }) {
    await requireLifecycleHubLayout()
    return (
        <>
            <MovedToNexusBanner module="lifecycle" className="mb-6" />
            {children}
        </>
    )
}
