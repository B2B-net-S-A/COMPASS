import { requireAdminLayout } from '@/lib/auth/internal-guard'

// Layout sekcji wpuszcza też TCM do kolejki akceptacji (B3.10). Ekrany administracji
// zostają wyłącznie dla admina, więc każdy podkatalog poza [id] re-eksportuje tę bramkę;
// pilnuje tego admin/learning/__tests__/layout.test.tsx.
export default async function AcademyAdminOnlyLayout({ children }: { children: React.ReactNode }) {
    await requireAdminLayout()
    return <>{children}</>
}
