'use client'

import Link from 'next/link'
import { Sidebar, type SidebarBadgeCounts } from './Sidebar'
import { MobileMenu } from './MobileMenu'
import { TopBar } from './TopBar'
import { LanguageProvider } from '@/lib/i18n/context'
import { Logo } from '@/components/common/Logo'
import { PermissionsProvider } from '@/lib/hooks/usePermissions'
import type { PermissionFeature, PermissionValue } from '@/lib/types/permissions'

interface AppLayoutProps {
    children: React.ReactNode
    user: any
    role: 'consultant' | 'admin' | 'centrala' | 'administrator'
    permissions?: Record<PermissionFeature, PermissionValue>
    sidebarBadges?: SidebarBadgeCounts
}

export function AppLayout({ children, user, role, permissions, sidebarBadges }: AppLayoutProps) {
    return (
        <LanguageProvider>
            <PermissionsProvider permissions={permissions ?? null} role={role}>
                <div className="flex min-h-screen bg-background">
                    {/* Desktop sidebar — always visible md+ */}
                    <Sidebar role={role} user={user} permissions={permissions} badges={sidebarBadges} />

                    <div className="flex flex-1 flex-col">
                        <TopBar user={user} />

                        <main className="flex-1 p-4 md:p-8 pb-28 md:pb-8 overflow-y-auto">
                            {children}
                        </main>

                        <footer className="border-t border-border p-6 pr-32 md:pr-36 bg-background/40 hidden md:block">
                            <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <Logo size="sm" variant="monochrome" showText={false} />
                                    <span>© {new Date().getFullYear()} APK Compass. All rights reserved.</span>
                                </div>
                                <div className="flex gap-4">
                                    <Link href="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
                                    <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
                                    <Link href="/support" className="hover:text-foreground transition-colors">Support</Link>
                                </div>
                            </div>
                        </footer>
                    </div>

                    {/* Mobile bottom-nav — fixed, mobile only */}
                    <MobileMenu role={role} user={user} />
                </div>
            </PermissionsProvider>
        </LanguageProvider>
    )
}
