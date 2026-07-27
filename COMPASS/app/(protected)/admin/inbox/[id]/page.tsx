import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Inbox, Mail, Paperclip, Phone, Building2, User as UserIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/server'
import { TicketStatusBadge } from '@/components/support/TicketStatusBadge'
import { TicketChat } from '@/components/support/TicketChat'
import { InboxPriorityBadge } from '@/components/inbox/InboxPriorityBadge'
import { SlaCountdownBadge } from '@/components/inbox/SlaCountdownBadge'
import { getInboxTicketDetail } from '@/lib/actions/support-inbox'
import { sanitizeHtml } from '@/lib/html/sanitize'
import { TicketToTaskButton } from '@/components/inbox/TicketToTaskButton'

function formatBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

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

    // Phase 34 — TCM/admin can spawn a tracked Talent Community task from this ticket.
    const canCreateTask = profile?.role === 'admin' || profile?.role === 'talent_community'
    let taskTcmProfiles: Array<{ id: string; fullName: string }> = []
    let taskContractors: Array<{ id: string; full_name: string }> = []
    if (canCreateTask) {
        const [{ data: tcm }, { data: cs }] = await Promise.all([
            supabase.from('profiles').select('id, full_name').in('role', ['talent_community', 'admin']).neq('employment_status', 'exited').order('full_name'),
            supabase.from('contractors').select('id, full_name').order('full_name'),
        ])
        taskTcmProfiles = ((tcm ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => ({ id: p.id, fullName: p.full_name ?? '—' }))
        taskContractors = ((cs ?? []) as Array<{ id: string; full_name: string }>).map((c) => ({ id: c.id, full_name: c.full_name }))
    }

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
                        {canCreateTask && (
                            <div className="mt-3">
                                <TicketToTaskButton
                                    ticketId={ticket.id}
                                    ticketSubject={ticket.subject}
                                    tcmProfiles={taskTcmProfiles}
                                    contractors={taskContractors}
                                />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <Card className="bg-card border-border">
                <CardContent className="p-5 space-y-3">
                    {ticket.meta.email_from && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground border-b border-border pb-2 flex-wrap">
                            <Mail className="w-3.5 h-3.5" />
                            <span>Od: {ticket.meta.email_from}</span>
                            {ticket.meta.email_received_at && (
                                <span>· Odebrane: {new Date(ticket.meta.email_received_at).toLocaleString('pl-PL')}</span>
                            )}
                            {ticket.meta.source === 'email' && (
                                <Badge variant="outline" className="text-[10px]">auto-import</Badge>
                            )}
                        </div>
                    )}
                    {(ticket.consultant_name || ticket.consultant_phone || ticket.client_name) && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            {ticket.consultant_name && (
                                <span className="flex items-center gap-2">
                                    <UserIcon className="w-3.5 h-3.5" />
                                    Konsultant: {ticket.consultant_name}
                                </span>
                            )}
                            {ticket.consultant_phone && (
                                <a href={`tel:${ticket.consultant_phone}`} className="flex items-center gap-2 hover:text-foreground">
                                    <Phone className="w-3.5 h-3.5" />
                                    {ticket.consultant_phone}
                                </a>
                            )}
                            {ticket.client_name && (
                                <span className="flex items-center gap-2">
                                    <Building2 className="w-3.5 h-3.5" />
                                    Klient: {ticket.client_name}
                                </span>
                            )}
                        </div>
                    )}
                    {ticket.meta.source === 'email' && ticket.meta.email_body_html ? (
                        <div
                            className="prose prose-sm prose-invert max-w-none text-sm"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(ticket.meta.email_body_html) }}
                        />
                    ) : ticket.meta.source === 'email' && ticket.meta.email_body_text ? (
                        <p className="whitespace-pre-wrap text-sm">{ticket.meta.email_body_text}</p>
                    ) : (
                        <p className="whitespace-pre-wrap text-sm">{ticket.body_md}</p>
                    )}
                </CardContent>
            </Card>

            {ticket.attachments.length > 0 && (
                <Card className="bg-card border-border">
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 text-sm font-medium mb-3">
                            <Paperclip className="w-4 h-4" />
                            Załączniki ({ticket.attachments.length})
                        </div>
                        <ul className="space-y-1.5">
                            {ticket.attachments.map((a) => (
                                <li key={a.storagePath} className="flex items-center gap-2 text-xs">
                                    <a
                                        href={a.signedUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline truncate flex-1"
                                    >
                                        {a.name}
                                    </a>
                                    <span className="text-muted-foreground">{formatBytes(a.size)}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="text-[10px] text-muted-foreground mt-2">
                            Linki tracą ważność po 60 sekundach — odśwież stronę aby ponownie wygenerować.
                        </p>
                    </CardContent>
                </Card>
            )}

            <Card className="bg-card border-border">
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
