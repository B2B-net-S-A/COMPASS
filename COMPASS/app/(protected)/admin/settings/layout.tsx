import { requireAdminLayout } from '@/lib/auth/internal-guard'
import SettingsNav from '@/components/admin/SettingsNav'

// Audyt 2026-08 (A4.4): katalog app/(protected)/admin/ miał wyłącznie error.tsx
// i loading.tsx, a nadrzędny layout sprawdza tylko, czy ktoś jest zalogowany.
// Bramkowanie po roli robiło jedynie middleware i tylko dla /admin/inbox,
// /admin/compliance i /admin/news — pozostałe ekrany administracyjne były
// otwarte dla każdego konta, łącznie z konsultantem zewnętrznym.
//
// Ten layout jako jedyny z sześciu MIAŁ już zawartość: 118-linijkową nawigację
// sekcji Ustawień. Nawigacja jest komponentem klienckim (usePathname + stan
// checkIsSuperAdmin), a guard musi działać po stronie serwera — stąd podział
// na serwerowy layout i kliencki components/admin/SettingsNav.tsx.
export default async function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
    await requireAdminLayout()
    return <SettingsNav>{children}</SettingsNav>
}
