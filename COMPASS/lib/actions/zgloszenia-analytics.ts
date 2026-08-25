'use server'

// Phase 37 — ticket-type analytics for the unified "Analityka" hub. Reads support_tickets,
// which holds inbox + helpdesk → "jakie typy zgłoszeń spływają".
//
// Świadomie BEZ wykluczania rodzin kategorii: to jedyne miejsce, które ma pokazywać
// przekrój wszystkich zgłoszeń. Lustro spraw kontraktorskich (`contractor_%`) zniknęło
// z tej tabeli krokiem audytu C2 — rozmowy i zadania TCM czyta się z ich własnych tabel.

import { createClient } from '@/lib/supabase/server'
import { requireTalentCommunityOrAdminAction } from '@/lib/auth/internal-guard'
import { TICKET_STATUS_LABEL, TICKET_PRIORITY_LABEL, type TicketStatus, type TicketPriority } from '@/lib/types/support'

export interface TicketTypeStat {
    label: string
    count: number
}

export interface TicketAnalytics {
    byCategory: TicketTypeStat[]
    byStatus: TicketTypeStat[]
    byPriority: TicketTypeStat[]
    total: number
    open: number
}

export async function getTicketTypeAnalytics(): Promise<TicketAnalytics> {
    await requireTalentCommunityOrAdminAction()
    const supabase = createClient()

    const [{ data: tickets }, { data: cats }] = await Promise.all([
        supabase.from('support_tickets').select('category_id, status, priority'),
        supabase.from('support_categories').select('id, name_pl'),
    ])

    const catName = new Map<string, string>((cats ?? []).map((c: { id: string; name_pl: string }) => [c.id, c.name_pl]))
    const byCat = new Map<string, number>()
    const byStatus = new Map<string, number>()
    const byPrio = new Map<string, number>()
    let open = 0

    for (const t of (tickets ?? []) as Array<{ category_id: string; status: string; priority: string }>) {
        const cn = catName.get(t.category_id) ?? 'Inne'
        byCat.set(cn, (byCat.get(cn) ?? 0) + 1)
        const sLabel = TICKET_STATUS_LABEL[t.status as TicketStatus] ?? t.status
        byStatus.set(sLabel, (byStatus.get(sLabel) ?? 0) + 1)
        const pLabel = TICKET_PRIORITY_LABEL[t.priority as TicketPriority] ?? t.priority
        byPrio.set(pLabel, (byPrio.get(pLabel) ?? 0) + 1)
        if (t.status !== 'resolved' && t.status !== 'closed') open += 1
    }

    const toStats = (m: Map<string, number>): TicketTypeStat[] =>
        Array.from(m.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)

    return {
        byCategory: toStats(byCat),
        byStatus: toStats(byStatus),
        byPriority: toStats(byPrio),
        total: (tickets ?? []).length,
        open,
    }
}
