'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { TicketChat } from '@/components/support/TicketChat'
import { getInboxTicketDetail, addInboxComment, moveInboxTicket } from '@/lib/actions/support-inbox'
import { INBOX_STATUS_LABELS, STATUS_HELP } from '@/lib/inbox/workspace'
import { InboxCaseEditor, type InboxOptions } from './InboxCaseEditor'
import { CaseDeadline } from './CaseDeadline'
import type { InboxTicketWithMeta, SupportComment } from '@/lib/types/support'

type Detail = InboxTicketWithMeta & { comments: SupportComment[]; can_reply: boolean; can_change_status: boolean }
interface Props extends InboxOptions { ticketId: string; revision?: string; currentUserId: string; onClose: () => void }

export function InboxCasePanel({ ticketId, revision, categories, handlers, currentUserId, onClose }: Props) {
    const router = useRouter()
    const [ticket, setTicket] = useState<Detail | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [dirty, setDirty] = useState(false)
    const sequence = useRef(0)
    const reload = useCallback(async () => {
        const request = ++sequence.current
        try {
            const result = await getInboxTicketDetail(ticketId)
            if (request !== sequence.current) return
            if (result.success) { setTicket(result.data); setError(null) }
            else setError(result.error)
        } catch { if (request === sequence.current) setError('Nie udało się pobrać sprawy. Spróbuj ponownie.') }
    }, [ticketId])
    const cancelPending = useCallback(() => { sequence.current++ }, [])
    useEffect(() => { void reload(); return cancelPending }, [reload, revision, cancelPending])
    const afterSave = useCallback(() => { void reload(); router.refresh() }, [reload, router])
    useEffect(() => {
        if (!dirty) return
        const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
        window.addEventListener('beforeunload', beforeUnload)
        return () => window.removeEventListener('beforeunload', beforeUnload)
    }, [dirty])
    const canLeave = () => !dirty || window.confirm('Masz niezapisane zmiany. Odrzucić je i zamknąć sprawę?')
    return (
        <Sheet open onOpenChange={(open) => { if (!open && canLeave()) onClose() }}>
            <SheetContent className="w-full sm:max-w-2xl overflow-y-auto space-y-6">
                <SheetHeader>
                    <SheetTitle className="pr-8">{ticket?.subject ?? 'Szczegóły sprawy'}</SheetTitle>
                    <SheetDescription>Po zamknięciu wrócisz do tego samego miejsca na tablicy.</SheetDescription>
                </SheetHeader>
                {error && <div role="alert" className="text-sm text-destructive space-y-2"><p>{error}</p><Button variant="outline" onClick={() => void reload()}>Ponów pobieranie</Button></div>}
                {!ticket && !error && <p role="status">Ładowanie sprawy…</p>}
                {ticket && <>
                    <div className="space-y-2 text-sm">
                        <div className="flex flex-wrap gap-3 items-center"><strong>{INBOX_STATUS_LABELS[ticket.status]}</strong><CaseDeadline ticket={ticket} /></div>
                        <p className="text-xs text-muted-foreground">{STATUS_HELP[ticket.status]}</p>
                        <Link className="text-primary underline text-xs" href={`/admin/inbox/${ticket.id}`} onClick={(event) => { if (!canLeave()) event.preventDefault() }}>Otwórz pełną stronę sprawy</Link>
                    </div>
                    {(ticket.consultant_name || ticket.client_name || ticket.consultant_phone || ticket.meta.email_from) && <div className="rounded-md border p-3 text-xs space-y-1">
                        {ticket.consultant_name && <p>Konsultant: {ticket.consultant_name}</p>}
                        {ticket.client_name && <p>Klient: {ticket.client_name}</p>}
                        {ticket.consultant_phone && <p>Telefon: {ticket.consultant_phone}</p>}
                        {ticket.meta.email_from && <p>Email nadawcy: {ticket.meta.email_from}</p>}
                    </div>}
                    <InboxCaseEditor ticket={ticket} categories={categories} handlers={handlers} onSaved={afterSave} onDirtyChange={setDirty} />
                    <section className="space-y-3"><h3 className="font-semibold">Status i rozmowa</h3>
                        {dirty && <p className="text-xs text-muted-foreground">Zapisz edycję przed zmianą statusu.</p>}
                        <TicketChat ticketId={ticket.id} comments={ticket.comments} canReply={ticket.can_reply} canChangeStatus={ticket.can_change_status && !dirty} canMarkInternal currentUserId={currentUserId} currentStatus={ticket.status} onAddComment={addInboxComment} onChangeStatus={moveInboxTicket} onRefresh={reload} statusLabels={INBOX_STATUS_LABELS} />
                    </section>
                </>}
            </SheetContent>
        </Sheet>
    )
}
