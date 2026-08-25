'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/context'
import { isInvoicesEnabled } from '@/lib/feature-flags'
import { isHrZoneRole } from '@/lib/types/role'
import {
    LayoutDashboard,
    GraduationCap,
    Newspaper,
    LifeBuoy,
    Lightbulb,
    User,
    Settings,
    Bell,
    MoreHorizontal,
    CalendarCheck,
    Users,
    type LucideIcon,
} from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { isFeatureComingSoon } from '@/lib/types/permissions'

interface MobileMenuProps {
    role: 'consultant' | 'admin' | 'internal' | 'finanse' | 'manager' | 'talent_community'
    user: {
        email?: string | null
        full_name?: string | null
        avatar_url?: string | null
        bio?: string | null
    } | null
}

interface NavItem {
    name: string
    href: string
    icon: LucideIcon
}

export function MobileMenu({ role }: MobileMenuProps) {
    const pathname = usePathname()
    const { t } = useTranslation()
    const [moreOpen, setMoreOpen] = useState(false)

    // 4 fixed bottom-nav slots + More drawer (5th slot).
    // Learning + League są coming-soon, więc bottom nav promuje pozostałe
    // platform modules: Incubator + Support (przeniesione z drawer'a).
    const bottomNav: NavItem[] = [
        { name: t('mobile_home'), href: '/home', icon: LayoutDashboard },
        { name: t('mobile_news'), href: '/news', icon: Newspaper },
        { name: t('mobile_incubator'), href: '/incubator', icon: Lightbulb },
        { name: t('mobile_support'), href: '/support', icon: LifeBuoy },
    ]

    // Items shown inside the "More" drawer (Incubator + Support przeniesione na bottom).
    const moreItems: NavItem[] = [
        { name: t('nav_notifications'), href: '/notifications', icon: Bell },
        { name: t('nav_profile'), href: '/profile', icon: User },
        { name: t('nav_settings'), href: '/settings', icon: Settings },
    ]

    const showAdminLearning = !isFeatureComingSoon('learning')

    const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`)

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex h-16 w-full items-center justify-around border-t bg-card px-2 md:hidden">
            {bottomNav.map((link) => {
                const Icon = link.icon
                const active = isActive(link.href)
                return (
                    <Link
                        key={link.href}
                        href={link.href}
                        data-testid={`mobile-nav-${link.href.replace(/^\//, '')}`}
                        aria-label={link.name}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                            "flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors min-w-[56px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                            active ? "text-primary" : "text-muted-foreground hover:text-primary"
                        )}
                    >
                        <Icon className="h-5 w-5" aria-hidden="true" />
                        <span className="text-[10px]">{link.name}</span>
                    </Link>
                )
            })}

            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                <SheetTrigger asChild>
                    <button
                        data-testid="mobile-nav-more"
                        aria-label={t('mobile_more')}
                        className={cn(
                            "flex flex-col items-center justify-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors min-w-[56px] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                            "text-muted-foreground hover:text-primary"
                        )}
                    >
                        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                        <span className="text-[10px]">{t('mobile_more')}</span>
                    </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-2xl border-t">
                    <SheetHeader>
                        <SheetTitle>{t('more')}</SheetTitle>
                    </SheetHeader>
                    <nav className="mt-4 grid grid-cols-2 gap-2 pb-4">
                        {moreItems.map((item) => {
                            const Icon = item.icon
                            const active = isActive(item.href)
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setMoreOpen(false)}
                                    className={cn(
                                        "flex items-center gap-3 rounded-lg border p-3 text-sm font-medium transition-colors",
                                        active
                                            ? "border-primary bg-primary/10 text-primary"
                                            : "border-border bg-card text-muted-foreground hover:text-primary hover:bg-muted"
                                    )}
                                >
                                    <Icon className="h-5 w-5" />
                                    <span>{item.name}</span>
                                </Link>
                            )
                        })}
                    </nav>
                    {/* Audyt 2026-08 (C7): brama wymieniała 3 role z 5 należących do strefy HR —
                        manager i talent_community w ogóle nie widzieli tej sekcji na telefonie.
                        Wejście do /internal działało (middleware przekierowuje /home → /internal),
                        więc to nie była awaria, tylko brak skrótów do własnych narzędzi. */}
                    {isHrZoneRole(role) && (
                        <div className="border-t pt-4 pb-2">
                            <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                                {t('group_internal')}
                            </p>
                            <Link
                                href="/internal"
                                onClick={() => setMoreOpen(false)}
                                className="mt-2 flex items-center gap-3 rounded-lg p-3 text-sm font-medium text-muted-foreground hover:text-primary hover:bg-muted"
                            >
                                <CalendarCheck className="h-5 w-5" />
                                {t('nav_internal_hub')}
                            </Link>
                            {/* Manager: kolejka timesheetów i wniosków zespołu żyje w tym samym hubie. */}
                            {(role === 'admin' || role === 'manager') && (
                                <Link
                                    href="/internal/admin"
                                    onClick={() => setMoreOpen(false)}
                                    className="flex items-center gap-3 rounded-lg p-3 text-sm font-medium text-muted-foreground hover:text-primary hover:bg-muted"
                                >
                                    <Users className="h-5 w-5" />
                                    {t('nav_internal_admin_hub')}
                                </Link>
                            )}
                            {/* Phase 19a/d — Finanse: panel akceptacji faktur.
                                Audyt 2026-08 (C7): moduł faktur jest wyłączony flagą od 2026-05-19,
                                a link prowadził w pustkę. Bramkujemy go tą samą flagą co resztę UI,
                                żeby wrócił sam, gdy faktury zostaną włączone. */}
                            {role === 'finanse' && isInvoicesEnabled() && (
                                <Link
                                    href="/internal/admin?tab=invoices"
                                    onClick={() => setMoreOpen(false)}
                                    className="flex items-center gap-3 rounded-lg p-3 text-sm font-medium text-muted-foreground hover:text-primary hover:bg-muted"
                                >
                                    <Users className="h-5 w-5" />
                                    Faktury do akceptacji
                                </Link>
                            )}
                        </div>
                    )}

                    {role === 'admin' && (
                        <div className="border-t pt-4 pb-2">
                            <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                                {t('group_admin')}
                            </p>
                            {showAdminLearning && (
                                <Link
                                    href="/admin/learning"
                                    onClick={() => setMoreOpen(false)}
                                    className="mt-2 flex items-center gap-3 rounded-lg p-3 text-sm font-medium text-muted-foreground hover:text-primary hover:bg-muted"
                                >
                                    <GraduationCap className="h-5 w-5" />
                                    {t('nav_admin_learning')}
                                </Link>
                            )}
                            <Link
                                href="/admin/settings"
                                onClick={() => setMoreOpen(false)}
                                className={cn(
                                    "flex items-center gap-3 rounded-lg p-3 text-sm font-medium text-muted-foreground hover:text-primary hover:bg-muted",
                                    showAdminLearning ? '' : 'mt-2',
                                )}
                            >
                                <Settings className="h-5 w-5" />
                                {t('nav_admin_settings')}
                            </Link>
                        </div>
                    )}
                </SheetContent>
            </Sheet>
        </div>
    )
}
