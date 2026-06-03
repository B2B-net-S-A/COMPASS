import { redirect } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Inbox } from 'lucide-react'
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

    const [ticketsRes, handlersRes, categoriesRes, syncRes] = await Promise.all([
        listInboxTickets(),
        listInboxHandlers(),
        supabase
            .from('support_categories')
            .select('id, slug, name_pl')
            .in('slug', INBOX_CATEGORY_SLUGS as unknown as string[])
            .order('sort_order', { ascending: true }),
        // Phase 26b — sync state for the primary admin mailbox.
        supabase
            .from('inbox_sync_state')
            .select('mailbox, last_synced_at, last_run_at, last_error, last_scanned, last_created, last_appended, last_skipped')
            .eq('mailbox', 'administracja@b2bnetwork.pl')
            .maybeSingle(),
    ])

    const sync = syncRes.data as null | {
        mailbox: string
        last_synced_at: string
        last_run_at: string | null
        last_error: string | null
        last_scanned: number
        last_created: number
        last_appended: number
        last_skipped: number
    }

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
                        Tablica Kanban dla zgłoszeń z maila administracyjnego. SLA: P1 = 2 dni, P2 = 5 dni, P3 = 10 dni roboczych.
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
                <Card className="bg-red-500/5 border-red-500/20">
                    <CardContent className="p-4 text-sm text-red-400">{ticketsRes.error}</CardContent>
                </Card>
            )}

            {sync && (
                <Card
                    className={
                        sync.last_error
                            ? 'bg-amber-500/5 border-amber-500/30'
                            : 'bg-emerald-500/5 border-emerald-500/20'
                    }
                >
                    <CardContent className="p-3 text-xs flex items-start gap-2 flex-wrap">
                        {sync.last_error ? (
                            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 space-y-0.5">
                            <div className="font-medium">
                                Auto-import z <code className="text-[11px]">{sync.mailbox}</code>
                                {' · '}ostatni sync:{' '}
                                {sync.last_run_at
                                    ? new Date(sync.last_run_at).toLocaleString('pl-PL')
                                    : 'jeszcze nie uruchomiony'}
                            </div>
                            <div className="text-muted-foreground">
                                Cursor: {new Date(sync.last_synced_at).toLocaleString('pl-PL')}
                                {' · '}skanowane: {sync.last_scanned}
                                {' · '}nowe: {sync.last_created}
                                {' · '}dopięte: {sync.last_appended}
                                {' · '}pominięte: {sync.last_skipped}
                            </div>
                            {sync.last_error && (
                                <div className="text-amber-300">Błąd: {sync.last_error}</div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            <KanbanBoard initialColumns={columns} />
        </div>
    )
}
