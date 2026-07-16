import { createClient } from '@/lib/supabase/server'
import { listInboxTickets, listInboxHandlers } from '@/lib/actions/support-inbox'
import { listTickets } from '@/lib/actions/support-tickets'
import { ZgloszeniaHub } from '@/components/internal/zgloszenia/ZgloszeniaHub'
import { INBOX_CATEGORY_SLUGS } from '@/lib/types/support'
import type { InboxTicketWithMeta, TicketStatus, SupportTicketWithMeta } from '@/lib/types/support'

// People Ops — zakładka Sprawy: kanban skrzynki administracja@ + helpdesk.
// Historia kontaktów z konsultantami żyje wyłącznie w prywatnym Consultant Success.
const EMPTY_COLUMNS: Record<TicketStatus, InboxTicketWithMeta[]> = {
    open: [], in_progress: [], waiting_user: [], resolved: [], closed: [],
}

export async function SprawyTabPanel() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const [inboxRes, helpdeskRes, handlersRes, categoriesRes] = await Promise.all([
        listInboxTickets(),
        listTickets({ scope: 'all', status: 'open', limit: 100 }),
        listInboxHandlers(),
        supabase
            .from('support_categories')
            .select('id, slug, name_pl')
            .in('slug', INBOX_CATEGORY_SLUGS as unknown as string[])
            .order('sort_order', { ascending: true }),
    ])

    // Audyt P1.1/P1.7: odmowa dostępu / awaria zapytania ≠ pusta lista.
    // Błąd przekazujemy do huba jako jawny stan zamiast renderować pusty kanban.
    const inboxColumns = inboxRes.success ? inboxRes.data : EMPTY_COLUMNS
    const inboxError = inboxRes.success ? null : inboxRes.error ?? 'Nieznany błąd skrzynki'
    const helpdesk: SupportTicketWithMeta[] = helpdeskRes.success ? helpdeskRes.data.items : []
    const helpdeskError = helpdeskRes.success ? null : helpdeskRes.error ?? 'Nieznany błąd helpdesku'
    const handlers = handlersRes.success ? handlersRes.data : []
    const categories = (categoriesRes.data ?? []) as Array<{ id: string; slug: string; name_pl: string }>

    return (
        <ZgloszeniaHub
            inboxColumns={inboxColumns}
            inboxError={inboxError}
            helpdesk={helpdesk}
            helpdeskError={helpdeskError}
            categories={categories}
            handlers={handlers}
            currentUserId={user?.id ?? ''}
        />
    )
}
