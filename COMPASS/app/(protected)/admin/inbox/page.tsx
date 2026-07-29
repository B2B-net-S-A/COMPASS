import { redirect } from 'next/navigation'
import { Inbox } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { KanbanBoard } from '@/components/inbox/KanbanBoard'
import { NewInboxTicketDialog } from '@/components/inbox/NewInboxTicketDialog'
import {
    listInboxTickets,
    listInboxHandlers,
} from '@/lib/actions/support-inbox'
import { INBOX_CATEGORY_SLUGS } from '@/lib/types/support'

export const dynamic = 'force-dynamic'

export default async function AdminInboxPage() {
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

    const [ticketsRes, handlersRes, categoriesRes] = await Promise.all([
        listInboxTickets(),
        listInboxHandlers(),
        supabase
            .from('support_categories')
            .select('id, slug, name_pl')
            .in('slug', INBOX_CATEGORY_SLUGS as unknown as string[])
            .order('sort_order', { ascending: true }),
    ])

    const categories = (categoriesRes.data ?? []) as Array<{ id: string; slug: string; name_pl: string }>
    const handlers = handlersRes.success ? handlersRes.data : []
    const columns = ticketsRes.success
        ? ticketsRes.data
        : { open: [], in_progress: [], waiting_user: [], resolved: [], closed: [] }

    return (
        <div className="p-6 md:p-8 max-w-[1400px] mx-auto space-y-6">
            <div className="flex items-start justify-between flex-wrap gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <Inbox className="w-7 h-7 text-primary" />
                        <h1 className="text-3xl font-bold tracking-tight">Skrzynka administracja@</h1>
                    </div>
                    <p className="text-muted-foreground mt-1">
                        Tablica Kanban zgłoszeń wprowadzanych ręcznie. SLA: P1 = 2 dni, P2 = 5 dni, P3 = 10 dni roboczych.
                    </p>
                </div>
                {handlers.length > 0 && categories.length > 0 && (
                    <NewInboxTicketDialog
                        categories={categories}
                        handlers={handlers}
                        currentUserId={user.id}
                    />
                )}
            </div>

            {!ticketsRes.success && (
                <Card className="bg-destructive/5 border-destructive/20">
                    <CardContent className="p-4 text-sm text-destructive">{ticketsRes.error}</CardContent>
                </Card>
            )}

            <KanbanBoard initialColumns={columns} />
        </div>
    )
}
