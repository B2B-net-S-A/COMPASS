import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Mail, Crown, KeyRound } from 'lucide-react'

// Audyt 2026-08 (B3) — strona była hostem jednego przycisku „Czyszczenie duplikatów",
// który celował w public.candidates. Ta tabela została przeniesiona do schematu
// compass_legacy migracją 20260504000001_phase1_archive_legacy_ats, więc PostgREST
// nie widział jej od maja i akcja zawsze kończyła się błędem. Usunięta razem
// z lib/actions/maintenance.ts (był to niezabezpieczony server action).
// Route zostaje, bo Sidebar i MobileMenu linkują tu jako wejście do sekcji ustawień.

const sections = [
    {
        title: 'Powiadomienia Email',
        description: 'Szablony i adresy odbiorców powiadomień systemowych.',
        href: '/admin/settings/notifications',
        icon: Mail,
    },
    {
        title: 'Administratorzy',
        description: 'Lista Super Adminów. Dostęp tylko dla Super Admina.',
        href: '/admin/settings/admins',
        icon: Crown,
    },
    {
        title: 'Użytkownicy',
        description: 'Konta, role, reset hasła, blokady. Dostęp tylko dla Super Admina.',
        href: '/admin/settings/users',
        icon: KeyRound,
    },
]

export default function AdminSettingsPage() {
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h3 className="text-lg font-medium">Ustawienia</h3>
                <p className="text-sm text-muted-foreground">
                    Wybierz sekcję z menu po lewej lub skorzystaj ze skrótów poniżej.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {sections.map((section) => (
                    <Link key={section.href} href={section.href} className="block">
                        <Card className="bg-card border-border h-full transition-colors hover:bg-muted/40">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <section.icon className="w-5 h-5" />
                                    {section.title}
                                </CardTitle>
                                <CardDescription>{section.description}</CardDescription>
                            </CardHeader>
                            <CardContent />
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    )
}
