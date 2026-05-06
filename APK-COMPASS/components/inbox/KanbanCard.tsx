import Link from 'next/link'
import { Mail, User } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { InboxPriorityBadge } from './InboxPriorityBadge'
import { SlaCountdownBadge } from './SlaCountdownBadge'
import type { InboxTicketWithMeta } from '@/lib/types/support'

interface KanbanCardProps {
    ticket: InboxTicketWithMeta
    isDragging?: boolean
}

export function KanbanCard({ ticket, isDragging }: KanbanCardProps) {
    return (
        <Link href={`/admin/inbox/${ticket.id}`} className="block">
            <Card
                className={`bg-white/5 border-white/10 hover:border-primary/40 transition-colors p-3 space-y-2 ${
                    isDragging ? 'border-primary/60 shadow-lg shadow-primary/10' : ''
                }`}
            >
                <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-medium leading-tight line-clamp-2 flex-1">{ticket.subject}</h4>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                    <InboxPriorityBadge priority={ticket.meta.priority_level} />
                    <SlaCountdownBadge dueDate={ticket.meta.due_date} />
                </div>

                <div className="text-[11px] text-muted-foreground space-y-1">
                    <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground/70">Kategoria:</span>
                        <span>{ticket.category_name_pl}</span>
                    </div>
                    {ticket.consultant_name && (
                        <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3" />
                            <span>{ticket.consultant_name}</span>
                        </div>
                    )}
                    {ticket.meta.email_from && (
                        <div className="flex items-center gap-1.5 truncate">
                            <Mail className="w-3 h-3 shrink-0" />
                            <span className="truncate">{ticket.meta.email_from}</span>
                        </div>
                    )}
                    {ticket.assignee_name && (
                        <div className="text-[10px] text-muted-foreground/70">
                            Odpowiedzialna: {ticket.assignee_name}
                        </div>
                    )}
                </div>
            </Card>
        </Link>
    )
}
