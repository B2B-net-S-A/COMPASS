'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/context'
import {
    LayoutDashboard,
    GraduationCap,
    Trophy,
    Lightbulb,
    Newspaper,
    LifeBuoy,
    User,
    Settings,
    Cog,
    ShieldCheck,
    Inbox,
    Mailbox,
    PenSquare,
    Sparkles,
    Calendar,
    CalendarCheck,
    ClipboardList,
    Receipt,
    Users,
    type LucideIcon,
} from 'lucide-react'
import { Logo } from '@/components/common/Logo'
import { useTheme } from '@/lib/contexts/ThemeContext'
import type { PermissionFeature, PermissionValue } from '@/lib/types/permissions'

// Phase 7 (2026-05-04): Sidebar badge counts fetched server-side in
// app/(protected)/layout.tsx and passed through. Display badge if count > 0.
export interface SidebarBadgeCounts {
    news?: number
    adminTickets?: number
    adminPitches?: number
    adminInbox?: number
    consultantSupport?: number
}

interface SidebarProps {
    role: 'consultant' | 'admin' | 'internal'
    isOpen?: boolean
    setIsOpen?: (isOpen: boolean) => void
    user: {
        email?: string | null
        full_name?: string | null
        avatar_url?: string | null
    } | null
    permissions?: Record<PermissionFeature, PermissionValue>
    forMobile?: boolean
    badges?: SidebarBadgeCounts
}

interface NavLink {
    name: string
    href: string
    icon: LucideIcon
    feature: PermissionFeature | null
    badgeCount?: number
}

interface NavGroup {
    heading: string
    links: NavLink[]
}

export function Sidebar({ role, user, permissions, forMobile = false, badges }: SidebarProps) {
    const pathname = usePathname()
    const { t } = useTranslation()
    const { brandName } = useTheme()

    const isAdmin = role === 'admin'
    const isInternal = role === 'internal'

    // Consultant + admin both see the 5 platform panels.
    const platformGroups: NavGroup[] = [
        {
            heading: t('group_main'),
            links: [
                { name: t('nav_home'), href: '/home', icon: LayoutDashboard, feature: 'home' },
            ],
        },
        {
            heading: t('group_growth'),
            links: [
                { name: t('nav_learning'), href: '/learning', icon: GraduationCap, feature: 'learning' },
                { name: t('nav_league'), href: '/league', icon: Trophy, feature: 'league' },
                { name: t('nav_incubator'), href: '/incubator', icon: Lightbulb, feature: 'incubator' },
            ],
        },
        {
            heading: t('group_community'),
            links: [
                { name: t('nav_news'), href: '/news', icon: Newspaper, feature: 'news', badgeCount: badges?.news },
                { name: t('nav_support'), href: '/support', icon: LifeBuoy, feature: 'support', badgeCount: badges?.consultantSupport },
            ],
        },
        {
            heading: t('group_account'),
            links: [
                { name: t('nav_profile'), href: '/profile', icon: User, feature: null },
                { name: t('nav_settings'), href: '/settings', icon: Settings, feature: 'settings' },
            ],
        },
    ]

    // Admin extras — expanded as new admin pages ship per phase.
    const adminGroup: NavGroup = {
        heading: t('group_admin'),
        links: [
            { name: t('nav_admin_learning'), href: '/admin/learning', icon: ShieldCheck, feature: null },
            { name: t('nav_admin_support'), href: '/admin/support', icon: Inbox, feature: null, badgeCount: badges?.adminTickets },
            { name: t('nav_admin_inbox'), href: '/admin/inbox', icon: Mailbox, feature: null, badgeCount: badges?.adminInbox },
            { name: t('nav_admin_news'), href: '/admin/news', icon: PenSquare, feature: null },
            { name: t('nav_admin_incubator'), href: '/admin/incubator', icon: Sparkles, feature: null, badgeCount: badges?.adminPitches },
            { name: t('nav_admin_settings'), href: '/admin/settings', icon: Cog, feature: null },
        ],
    }

    // Phase 11: internal employee zone (attendance, vacations, timesheets).
    // Visible to internal employees and admins; hidden from consultants.
    const internalGroup: NavGroup = {
        heading: t('group_internal'),
        links: [
            { name: t('nav_internal_attendance'), href: '/internal/attendance', icon: CalendarCheck, feature: null },
            { name: t('nav_internal_calendar'), href: '/internal/calendar', icon: Calendar, feature: null },
            { name: t('nav_internal_leave'), href: '/internal/leave', icon: ClipboardList, feature: null },
            { name: t('nav_internal_timesheet'), href: '/internal/timesheet', icon: Receipt, feature: null },
        ],
    }

    // Phase 11: HR admin sub-zone (approvals, bulk export, employee profile editor).
    const internalAdminGroup: NavGroup = {
        heading: t('group_internal_admin'),
        links: [
            { name: t('nav_internal_admin_leave'), href: '/internal/admin/leave-requests', icon: ClipboardList, feature: null },
            { name: t('nav_internal_admin_timesheets'), href: '/internal/admin/timesheets', icon: Receipt, feature: null },
            { name: t('nav_internal_admin_employees'), href: '/internal/admin/employees', icon: Users, feature: null },
        ],
    }

    const groups: NavGroup[] = (() => {
        const out: NavGroup[] = [...platformGroups]
        if (isAdmin || isInternal) out.push(internalGroup)
        if (isAdmin) out.push(internalAdminGroup, adminGroup)
        return out
    })()

    // Apply per-feature permission filter (admins always pass).
    const filterByPermission = (link: NavLink): boolean => {
        if (isAdmin) return true
        if (!link.feature) return true
        if (!permissions) return true
        return permissions[link.feature] !== 'false'
    }

    return (
        <div className={cn(
            "border-r bg-card h-screen sticky top-0 left-0 overflow-y-auto transition-colors duration-300",
            forMobile ? 'flex flex-col w-full' : 'hidden md:block md:w-64 lg:w-72',
        )}>
            <div className="flex h-20 items-center px-6 border-b border-border gap-3">
                <Logo size="md" />
            </div>
            <nav className="flex flex-col gap-2 p-4" data-testid="sidebar-nav">
                {groups.map((group) => {
                    const visibleLinks = group.links.filter(filterByPermission)
                    if (visibleLinks.length === 0) return null

                    return (
                        <div key={group.heading} className="flex flex-col gap-1">
                            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                                {group.heading}
                            </div>
                            {visibleLinks.map((link) => {
                                const Icon = link.icon
                                const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
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
                                        <span className="flex-1">{link.name}</span>
                                        {link.badgeCount !== undefined && link.badgeCount > 0 && (
                                            <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold tabular-nums">
                                                {link.badgeCount > 99 ? '99+' : link.badgeCount}
                                            </span>
                                        )}
                                    </Link>
                                )
                            })}
                        </div>
                    )
                })}
            </nav>
            <div className="p-4 border-t border-border text-xs text-center text-muted-foreground/50">
                ComPass by {brandName}
            </div>
        </div>
    )
}
