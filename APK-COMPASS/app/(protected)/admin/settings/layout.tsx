'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Wrench, Trophy, Mail, Users, ShieldCheck, Crown, Palette } from 'lucide-react'
import { checkIsSuperAdmin } from '@/lib/actions/admin-management'

interface NavItem {
    title: string
    href: string
    icon: React.ComponentType<{ className?: string }>
    superAdminOnly?: boolean
}

interface NavGroup {
    label: string
    items: NavItem[]
}

const settingsGroups: NavGroup[] = [
    {
        label: "Konfiguracja",
        items: [
            {
                title: "Program Lojalnościowy",
                href: "/admin/settings/loyalty",
                icon: Trophy,
            },
            {
                title: "Powiadomienia Email",
                href: "/admin/settings/notifications",
                icon: Mail,
            },
            {
                title: "Zarządzanie Centralą",
                href: "/admin/settings/team",
                icon: Users,
            },
            {
                title: "Uprawnienia Ról",
                href: "/admin/settings/permissions",
                icon: ShieldCheck,
            },
            {
                title: "Administratorzy",
                href: "/admin/settings/admins",
                icon: Crown,
                superAdminOnly: true,
            },
        ]
    },
    {
        label: "Personalizacja",
        items: [
            {
                title: "Personalizacja i wygląd",
                href: "/admin/settings/appearance",
                icon: Palette,
            },
        ]
    },
    {
        label: "Narzędzia",
        items: [
            {
                title: "Konserwacja",
                href: "/admin/settings",
                icon: Wrench,
            },
        ]
    }
]

interface SettingsLayoutProps {
    children: React.ReactNode
}

export default function SettingsLayout({ children }: SettingsLayoutProps) {
    const pathname = usePathname()
    const [isSuperAdmin, setIsSuperAdmin] = useState(false)

    useEffect(() => {
        checkIsSuperAdmin().then(setIsSuperAdmin).catch(() => setIsSuperAdmin(false))
    }, [])

    return (
        <div className="space-y-6 p-6 pb-16">
            <div className="space-y-0.5">
                <h2 className="text-2xl font-bold tracking-tight">Ustawienia Systemu</h2>
                <p className="text-muted-foreground">
                    Zarządzaj konfiguracją aplikacji i dostępami administracyjnymi.
                </p>
            </div>
            <div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
                <aside className="-mx-4 lg:w-1/5 overflow-x-auto">
                    <nav className="flex flex-col space-y-4">
                        {settingsGroups.map((group) => {
                            const visibleItems = group.items.filter(item =>
                                !item.superAdminOnly || isSuperAdmin
                            )
                            if (visibleItems.length === 0) return null
                            return (
                                <div key={group.label}>
                                    <p className="px-3 mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                                        {group.label}
                                    </p>
                                    <div className="flex space-x-2 overflow-x-auto lg:flex-col lg:space-x-0 lg:space-y-1">
                                        {visibleItems.map((item) => (
                                            <Link
                                                key={item.href}
                                                href={item.href}
                                                className={cn(
                                                    "flex items-center gap-2 rounded-md p-3 text-sm font-medium hover:bg-muted/50 transition-colors",
                                                    pathname === item.href
                                                        ? "bg-muted hover:bg-muted"
                                                        : "transparent",
                                                    "justify-start",
                                                    item.superAdminOnly && "text-yellow-400/80"
                                                )}
                                            >
                                                <item.icon className="h-4 w-4" />
                                                {item.title}
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </nav>
                </aside>
                <div className="flex-1 lg:max-w-4xl">{children}</div>
            </div>
        </div>
    )
}
