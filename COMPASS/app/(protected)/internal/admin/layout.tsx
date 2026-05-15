// Phase 20 (2026-05-16): rozszerzony z `requireAdminLayout` (admin-only) na
// `requireInternalAdminAreaLayout` (admin + finanse + manager). Każdy tab ma
// własny role-scope (admin widzi wszystko, finanse widzi tylko 'invoices',
// manager widzi 'timesheets' + 'invoices' filtrowane do swojego zespołu).
import { requireInternalAdminAreaLayout } from '@/lib/auth/internal-guard'

export const dynamic = 'force-dynamic'

export default async function InternalAdminLayout({ children }: { children: React.ReactNode }) {
    await requireInternalAdminAreaLayout()
    return <>{children}</>
}
