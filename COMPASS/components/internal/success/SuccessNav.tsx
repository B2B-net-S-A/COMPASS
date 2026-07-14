'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, CalendarCheck, LayoutDashboard, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const ITEMS = [
    { href: '/internal/people/success', label: 'Pulpit', icon: LayoutDashboard, exact: true },
    { href: '/internal/people/success/consultants', label: 'Konsultanci', icon: Users },
    { href: '/internal/people/success/check-ins', label: 'Check-iny', icon: CalendarCheck },
    { href: '/internal/people/success/analytics', label: 'Analityka', icon: BarChart3 },
] as const

export function SuccessNav() {
    const pathname = usePathname()

    return (
        <nav aria-label="Consultant Success" className="-mx-1 overflow-x-auto border-b border-border px-1">
            <div className="flex min-w-max gap-1">
                {ITEMS.map((item) => {
                    const Icon = item.icon
                    const active = 'exact' in item && item.exact
                        ? pathname === item.href
                        : pathname === item.href || pathname.startsWith(`${item.href}/`)
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                                'relative -mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                                active
                                    ? 'border-primary text-primary'
                                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                            )}
                        >
                            <Icon className="h-4 w-4" aria-hidden />
                            {item.label}
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}
