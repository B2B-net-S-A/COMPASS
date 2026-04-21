'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/context'
import {
    LayoutDashboard,
    Briefcase,
    User,
    MoreHorizontal,
    Users,
    Settings,
    ShieldAlert,
} from 'lucide-react'

interface MobileMenuProps {
    role: 'consultant' | 'admin' | 'centrala' | 'administrator'
    user: {
        email?: string | null
        full_name?: string | null
        avatar_url?: string | null
        bio?: string | null
    } | null
}

export function MobileMenu({ role }: MobileMenuProps) {
    const pathname = usePathname()
    const { t } = useTranslation()

    const consultantLinks = [
        { name: 'Mój Panel', href: '/home', icon: LayoutDashboard },
        { name: t('projects'), href: '/projects', icon: Briefcase },
        { name: t('more'), href: '/more', icon: MoreHorizontal },
    ]

    const adminLinks = [
        { name: 'Mój Panel', href: '/home', icon: LayoutDashboard },
        { name: t('consultants'), href: '/admin/consultants', icon: Users },
        { name: t('projects'), href: '/admin/projects', icon: Briefcase },
        { name: t('settings'), href: '/admin/settings', icon: Settings },
    ]

    const links = (role === 'admin' || role === 'centrala' || role === 'administrator') ? adminLinks : consultantLinks

    // Add Access Management link for Administrator only
    if (role === 'administrator' && !adminLinks.some(l => l.href === '/admin/settings/access')) {
        adminLinks.splice(adminLinks.findIndex(l => l.href === '/admin/settings'), 0, {
            name: 'Zarządzanie Dostępem',
            href: '/admin/settings/access',
            icon: ShieldAlert
        })
    }

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex h-16 w-full items-center justify-around border-t bg-card px-2 md:hidden">
            {links.map((link) => {
                const Icon = link.icon
                const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)

                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        className={cn(
                            "flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors",
                            isActive
                                ? "text-primary"
                                : "text-muted-foreground hover:text-primary"
                        )}
                    >
                        <Icon className="h-5 w-5" />
                        <span className="text-[10px]">{link.name}</span>
                    </Link>
                )
            })}
        </div>
    )
}
