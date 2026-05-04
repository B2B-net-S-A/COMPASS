import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LifeBuoy } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import { TicketStatusBadge, TicketPriorityBadge } from '@/components/support/TicketStatusBadge'
import { TicketChat } from '@/components/support/TicketChat'
import { getTicketDetail } from '@/lib/actions/support-tickets'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { id: string }
}

export default async function TicketDetailPage({ params }: PageProps) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) notFound()

    const result = await getTicketDetail(params.id)
    if (!result.success) notFound()
    const ticket = result.data

    const isAssignee = ticket.assignee_id === user.id
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const isAdmin = profile?.role === 'admin'

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link href="/support/tickets" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2">
                    ← Moje tickety
                </Link>
                <div className="flex items-start gap-3">
                    <LifeBuoy className="w-7 h-7 text-primary mt-1" />
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <TicketStatusBadge status={ticket.status} />
                            <TicketPriorityBadge priority={ticket.priority} />
                            <Badge variant="outline" className="text-[10px]">{ticket.category_name_pl}</Badge>
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight">{ticket.subject}</h1>
                        <p className="text-xs text-muted-foreground mt-1">
                            Zgłoszony: {new Date(ticket.created_at).toLocaleString('pl-PL')}
                            {' · '}Autor: {ticket.user_name ?? 'Anonim'}
                            {ticket.assignee_name && ` · Opiekun: ${ticket.assignee_name}`}
                        </p>
                    </div>
                </div>
            </div>

            <Card className="bg-white/5 border-white/10">
                <CardContent className="p-5">
                    <p className="whitespace-pre-wrap text-sm">{ticket.body_md}</p>
                </CardContent>
            </Card>

            <Card className="bg-white/5 border-white/10">
                <CardContent className="p-5">
                    <TicketChat
                        ticketId={ticket.id}
                        comments={ticket.comments}
                        canReply={ticket.can_reply}
                        canChangeStatus={ticket.can_change_status}
                        canMarkInternal={isAdmin || isAssignee}
                        currentUserId={user.id}
                        currentStatus={ticket.status}
                    />
                </CardContent>
            </Card>
        </div>
    )
}
