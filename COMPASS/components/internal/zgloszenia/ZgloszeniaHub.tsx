'use client'

// "Zgłoszenia": administracja@ inbox (Kanban) + consultant helpdesk.
// Prywatne rozmowy z konsultantami zostały przeniesione do Consultant Success.

import Link from 'next/link'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { InboxWorkspace } from '@/components/inbox/InboxWorkspace'
import { TicketStatusBadge, TicketPriorityBadge } from '@/components/support/TicketStatusBadge'
import type { InboxTicketWithMeta, TicketStatus, SupportTicketWithMeta } from '@/lib/types/support'

interface Props {
    inboxColumns: Record<TicketStatus, InboxTicketWithMeta[]>
    /** Jawny błąd/odmowa źródła skrzynki — renderowany zamiast pustego kanbana (audyt P1.1/P1.7). */
    inboxError?: string | null
    helpdesk: SupportTicketWithMeta[]
    helpdeskError?: string | null
    /** Inbox categories + handlers for the "Dodaj sprawę" dialog (empty when caller isn't a handler). */
    categories: Array<{ id: string; slug: string; name_pl: string }>
    handlers: Array<{ id: string; full_name: string | null; email: string }>
    currentUserId: string
}

export function ZgloszeniaHub({ inboxColumns, inboxError = null, helpdesk, helpdeskError = null, categories, handlers, currentUserId }: Props) {
    const inboxCount = Object.values(inboxColumns).reduce((n, arr) => n + arr.length, 0)

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold">Sprawy</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Sprawy operacyjne i marketingowe oraz helpdesk konsultantów.
                </p>
            </header>

            <Tabs defaultValue="skrzynka">
                <TabsList className="flex flex-wrap">
                    <TabsTrigger value="skrzynka">Tablica spraw ({inboxCount})</TabsTrigger>
                    <TabsTrigger value="helpdesk">Helpdesk konsultantów ({helpdesk.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="skrzynka">
                    {inboxError ? (
                        <AccessNotice
                            source="Tablica spraw"
                            error={inboxError}
                            hint="Skrzynkę widzą obsługujący (inbox handler) i admin. Jeśli powinieneś mieć dostęp, poproś admina o oznaczenie Cię jako obsługującego."
                        />
                    ) : (
                        <InboxWorkspace
                            columns={inboxColumns}
                            categories={categories}
                            handlers={handlers}
                            currentUserId={currentUserId}
                        />
                    )}
                </TabsContent>

                <TabsContent value="helpdesk">
                    {helpdeskError ? (
                        <AccessNotice
                            source="Helpdesk konsultantów"
                            error={helpdeskError}
                            hint="Pełny widok helpdesku (scope: wszystkie tickety) jest dostępny dla admina."
                        />
                    ) : (
                        <HelpdeskTable tickets={helpdesk} />
                    )}
                </TabsContent>
            </Tabs>
        </div>
    )
}

/** Odmowa dostępu / awaria źródła — jawny stan, nie pusta lista (audyt P1.1/P1.7). */
function AccessNotice({ source, error, hint }: { source: string; error: string; hint: string }) {
    return (
        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-6 text-sm dark:bg-amber-950/20">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
                {source}: nie udało się załadować widoku
            </p>
            <p className="mt-1 text-amber-800 dark:text-amber-300">{error}</p>
            <p className="mt-2 text-amber-700 dark:text-amber-400">{hint}</p>
        </div>
    )
}

function HelpdeskTable({ tickets }: { tickets: SupportTicketWithMeta[] }) {
    if (tickets.length === 0) {
        return (
            <p className="rounded-md border p-8 text-center text-sm text-muted-foreground">
                Brak otwartych ticketów konsultantów.
            </p>
        )
    }
    return (
        <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
                <thead className="bg-muted/50">
                    <tr>
                        <th className="p-2 text-left">Temat</th>
                        <th className="p-2 text-left">Kategoria</th>
                        <th className="p-2 text-left">Status</th>
                        <th className="p-2 text-left">Priorytet</th>
                        <th className="p-2 text-left">Zgłaszający</th>
                    </tr>
                </thead>
                <tbody>
                    {tickets.map((t) => (
                        <tr key={t.id} className="border-t">
                            <td className="p-2">
                                <Link href="/admin/support" className="font-medium hover:text-primary hover:underline">{t.subject}</Link>
                            </td>
                            <td className="p-2 text-muted-foreground">{t.category_name_pl}</td>
                            <td className="p-2"><TicketStatusBadge status={t.status} /></td>
                            <td className="p-2"><TicketPriorityBadge priority={t.priority} /></td>
                            <td className="p-2">{t.user_name ?? '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
