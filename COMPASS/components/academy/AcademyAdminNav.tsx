import Link from 'next/link'
import { BarChart3, CalendarCheck2, Settings2, ShieldCheck, UsersRound } from 'lucide-react'
import { cn } from '@/lib/utils'

export function AcademyAdminNav({ active }: { active: 'review' | 'trainers' | 'integrations' | 'sessions' | 'reports' | 'certificates' }) {
    const links = [
        { id: 'certificates', href: '/admin/learning/certificates', label: 'Certyfikaty', icon: ShieldCheck },
        { id: 'reports', href: '/admin/learning/analytics', label: 'Raport', icon: BarChart3 },
        { id: 'review', href: '/admin/learning', label: 'Akceptacja szkoleń', icon: ShieldCheck },
        { id: 'trainers', href: '/admin/learning/trainers', label: 'Uprawnienia trenerów', icon: UsersRound },
        { id: 'integrations', href: '/admin/learning/integrations', label: 'Teams i synchronizacja', icon: Settings2 },
        { id: 'sessions', href: '/learning/kalendarz', label: 'Terminy i edycje', icon: CalendarCheck2 },
    ]
    return <nav aria-label="Administracja Akademii" className="flex flex-wrap gap-2">{links.map(({ id, href, label, icon: Icon }) => <Link key={id} href={href} aria-current={active === id ? 'page' : undefined} className={cn('inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', active === id ? 'border-primary/30 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground')}><Icon aria-hidden="true" className="size-4" />{label}</Link>)}</nav>
}
