import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Inbox, Mail, User as UserIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import { TicketStatusBadge } from '@/components/support/TicketStatusBadge'
import { TicketChat } from '@/components/support/TicketChat'
import { InboxPriorityBadge } from '@/components/inbox/InboxPriorityBadge'
import { SlaCountdownBadge } from '@/components/inbox/SlaCountdownBadge'
import { getInboxTicketDetail } from '@/lib/actions/support-inbox'

export const dynamic = 'force-dynamic'

interface PageProps {
    params: { id: string }
}

export default async function InboxTicketDetailPage({ params }: PageProps) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    const { data: profile } = await supabase
        .from('profiles')
        .select('role, is_inbox_handler')
        .eq('id', user.id)
        .single()

    const isAuthorized = profile?.role === 'admin' || profile?.is_inbox_handler === true
    if (!isAuthorized) redirect('/home')

    const result = await getInboxTicketDetail(params.id)
    if (!result.success) notFound()
    const ticket = result.data

    return (
        <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
            <div>
                <Link
                    href="/admin/inbox"
                    className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1 mb-2"
                >
                    ← Tablica zgłoszeń
                </Link>
                <div className="flex items-start gap-3">
                    <Inbox className="w-7 h-7 text-primary mt-1" />
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <TicketStatusBadge status={ticket.status} />
                            <InboxPriorityBadge priority={ticket.meta.priority_level} />
                            <SlaCountdownBadge dueDate={ticket.meta.due_date} />
                            <Badge variant="outline" className="text-[10px]">
                                {ticket.category_name_pl}
                            </Badge>
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight">{ticket.subject}</h1>
                        <p className="text-xs text-muted-foreground mt-1">
                            Zgłoszone: {new Date(ticket.created_at).toLocaleString('pl-PL')}
                            {' · '}Termin SLA: {new Date(ticket.meta.due_date).toLocaleString('pl-PL')}
                            {ticket.assignee_name && ` · Odpowiedzialna: ${ticket.assignee_name}`}
                        </p>
                    </div>
                </div>
            </div>

            <Card className="bg-white/5 border-white/10">
                <CardContent className="p-5 space-y-3">
                    {ticket.meta.email_from && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground border-b border-white/5 pb-2">
                            <Mail className="w-3.5 h-3.5" />
                            <span>Od: {ticket.meta.email_from}</span>
                            {ticket.meta.email_received_at && (
                                <span>· Odebrane: {new Date(ticket.meta.email_received_at).toLocaleString('pl-PL')}</span>
                            )}
                        </div>
                    )}
                    {ticket.consultant_name && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <UserIcon className="w-3.5 h-3.5" />
                            <span>Konsultant: {ticket.consultant_name}</span>
                        </div>
                    )}
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
                        canMarkInternal={true}
                        currentUserId={user.id}
                        currentStatus={ticket.status}
                    />
                </CardContent>
            </Card>
        </div>
    )
}
