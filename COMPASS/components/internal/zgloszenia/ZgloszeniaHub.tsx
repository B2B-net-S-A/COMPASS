'use client'

// Phase 37 — "Zgłoszenia": one module for the administracja@ inbox (Kanban), the consultant
// helpdesk, and contractor sprawy (conversations + roster, relocated from the old Retencja tab).

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { KanbanBoard } from '@/components/inbox/KanbanBoard'
import { RetencjaPanel } from '@/components/internal/kontraktorzy/panels/RetencjaPanel'
import { TicketStatusBadge, TicketPriorityBadge } from '@/components/support/TicketStatusBadge'
import type { InboxTicketWithMeta, TicketStatus, SupportTicketWithMeta } from '@/lib/types/support'
import type { ConversationListItem, ContractorListItem } from '@/lib/types/contractor'

interface Props {
    inboxColumns: Record<TicketStatus, InboxTicketWithMeta[]>
    helpdesk: SupportTicketWithMeta[]
    conversations: ConversationListItem[]
    contractors: ContractorListItem[]
    tcmProfiles: Array<{ id: string; fullName: string }>
    contractorsLite: Array<{ id: string; full_name: string }>
}

export function ZgloszeniaHub({ inboxColumns, helpdesk, conversations, contractors, tcmProfiles, contractorsLite }: Props) {
    const router = useRouter()
    const inboxCount = Object.values(inboxColumns).reduce((n, arr) => n + arr.length, 0)

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold">Zgłoszenia</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Skrzynka administracja@, helpdesk konsultantów i sprawy kontraktorskie — w jednym module.
                </p>
            </header>

            <Tabs defaultValue="skrzynka">
                <TabsList className="flex flex-wrap">
                    <TabsTrigger value="skrzynka">Skrzynka administracja@ ({inboxCount})</TabsTrigger>
                    <TabsTrigger value="helpdesk">Helpdesk konsultantów ({helpdesk.length})</TabsTrigger>
                    <TabsTrigger value="kontraktorzy">Sprawy kontraktorskie</TabsTrigger>
                </TabsList>

                <TabsContent value="skrzynka">
                    <KanbanBoard initialColumns={inboxColumns} />
                </TabsContent>

                <TabsContent value="helpdesk">
                    <HelpdeskTable tickets={helpdesk} />
                </TabsContent>

                <TabsContent value="kontraktorzy">
                    <RetencjaPanel
                        conversations={conversations}
                        contractors={contractors}
                        tcmProfiles={tcmProfiles}
                        contractorsLite={contractorsLite}
                        onSaved={() => router.refresh()}
                    />
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
