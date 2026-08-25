'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
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
    HeartHandshake,
    Radar,
    FileSpreadsheet,
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
    user: {
        email?: string | null
        full_name?: string | null
        avatar_url?: string | null
    } | null
    permissions?: Record<PermissionFeature, PermissionValue>
    badges?: SidebarBadgeCounts
    // Phase 36: gate the "Skrzynka administracja@" link to inbox handlers / admin
    // (others get redirected away from /admin/inbox). Computed server-side in the layout.
    isInboxHandler?: boolean
    consultantSuccessEnabled?: boolean
    // Phase 45: per-user grant — additive Talent Community access without the role.
    hasTcmAccess?: boolean
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

export function Sidebar({
    role,
    user: _user,
    permissions,
    badges,
    isInboxHandler = false,
    consultantSuccessEnabled = false,
    hasTcmAccess = false,
}: SidebarProps) {
    const pathname = usePathname()
    const searchParams = useSearchParams()
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

    // Admin extras — platform administration only. Phase 34: the candidate inbox,
    // compliance and news-composer links moved into the unified Talent Community group below.
    const adminGroup: NavGroup = {
        heading: t('group_admin'),
        links: [
            { name: t('nav_admin_learning'), href: '/admin/learning', icon: ShieldCheck, feature: 'learning' },
            { name: t('nav_admin_support'), href: '/admin/support', icon: Inbox, feature: null, badgeCount: badges?.adminTickets },
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
            // exactMatch, żeby hub nie zostawał podświetlony na podstronie /internal/admin/role-defaults.
            { name: t('nav_internal_admin_hub'), href: '/internal/admin', icon: Users, feature: null, exactMatch: true },
            // Audyt 2026-08 (UI): /internal/admin/role-defaults to pełny CRUD (Faza 24),
            // do którego nie prowadził ŻADEN link — a przycisk „Wypełnij defaultem"
            // w edytorze timesheetu czyta właśnie te wpisy. Na produkcji tabela
            // timesheet_role_defaults miała 0 wierszy, bo nie było gdzie ich dodać.
            ...(isAdmin
                ? [{ name: 'Domyślne opisy timesheet', href: '/internal/admin/role-defaults', icon: FileSpreadsheet, feature: null }]
                : []),
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
            // Audyt 2026-08 (UI): usunięty `&scope=team` — strona czyta `scope` wyłącznie
            // dla panelu faktur, a zakres zespołu i tak wymusza serwer (listAllTimesheetsForMonth).
            { name: 'Timesheety zespołu', href: '/internal/admin?tab=timesheets', icon: Users, feature: null },
            ...(invoicesUiOn
                ? [{ name: 'Faktury zespołu (etap 1)', href: '/internal/admin?tab=invoices&scope=team', icon: Mailbox, feature: null }]
                : []),
        ],
    }

    // Phase 34 — unified "Talent Community" people-ops group for TCM + admin.
    // Consolidates what were three separate groups (Talent Community / Lifecycle / Kontraktorzy)
    // plus the candidate inbox, compliance and news-composer links that previously lived under
    // Administracja. A single definition is now shared identically by both roles, ordered by the
    // contractor journey / daily workflow: skrzynka → kontraktorzy (core) → onboarding pracowników → compliance → news.
    // Phase 35 — Talent Community group = the 5 contractor-journey sections (deep-links to the
    // Kontraktorzy hub tabs), then the cross-cutting TCM tools (Compliance, News composer).
    // Phase 36 — the administracja@ inbox is now a first-class link (gated to inbox handlers),
    // no longer mirrored as a read-only table inside "Sprawy otwarte". Employee onboarding/exit
    // is a SEPARATE population in the standalone "Pracownicy wewnętrzni" group below.
    // Phase 38 — Talent Community = the five contractor-lifecycle elements, all listed in the sidebar.
    // Four deep-link to the Kontraktorzy hub tabs (Rozmowy / Onboarding / Exit / Kontraktorzy);
    // Analityka is its own route. The administracja@ inbox/helpdesk and the News composer are NOT
    // part of the contractor five — they live in a separate "Komunikacja" group below (kept reachable).
    const ticketsBadge = (badges?.adminInbox ?? 0) + (badges?.adminTickets ?? 0)
    // People Ops — zunifikowany moduł (Pulpit / Onboarding / Exit / Kontraktorzy / Sprawy / Analityka / Szablony).
    // Zastąpił dawne osobne wejścia Talent Community + Zgłoszenia + Analityka (redirecty w page.tsx tych route'ów).
    const peopleOpsGroup: NavGroup = {
        heading: 'People Ops',
        links: [
            {
                name: 'People Ops',
                href: '/internal/people',
                icon: LayoutDashboard,
                feature: null,
                exactMatch: true,
                badgeCount: ticketsBadge > 0 ? ticketsBadge : undefined,
            },
            // Phase 46 — deep-link do zakładki mapy technologicznej (TCM intel).
            {
                name: 'Mapa technologiczna',
                href: '/internal/people?tab=mapa',
                icon: Radar,
                feature: null,
                exactMatch: true,
            },
            ...(consultantSuccessEnabled ? [{
                name: 'Consultant Success',
                href: '/internal/people/success',
                icon: HeartHandshake,
                feature: null,
            }] : []),
        ],
    }

    // Phase 38 — inbox/helpdesk + News composer kept reachable, just outside the contractor five.
    // Zgłoszenia przeniesione do People Ops (zakładka Sprawy). Tu zostaje tylko News composer.
    const komunikacjaGroup: NavGroup = {
        heading: 'Komunikacja',
        links: [
            { name: t('nav_admin_news'), href: '/admin/news', icon: PenSquare, feature: null },
        ],
    }

    // Audyt 2026-08 (UI): prop `isInboxHandler` był deklarowany, przekazywany przez
    // trzy warstwy (layout → AppLayout → Sidebar) i NIGDY nie destrukturyzowany, więc
    // link, który miał bramkować, w ogóle nie istniał. Skutek: obsługujący skrzynkę
    // BEZ dostępu do People Ops nie miał jak wejść na /admin/inbox — łącznie z linkiem
    // „wstecz" ze szczegółu zgłoszenia. Pokazujemy go tylko tym, którzy nie dostają
    // People Ops (tam ta sama tablica żyje jako zakładka Sprawy — Faza 38).
    const inboxOnlyGroup: NavGroup = {
        heading: 'Komunikacja',
        links: [
            {
                name: 'Skrzynka administracja@',
                href: '/admin/inbox',
                icon: Mailbox,
                feature: null,
                badgeCount: badges?.adminInbox,
            },
        ],
    }

    // Phase 22 / 34 — standalone Onboarding & Exit link for non-TCM/admin HR-zone roles
    // (internal / finanse / manager) so they can still reach their own / their team's
    // lifecycle forms. TCM + admin get this link inside talentCommunityGroup instead.
    const lifecycleGroup: NavGroup = {
        // Phase 36: renamed from "Lifecycle" so the population is unmistakable — this is the
        // internal-employee onboarding/exit, distinct from the contractor journey above.
        heading: 'Pracownicy wewnętrzni',
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
        // Phase 27i: finanse reaches the Administracja HR hub (invoices/bonuses/rates/clients tabs)
        // via this link — the dedicated "Finanse" group was removed.
        if (isAdmin || isFinance) out.push(internalAdminGroup)
        if (isManager) out.push(managerGroup)
        // Phase 38 — Talent Community = five contractor-lifecycle elements (TCM + admin), then the
        // separate Komunikacja group (administracja@ inbox/helpdesk + News composer).
        // Phase 45: a per-user has_tcm_access grant opens People Ops for a non-TCM role (e.g. a manager).
        const hasPeopleOps = isTalentCommunity || isAdmin || hasTcmAccess
        if (hasPeopleOps) {
            out.push(peopleOpsGroup)
            out.push(komunikacjaGroup)
        } else if (isInboxHandler) {
            out.push(inboxOnlyGroup)
        }
        // Internal-employee onboarding/exit (DIFFERENT population from contractors) — osobny link tylko dla
        // HR-zone BEZ TCM/admin (manager/internal/finanse). TCM+admin (i grant has_tcm_access) mają to w module People Ops.
        if (isHrZone && !isTalentCommunity && !isAdmin && !hasTcmAccess) out.push(lifecycleGroup)
        // Platform administration sits last (admin only).
        if (isAdmin) out.push(adminGroup)
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
            "border-r border-sidebar-border bg-sidebar text-sidebar-foreground h-screen sticky top-0 left-0 overflow-y-auto transition-colors duration-300",
            'hidden md:block md:w-64 lg:w-72',
        )}>
            <div className="flex h-20 items-center px-6 border-b border-sidebar-border gap-3">
                <Logo size="md" />
            </div>
            <nav className="flex flex-col gap-2 p-4" data-testid="sidebar-nav">
                {groups.map((group) => {
                    const visibleLinks = group.links.filter(filterByPermission)
                    if (visibleLinks.length === 0) return null

                    return (
                        <div key={group.heading} className="flex flex-col gap-1">
                            <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
                                {group.heading}
                            </div>
                            {visibleLinks.map((link) => {
                                const Icon = link.icon
                                // Deep-linki z ?tab= są „aktywne" tylko dla swojej zakładki.
                                // Audyt 2026-08 (UI): fallback `?? 'rozmowy'` to pozostałość po
                                // usuniętym hubie Kontraktorów — żaden hub nie ma dziś takiej
                                // zakładki, więc porównanie i tak zawsze wychodziło fałszywe.
                                const [linkPath, linkQuery] = link.href.split('?')
                                const isActive = linkQuery
                                    ? pathname === linkPath
                                        && searchParams.get('tab') === new URLSearchParams(linkQuery).get('tab')
                                    : link.exactMatch
                                        ? pathname === link.href
                                        : pathname === link.href || pathname.startsWith(`${link.href}/`)
                                const testId = `nav-${link.href.replace(/^\//, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/-+$/, '')}`

                                return (
                                    <Link
                                        key={link.href}
                                        href={link.href}
                                        data-testid={testId}
                                        className={cn(
                                            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                                            isActive
                                                ? "bg-primary/10 text-primary"
                                                : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground"
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
            <div className="p-4 border-t border-sidebar-border text-xs text-center text-sidebar-muted/70">
                COMPASS by {brandName}
            </div>
        </div>
    )
}
