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
    CalendarCheck,
    Users,
    ClipboardCheck,
    Plane,
    Wallet,
    Briefcase,
    type LucideIcon,
} from 'lucide-react'
import { Logo } from '@/components/common/Logo'
import { useTheme } from '@/lib/contexts/ThemeContext'
import { isFeatureComingSoon, type PermissionFeature, type PermissionValue } from '@/lib/types/permissions'
import { isInvoicesEnabled } from '@/lib/feature-flags'

// Phase 7 (2026-05-04): Sidebar badge counts fetched server-side in
// app/(protected)/layout.tsx and passed through. Display badge if count > 0.
export interface SidebarBadgeCounts {
    news?: number
    adminTickets?: number
    adminPitches?: number
    adminInbox?: number
    consultantSupport?: number
    // Phase 22 — lifecycle module: overdue tasks + own pending check-ins + exit interviews to review.
    lifecyclePendingTasks?: number
    // Phase 25e — currently active leaves in user's scope (team / colleagues).
    activeLeaves?: number
    // Phase 25e — self is currently on leave (visual cue on /internal link).
    selfOnLeave?: boolean
}

interface SidebarProps {
    // Phase 20: extended to 6 roles. Server-side filter decides which links are visible.
    role: 'consultant' | 'admin' | 'internal' | 'finanse' | 'manager' | 'talent_community'
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
    /** When true, link is "active" only when pathname matches exactly. */
    exactMatch?: boolean
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
    // Phase 19a: Finanse — sees only invoice review panel (subset of internal admin).
    const isFinance = role === 'finanse'
    // Phase 20: dodatkowe role
    const isManager = role === 'manager'
    const isTalentCommunity = role === 'talent_community'
    const isConsultant = role === 'consultant'
    // HR-zone = wszyscy oprócz konsultanta IT.
    const isHrZone = isAdmin || isInternal || isFinance || isManager || isTalentCommunity

