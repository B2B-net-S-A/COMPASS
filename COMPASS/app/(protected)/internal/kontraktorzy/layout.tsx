// Phase 33 — Kontraktorzy: TCM-only zone (admin OR talent_community).
import { requireTalentCommunityOrAdminLayout } from '@/lib/auth/internal-guard'
import { MovedToNexusBanner } from '@/components/internal/MovedToNexusBanner'

export const dynamic = 'force-dynamic'

export default async function KontraktorzyLayout({ children }: { children: React.ReactNode }) {
    await requireTalentCommunityOrAdminLayout()
    return (
        <>
            <MovedToNexusBanner module="care" className="mb-6" />
            {children}
        </>
    )
}
