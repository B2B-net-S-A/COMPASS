// Phase 37 — Zgłoszenia hub (TCM + admin): inbox + helpdesk + contractor sprawy in one module.

import { requireTalentCommunityOrAdminLayout } from '@/lib/auth/internal-guard'
import { listInboxTickets } from '@/lib/actions/support-inbox'
import { listTickets } from '@/lib/actions/support-tickets'
import { listConversations, listContractors, listTcmProfiles } from '@/lib/actions/contractors'
import { ZgloszeniaHub } from '@/components/internal/zgloszenia/ZgloszeniaHub'
import type { InboxTicketWithMeta, TicketStatus, SupportTicketWithMeta } from '@/lib/types/support'

export const dynamic = 'force-dynamic'

const EMPTY_COLUMNS: Record<TicketStatus, InboxTicketWithMeta[]> = {
    open: [], in_progress: [], waiting_user: [], resolved: [], closed: [],
}

export default async function ZgloszeniaPage() {
    await requireTalentCommunityOrAdminLayout()

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
