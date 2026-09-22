import type { ReactNode } from 'react'
import Link from 'next/link'
import { BookOpen, CalendarDays, GraduationCap, Library, Map, Presentation, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AcademyTab = 'catalog' | 'my' | 'calendar' | 'paths' | 'teaching' | 'admin'

export interface AcademyShellProps {
    activeTab: AcademyTab
    access: { isAdmin: boolean; canTeach: boolean; rolloutMode?: 'closed' | 'pilot' | 'open'; isPilot?: boolean }
    title: string
    description?: string
    action?: ReactNode
    children: ReactNode
    showCalendar?: boolean
}

export function AcademyShell({ activeTab, access, title, description, action, children, showCalendar = true }: AcademyShellProps) {
    const tabs = [
        { id: 'catalog', label: 'Katalog szkoleń', href: '/learning', icon: Library, visible: true },
        { id: 'my', label: 'Moje szkolenia', href: '/learning/moje', icon: BookOpen, visible: true },
        { id: 'calendar', label: 'Kalendarz', href: '/learning/kalendarz', icon: CalendarDays, visible: showCalendar },
        { id: 'paths', label: 'Ścieżki nauki', href: '/learning/paths', icon: Map, visible: true },
        { id: 'teaching', label: 'Prowadzę', href: '/learning/tworze', icon: Presentation, visible: access.canTeach || access.isAdmin },
        { id: 'admin', label: 'Administracja', href: '/admin/learning', icon: ShieldCheck, visible: access.isAdmin },
    ]

    return (
        <div className="mx-auto w-full max-w-7xl space-y-7 p-4 pb-12 sm:p-6 lg:space-y-8 lg:p-8">
            <header className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="max-w-2xl space-y-3">
                    <div className="flex items-center gap-3">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl border border-primary/15 bg-primary/10 text-primary">
                            <GraduationCap className="size-6" aria-hidden="true" />
                        </span>
                        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
                    </div>
                    {description && <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>}
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </header>
            <nav aria-label="Akademia" className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1">
                {tabs.filter((tab) => tab.visible).map(({ id, label, href, icon: Icon }) => (
                    <Link
                        key={id}
                        href={href}
                        aria-current={activeTab === id ? 'page' : undefined}
                        className={cn(
                            'flex shrink-0 items-center gap-2 border-b-2 px-3 py-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4',
                            activeTab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                        )}
                    >
                        <Icon className="size-4" aria-hidden="true" />{label}
                    </Link>
                ))}
            </nav>
            {access.rolloutMode && access.rolloutMode !== 'open' && <p role="status" className="rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-foreground">{access.rolloutMode === 'closed' ? 'Akademia jest w przygotowaniu. Dostęp mają administratorzy; zapisy pozostałych osób są zamknięte.' : 'Akademia działa w pilocie dla wskazanych kont. Zgłaszaj problemy administratorowi.'}</p>}
            {children}
        </div>
    )
}
