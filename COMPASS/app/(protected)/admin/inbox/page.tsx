import { redirect } from 'next/navigation'
import { Inbox } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'
import { InboxWorkspace } from '@/components/inbox/InboxWorkspace'
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
        .select('role, is_inbox_handler, has_tcm_access')
        .eq('id', user.id)
        .single()

    // Rola talent_community implikuje dostęp (2026-08-25) — lustro is_inbox_handler().
    //
    // Audyt 2026-08 (UI): `has_tcm_access` brakowało TYLKO tutaj. Middleware
    // (middleware.ts:122) i szczegół zgłoszenia (./[id]/page.tsx) wpuszczały
    // posiadacza grantu, więc mógł otworzyć ticket, ale lista odsyłała go na
    // /home — łącznie z linkiem „wstecz" z tego ticketu. Na produkcji dotyczyło
    // to 4 kont z rolą `finanse` i grantem. Warunek musi być lustrem tamtych.
    const isAuthorized = profile?.role === 'admin' || profile?.role === 'talent_community'
        || profile?.is_inbox_handler === true || profile?.has_tcm_access === true
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
                        <h1 className="text-3xl font-bold tracking-tight">Sprawy</h1>
                    </div>
                    <p className="text-muted-foreground mt-1">
                        Wspólna tablica Administracji i Marketingu. Wybierz obszar, znajdź sprawę i zaplanuj kolejny krok.
                    </p>
                </div>
            </div>

            {!ticketsRes.success && (
                <Card className="bg-destructive/5 border-destructive/20">
                    <CardContent className="p-4 text-sm text-destructive">{ticketsRes.error}</CardContent>
                </Card>
            )}

            {ticketsRes.success && (
                <InboxWorkspace
                    columns={columns}
                    categories={categories}
                    handlers={handlers}
                    currentUserId={user.id}
                />
            )}
        </div>
    )
}
