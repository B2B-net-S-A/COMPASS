import { requireAdminLayout } from '@/lib/auth/internal-guard'

// Audyt 2026-08 (A4.4): katalog app/(protected)/admin/ miał wyłącznie error.tsx
// i loading.tsx, a nadrzędny layout sprawdza tylko, czy ktoś jest zalogowany.
// Bramkowanie po roli robiło jedynie middleware i tylko dla /admin/inbox,
// /admin/compliance i /admin/news — pozostałe sześć ekranów administracyjnych
// było otwarte dla każdego konta, łącznie z konsultantem zewnętrznym.
//
// Świadomie NIE ma jednego layoutu na /admin: inbox, compliance i news są
// celowo dostępne dla Talent Community i posiadaczy grantów (middleware.ts:120-131),
// więc wspólna bramka administratora odcięłaby im pracę.
export default async function AdminSectionLayout({ children }: { children: React.ReactNode }) {
    await requireAdminLayout()
    return <>{children}</>
}
