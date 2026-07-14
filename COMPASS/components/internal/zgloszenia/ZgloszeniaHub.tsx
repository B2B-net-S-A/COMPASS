'use client'

// "Zgłoszenia": administracja@ inbox (Kanban) + consultant helpdesk.
// Prywatne rozmowy z konsultantami zostały przeniesione do Consultant Success.

import Link from 'next/link'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { KanbanBoard } from '@/components/inbox/KanbanBoard'
import { NewInboxTicketDialog } from '@/components/inbox/NewInboxTicketDialog'
import { TicketStatusBadge, TicketPriorityBadge } from '@/components/support/TicketStatusBadge'
import type { InboxTicketWithMeta, TicketStatus, SupportTicketWithMeta } from '@/lib/types/support'

interface Props {
    inboxColumns: Record<TicketStatus, InboxTicketWithMeta[]>
    helpdesk: SupportTicketWithMeta[]
    /** Inbox categories + handlers for the "Dodaj sprawę" dialog (empty when caller isn't a handler). */
    categories: Array<{ id: string; slug: string; name_pl: string }>
    handlers: Array<{ id: string; full_name: string | null; email: string }>
    currentUserId: string
}

export function ZgloszeniaHub({ inboxColumns, helpdesk, categories, handlers, currentUserId }: Props) {
    const inboxCount = Object.values(inboxColumns).reduce((n, arr) => n + arr.length, 0)
    const canAddCase = handlers.length > 0 && categories.length > 0 && currentUserId !== ''

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold">Zgłoszenia</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Skrzynka administracja@ i helpdesk konsultantów — sprawy wymagające obsługi operacyjnej.
                </p>
            </header>

            <Tabs defaultValue="skrzynka">
                <TabsList className="flex flex-wrap">
                    <TabsTrigger value="skrzynka">Skrzynka administracja@ ({inboxCount})</TabsTrigger>
                    <TabsTrigger value="helpdesk">Helpdesk konsultantów ({helpdesk.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="skrzynka">
                    {canAddCase && (
                        <div className="mb-4 flex justify-end">
                            <NewInboxTicketDialog
                                categories={categories}
                                handlers={handlers}
                                currentUserId={currentUserId}
                                triggerLabel="Dodaj sprawę"
                            />
                        </div>
                    )}
                    <KanbanBoard initialColumns={inboxColumns} />
                </TabsContent>

                <TabsContent value="helpdesk">
                    <HelpdeskTable tickets={helpdesk} />
                </TabsContent>
            </Tabs>
        </div>
    )
}

function HelpdeskTable({ tickets }: { tickets: SupportTicketWithMeta[] }) {
    if (tickets.length === 0) {
        return (
            <p className="rounded-md border p-8 text-center text-sm text-muted-foreground">
                Brak otwartych ticketów konsultantów (lub widok dostępny tylko dla admina).
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