    // Phase 20: Konsultant IT + admin widzą platform panels (home/learning/league).
    // Pozostali widzą tylko wspólne (incubator/news/support) + HR Hub.
    const fullPlatformGroups: NavGroup[] = [
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

    // Phase 20: dla HR-zone (oprócz admina) — tylko wspólne sekcje (Inkubator/Aktualności/Support) + Account.
    const commonHrZoneGroups: NavGroup[] = [
        {
            heading: t('group_growth'),
            links: [
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

    const platformGroups: NavGroup[] = (isAdmin || isConsultant)
        ? fullPlatformGroups
        : commonHrZoneGroups

    // Admin extras — expanded as new admin pages ship per phase.
    const adminGroup: NavGroup = {
        heading: t('group_admin'),
        links: [
            { name: t('nav_admin_learning'), href: '/admin/learning', icon: ShieldCheck, feature: 'learning' },
            { name: t('nav_admin_support'), href: '/admin/support', icon: Inbox, feature: null, badgeCount: badges?.adminTickets },
            { name: t('nav_admin_inbox'), href: '/admin/inbox', icon: Mailbox, feature: null, badgeCount: badges?.adminInbox },
            { name: t('nav_admin_news'), href: '/admin/news', icon: PenSquare, feature: null },
            { name: t('nav_admin_incubator'), href: '/admin/incubator', icon: Sparkles, feature: null, badgeCount: badges?.adminPitches },
            { name: t('nav_admin_settings'), href: '/admin/settings', icon: Cog, feature: null },
        ],
    }

    // Phase 12: collapsed to single-link hubs (sub-pages live behind ?tab=).
    // exactMatch on /internal so it doesn't stay highlighted while user is on /internal/admin.
    // Phase 25e:
    //   - badge shows count of currently-active leaves in user's scope (team / colleagues / manager)
    //   - icon swaps to Plane when self is on leave (visual cue)
    const internalGroup: NavGroup = {
        heading: t('group_internal'),
        links: [
            {
                name: badges?.selfOnLeave
                    ? `${t('nav_internal_hub')} (jesteś na urlopie)`
                    : t('nav_internal_hub'),
                href: '/internal',
                icon: badges?.selfOnLeave ? Plane : CalendarCheck,
                feature: null,
                exactMatch: true,
                badgeCount: badges?.activeLeaves,
            },
            // Phase 27c — Payroll widoczne dla HR-zone (każdy widzi własne; manager/finanse/admin widzą więcej).
            {
                name: 'Payroll',
                href: '/internal/payroll',
                icon: Wallet,
                feature: null,
            },
            // Phase 28 — Moje placementy (DL/Rekruter widzą własne umowy + prognozę premii).
            {
                name: 'Moje placementy',
                href: '/internal/placements',
                icon: Briefcase,
                feature: null,
            },
        ],
    }

    const internalAdminGroup: NavGroup = {
        heading: t('group_internal_admin'),
        links: [
            { name: t('nav_internal_admin_hub'), href: '/internal/admin', icon: Users, feature: null },
        ],
    }

    // Phase 27i: the dedicated "Finanse" sidebar group was removed. Faktury, Premie,
    // Stawki i Umowy and Klienci all live as tabs inside the Administracja HR hub now;
    // finanse reaches them via the internalAdminGroup link (see groups assembly below).
    // invoicesUiOn is still used by managerGroup.
    const invoicesUiOn = isInvoicesEnabled()

    // Phase 20 + 26: Manager group — team leave + timesheet (always) + invoice approvals (only when invoices UI enabled).
    const managerGroup: NavGroup = {
        heading: 'Mój zespół',
        links: [
            { name: 'Wnioski urlopowe zespołu', href: '/internal/admin?tab=leave-requests', icon: Plane, feature: null },
            { name: 'Timesheety zespołu', href: '/internal/admin?tab=timesheets&scope=team', icon: Users, feature: null },
            ...(invoicesUiOn
                ? [{ name: 'Faktury zespołu (etap 1)', href: '/internal/admin?tab=invoices&scope=team', icon: Mailbox, feature: null }]
                : []),
        ],
    }

    // Phase 20: Talent Community Manager group — inbox + compliance + news composer.
    const tcmGroup: NavGroup = {
        heading: 'Talent Community',
        links: [
            { name: 'Kolejka zgłoszeń', href: '/admin/inbox', icon: Inbox, feature: null, badgeCount: badges?.adminInbox },
            { name: 'Compliance', href: '/admin/compliance', icon: ShieldCheck, feature: null },
            { name: 'News composer', href: '/admin/news', icon: PenSquare, feature: null },
        ],
    }

    // Phase 22 — Lifecycle hub for TCM, admin, and managers (managers see team scope).
    // Sidebar link is rendered also for HR-zone employees so they can reach their own onboarding/exit form.
    const lifecycleGroup: NavGroup = {
        heading: 'Lifecycle',
        links: [
            {
                name: 'Onboarding & Exit',
                href: '/internal/lifecycle',
                icon: ClipboardCheck,
                feature: null,
                badgeCount: badges?.lifecyclePendingTasks,
            },
        ],
    }

    const groups: NavGroup[] = (() => {
        const out: NavGroup[] = [...platformGroups]
        if (isHrZone) out.push(internalGroup)
        if (isAdmin) out.push(internalAdminGroup, adminGroup)
        // Phase 27i: finanse reaches the Administracja HR hub (invoices/bonuses/rates/clients tabs)
        // via this link — the dedicated "Finanse" group was removed.
        else if (isFinance) out.push(internalAdminGroup)
        if (isManager) out.push(managerGroup)
        if (isTalentCommunity) out.push(tcmGroup)
        if (isHrZone) out.push(lifecycleGroup)
        return out
    })()

    // Apply per-feature permission filter (admins always pass).
    // Globalny gate dla coming-soon idzie pierwszy — ukrywa nawet adminom.
    const filterByPermission = (link: NavLink): boolean => {
        if (isFeatureComingSoon(link.feature)) return false
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
                                const isActive = link.exactMatch
                                    ? pathname === link.href
                                    : pathname === link.href || pathname.startsWith(`${link.href}/`)
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
                COMPASS by {brandName}
            </div>
        </div>
    )
}
