import { requireTalentCommunityOrAdminLayout } from '@/lib/auth/internal-guard'

export const dynamic = 'force-dynamic'

// Phase 46 — pełnostronicowe widoki mapy technologicznej (wywiad, karta,
// w Etapie 2 karta klienta). Guard identyczny jak hub People Ops: admin |
// talent_community | grant has_tcm_access. Konsultanci nie mają tu wstępu.
export default async function MapaLayout({ children }: { children: React.ReactNode }) {
    await requireTalentCommunityOrAdminLayout()
    return <>{children}</>
}
