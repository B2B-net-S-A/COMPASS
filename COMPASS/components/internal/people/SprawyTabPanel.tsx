import { createClient } from '@/lib/supabase/server'
import { listInboxTickets, listInboxHandlers } from '@/lib/actions/support-inbox'
import { listTickets } from '@/lib/actions/support-tickets'
import { listConversations, listContractors, listTcmProfiles } from '@/lib/actions/contractors'
import { ZgloszeniaHub } from '@/components/internal/zgloszenia/ZgloszeniaHub'
import { INBOX_CATEGORY_SLUGS } from '@/lib/types/support'
import type { InboxTicketWithMeta, TicketStatus, SupportTicketWithMeta } from '@/lib/types/support'

// People Ops — zakładka Sprawy: kanban bieżących spraw (skrzynka administracja@ + helpdesk + sprawy
// kontraktorskie). Reuse istniejącego ZgloszeniaHub 1:1 (Phase 37) — jedna powierzchnia kanbanu.
const EMPTY_COLUMNS: Record<TicketStatus, InboxTicketWithMeta[]> = {
    open: [], in_progress: [], waiting_user: [], resolved: [], closed: [],
}

export async function SprawyTabPanel() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const [inboxRes, helpdeskRes, conversations, contractors, tcmProfiles, handlersRes, categoriesRes] = await Promise.all([
        listInboxTickets(),
        listTickets({ scope: 'all', status: 'open', limit: 100 }),
        listConversations({ limit: 800 }),
        listContractors(),
        listTcmProfiles(),
        listInboxHandlers(),
        supabase
            .from('support_categories')
            .select('id, slug, name_pl')
            .in('slug', INBOX_CATEGORY_SLUGS as unknown as string[])
            .order('sort_order', { ascending: true }),
    ])

    const inboxColumns = inboxRes.success ? inboxRes.data : EMPTY_COLUMNS
    const helpdesk: SupportTicketWithMeta[] = helpdeskRes.success ? helpdeskRes.data.items : []
    const contractorsLite = contractors.map((c) => ({ id: c.id, full_name: c.full_name }))
    const handlers = handlersRes.success ? handlersRes.data : []
    const categories = (categoriesRes.data ?? []) as Array<{ id: string; slug: string; name_pl: string }>

    return (
        <ZgloszeniaHub
            inboxColumns={inboxColumns}
            helpdesk={helpdesk}
            conversations={conversations}
            contractors={contractors}
            tcmProfiles={tcmProfiles}
            contractorsLite={contractorsLite}
            categories={categories}
            handlers={handlers}
            currentUserId={user?.id ?? ''}
        />
    )
}
