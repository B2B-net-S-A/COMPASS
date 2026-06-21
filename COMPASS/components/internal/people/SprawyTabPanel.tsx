import { listInboxTickets } from '@/lib/actions/support-inbox'
import { listTickets } from '@/lib/actions/support-tickets'
import { listConversations, listContractors, listTcmProfiles } from '@/lib/actions/contractors'
import { ZgloszeniaHub } from '@/components/internal/zgloszenia/ZgloszeniaHub'
import type { InboxTicketWithMeta, TicketStatus, SupportTicketWithMeta } from '@/lib/types/support'

// People Ops — zakładka Sprawy: kanban bieżących spraw (skrzynka administracja@ + helpdesk + sprawy
// kontraktorskie). Reuse istniejącego ZgloszeniaHub 1:1 (Phase 37) — jedna powierzchnia kanbanu.
const EMPTY_COLUMNS: Record<TicketStatus, InboxTicketWithMeta[]> = {
    open: [], in_progress: [], waiting_user: [], resolved: [], closed: [],
}

export async function SprawyTabPanel() {
    const [inboxRes, helpdeskRes, conversations, contractors, tcmProfiles] = await Promise.all([
        listInboxTickets(),
        listTickets({ scope: 'all', status: 'open', limit: 100 }),
        listConversations({ limit: 800 }),
        listContractors(),
        listTcmProfiles(),
    ])

    const inboxColumns = inboxRes.success ? inboxRes.data : EMPTY_COLUMNS
    const helpdesk: SupportTicketWithMeta[] = helpdeskRes.success ? helpdeskRes.data.items : []
    const contractorsLite = contractors.map((c) => ({ id: c.id, full_name: c.full_name }))

    return (
        <ZgloszeniaHub
            inboxColumns={inboxColumns}
            helpdesk={helpdesk}
            conversations={conversations}
            contractors={contractors}
            tcmProfiles={tcmProfiles}
            contractorsLite={contractorsLite}
        />
    )
}
