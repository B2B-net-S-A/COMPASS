'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Sidebar } from './Sidebar'
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
}

export function AppLayout({ children, user, role, permissions }: AppLayoutProps) {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const pathname = usePathname()

    useEffect(() => {
        setMobileMenuOpen(false)
    }, [pathname])

    useEffect(() => {
        document.body.style.overflow = mobileMenuOpen ? 'hidden' : ''
        return () => { document.body.style.overflow = '' }
    }, [mobileMenuOpen])

    return (
        <LanguageProvider>
            <PermissionsProvider permissions={permissions ?? null} role={role}>
                <div className="flex min-h-screen bg-background">
                    {/* Desktop Sidebar */}
                    <Sidebar role={role} user={user} permissions={permissions} />

                    {/* Mobile sidebar overlay */}
                    {mobileMenuOpen && (
                        <>
                            <div
                                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
                                onClick={() => setMobileMenuOpen(false)}
                            />
                            <div className="fixed inset-y-0 left-0 z-50 w-64 md:hidden">
                                <Sidebar role={role} user={user} permissions={permissions} forMobile />
                            </div>
                        </>
                    )}

                    <div className="flex flex-1 flex-col">
                        <TopBar
                            user={user}
                            onMenuToggle={() => setMobileMenuOpen(!mobileMenuOpen)}
                        />

                        <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-y-auto">
                            {children}
                        </main>

                        <footer className="border-t border-border p-6 pr-32 md:pr-36 bg-background/40">
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

                    {/* Bottom Mobile Menu */}
                    <MobileMenu role={role} user={null} />
                </div>
            </PermissionsProvider>
        </LanguageProvider>
    )
}
