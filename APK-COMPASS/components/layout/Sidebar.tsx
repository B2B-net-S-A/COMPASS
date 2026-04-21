'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/context'
import {
    LayoutDashboard,
    Briefcase,
    FileText,
    Users,
    Settings,
    Building2,
    BookOpen,
    Box,
    Trophy,
    Rocket,
    MessageCircle,
    TrendingUp,
    KanbanSquare,
    Shield,
} from 'lucide-react'
import { Logo } from '@/components/common/Logo'
import { useTheme } from '@/lib/contexts/ThemeContext'
import type { PermissionFeature, PermissionValue } from '@/lib/types/permissions'

interface SidebarProps {
    role: 'consultant' | 'admin' | 'centrala' | 'administrator'
    isOpen?: boolean
    setIsOpen?: (isOpen: boolean) => void
    user: {
        email?: string | null
        full_name?: string | null
        avatar_url?: string | null
    } | null
    permissions?: Record<PermissionFeature, PermissionValue>
    forMobile?: boolean
}

// Map each sidebar link to its permission feature key
const LINK_PERMISSION_MAP: Record<string, PermissionFeature> = {
    '/home': 'dashboard',
    '/centrala': 'service_hub',
    '/admin/centrala': 'service_hub',
    '/messages': 'messages',
    '/projects': 'projects',
    '/admin/projects': 'projects',
    '/loyalty': 'loyalty',
    '/documents': 'documents',
    '/development': 'development',
    '/admin/candidates': 'candidates',
    '/admin/referrals': 'referrals',
    '/admin/import': 'import',
    '/admin/settings': 'settings',
    '/admin/rates': 'rates',
}

export function Sidebar({ role, user, permissions, forMobile = false }: SidebarProps) {
    const pathname = usePathname()
    const { t } = useTranslation()
    const { brandName } = useTheme()

    const consultantLinks = [
        { name: 'Mój Panel', href: '/home', icon: LayoutDashboard },
        { name: 'Service Hub', href: '/centrala', icon: Box },
        { name: 'Wiadomości', href: '/messages', icon: MessageCircle },
        { name: t('projects'), href: '/projects', icon: Briefcase },
        { name: 'Program lojalnościowy', href: '/loyalty', icon: Trophy },
        { name: t('documents'), href: '/documents', icon: FileText },
        { name: 'Strefa Rozwoju', href: '/development', icon: BookOpen },
        { name: 'Ustawienia', href: '/more', icon: Settings },
    ]

    const adminLinks = [
        { name: 'Mój Panel', href: '/home', icon: LayoutDashboard },
        { name: 'Service Hub', href: '/admin/centrala', icon: Building2 },
        { name: 'Wiadomości', href: '/messages', icon: MessageCircle },
        { name: 'Konsultanci', href: '/admin/candidates', icon: Users },
        { name: t('projects'), href: '/admin/projects', icon: Briefcase },
        { name: t('referrals'), href: '/admin/referrals', icon: Users },
        { name: 'Import', href: '/admin/import', icon: FileText },
        { name: 'Stawki', href: '/admin/rates', icon: TrendingUp },
        { name: 'Zadania', href: '/admin/tasks', icon: KanbanSquare },
        { name: 'Program lojalnościowy', href: '/loyalty', icon: Trophy },
        { name: 'Strefa Rozwoju', href: '/development', icon: Rocket },
        { name: 'Compliance', href: '/admin/compliance', icon: Shield },
        { name: t('settings'), href: '/admin/settings', icon: Settings },
    ]

    const baseLinks = (role === 'admin' || role === 'centrala' || role === 'administrator') ? adminLinks : consultantLinks

    // Filter links based on permissions
    // Administrators always see everything, no filtering applied
    const isAdmin = role === 'administrator' || role === 'admin'
    const links = isAdmin ? baseLinks : baseLinks.filter(link => {
        const featureKey = LINK_PERMISSION_MAP[link.href]
        if (!featureKey) return true // No mapping = always show
        if (!permissions) return true // No permissions loaded = show all (fallback)
        const value = permissions[featureKey]
        // Show link unless permission is explicitly 'false'
        return value !== 'false'
    })

    return (
        <div className={cn(
            "border-r bg-card h-screen sticky top-0 left-0 overflow-y-auto transition-colors duration-300",
            forMobile ? 'flex flex-col w-full' : 'hidden md:block md:w-64 lg:w-72',
        )}>
            <div className="flex h-20 items-center px-6 border-b border-border gap-3">
                <Logo size="md" />
            </div>
            <nav className="flex flex-col gap-1 p-4" data-testid="sidebar-nav">
                {links.map((link) => {
                    const Icon = link.icon
                    const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
                    // Generate testid from href: /home → nav-home, /admin/settings → nav-admin-settings
                    const testId = `nav-${link.href.replace(/^\//, '').replace(/\//g, '-')}`

                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            data-testid={testId}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all hover:text-primary",
                                isActive
                                    ? "bg-primary/10 text-primary"
                                    : "text-muted-foreground hover:bg-muted"
                            )}
                        >
                            <Icon className="h-4 w-4" />
                            {link.name}
                        </Link>
                    )
                })}
            </nav>
            <div className="p-4 border-t border-border text-xs text-center text-muted-foreground/50">
                ComPass by {brandName}
            </div>
        </div>
    )
}
