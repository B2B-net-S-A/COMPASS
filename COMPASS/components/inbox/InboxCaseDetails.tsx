'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { InboxCaseEditor, type InboxOptions } from './InboxCaseEditor'
import { TicketChat } from '@/components/support/TicketChat'
import { addInboxComment, moveInboxTicket } from '@/lib/actions/support-inbox'
import { INBOX_STATUS_LABELS } from '@/lib/inbox/workspace'
import type { InboxTicketWithMeta, SupportComment } from '@/lib/types/support'

export function InboxCaseDetails({ ticket, categories, handlers, currentUserId }: InboxOptions & { ticket: InboxTicketWithMeta & { comments: SupportComment[]; can_reply: boolean; can_change_status: boolean }; currentUserId: string }) {
    const router = useRouter()
    const [dirty, setDirty] = useState(false)
    return <div className="space-y-6">
        <details className="border rounded-lg p-4 space-y-4"><summary className="font-semibold cursor-pointer">Edytuj sprawę, checklistę i materiały</summary><InboxCaseEditor ticket={ticket} categories={categories} handlers={handlers} onSaved={() => router.refresh()} onDirtyChange={setDirty} /></details>
        {dirty && <p className="text-xs text-muted-foreground">Zapisz edycję przed zmianą statusu.</p>}
        <TicketChat ticketId={ticket.id} comments={ticket.comments} canReply={ticket.can_reply} canChangeStatus={ticket.can_change_status && !dirty} canMarkInternal currentUserId={currentUserId} currentStatus={ticket.status} onAddComment={addInboxComment} onChangeStatus={moveInboxTicket} statusLabels={INBOX_STATUS_LABELS} />
    </div>
}
