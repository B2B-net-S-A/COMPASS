import Link from 'next/link'
import { Inbox, BookOpen, Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { TicketStatusBadge, TicketPriorityBadge } from '@/components/support/TicketStatusBadge'
import { listTickets } from '@/lib/actions/support-tickets'
import type { TicketStatus } from '@/lib/types/support'

export const dynamic = 'force-dynamic'

interface PageProps {
    searchParams: { status?: string }
}

export default async function AdminSupportPage({ searchParams }: PageProps) {
    const validStatuses: TicketStatus[] = ['open', 'in_progress', 'waiting_user', 'resolved', 'closed']
    const status = validStatuses.includes(searchParams.status as TicketStatus) ? (searchParams.status as TicketStatus) : 'open'

    const result = await listTickets({ scope: 'all', status, limit: 50 })

    return (
        <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <Link href="/support" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                        ← Support Center
                    </Link>
                    <div className="flex items-center gap-3">
                        <Inbox className="w-7 h-7 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">Kolejka ticketów</h1>
                    </div>
                    <p className="text-muted-foreground mt-1">Wszystkie zgłoszenia konsultantów (admin view).</p>
                </div>
                <Link href="/admin/support/kb">
                    <Button variant="outline" className="gap-2">
                        <BookOpen className="w-4 h-4" /> Edytor bazy wiedzy
                    </Button>
                </Link>
            </div>

            <div className="flex flex-wrap gap-2 pb-2 border-b border-white/5">
                {[
                    { value: 'open' as const, label: 'Otwarte' },
                    { value: 'in_progress' as const, label: 'W trakcie' },
                    { value: 'waiting_user' as const, label: 'Oczekujące' },
                    { value: 'resolved' as const, label: 'Rozwiązane' },
                    { value: 'closed' as const, label: 'Zamknięte' },
                ].map((opt) => (
                    <Link key={opt.label} href={`/admin/support?status=${opt.value}`}>
                        <Badge
                            className={`cursor-pointer text-xs h-7 px-3 transition-colors ${
                                status === opt.value ? 'bg-primary text-primary-foreground' : 'bg-white/5 text-muted-foreground border border-white/10 hover:border-primary/40'
                            }`}
                        >
                            {opt.label}
                        </Badge>
                    </Link>
                ))}
            </div>

            {!result.success && (
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-4 text-sm text-red-400">{result.error}</CardContent>
                </Card>
            )}

            {result.success && result.data.items.length === 0 && (
                <Card className="bg-white/5 border-white/10">
                    <CardContent className="p-12 text-center text-muted-foreground">
                        Brak ticketów w stanie {status}.
                    </CardContent>
                </Card>
            )}

            {result.success && result.data.items.length > 0 && (
                <div className="space-y-2">
                    {result.data.items.map((t) => (
                        <Link key={t.id} href={`/support/tickets/${t.id}`} className="block group">
                            <Card className="bg-white/5 border-white/10 hover:border-primary/40 transition-colors">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                <TicketStatusBadge status={t.status} />
                                                <TicketPriorityBadge priority={t.priority} />
                                                <Badge variant="outline" className="text-[10px]">{t.category_name_pl}</Badge>
                                            </div>
                                            <h3 className="font-semibold group-hover:text-primary truncate">{t.subject}</h3>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                Od: <strong>{t.user_name ?? '?'}</strong>
                                                {' · '}
                                                {new Date(t.updated_at).toLocaleString('pl-PL')}
                                                {' · '}
                                                {t.comment_count} {t.comment_count === 1 ? 'komentarz' : 'komentarzy'}
                                                {t.assignee_name ? ` · Opiekun: ${t.assignee_name}` : ' · Bez opiekuna'}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
