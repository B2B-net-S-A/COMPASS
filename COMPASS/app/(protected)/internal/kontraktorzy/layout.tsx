// Phase 33 — Kontraktorzy: TCM-only zone (admin OR talent_community).
import { requireTalentCommunityOrAdminLayout } from '@/lib/auth/internal-guard'

export const dynamic = 'force-dynamic'

export default async function KontraktorzyLayout({ children }: { children: React.ReactNode }) {
    await requireTalentCommunityOrAdminLayout()
    return <>{children}</>
}
