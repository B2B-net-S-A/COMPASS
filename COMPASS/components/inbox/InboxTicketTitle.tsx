'use client'

// Phase 49 — tytuł zgłoszenia edytowalny w miejscu (People Ops → Sprawy).
// Nagłówek zostaje nagłówkiem: ołówek zamienia go w pole, Enter zapisuje,
// Escape wycofuje. Tytuł trzymamy w stanie lokalnym, żeby zmiana była widoczna
// od razu, a router.refresh() dociąga resztę widoku (kanban, lista).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { renameInboxTicket } from '@/lib/actions/support-inbox'
import { TICKET_SUBJECT_MAX, TICKET_SUBJECT_MIN } from '@/lib/types/support'

interface Props {
    ticketId: string
    subject: string
}

export function InboxTicketTitle({ ticketId, subject }: Props) {
    const router = useRouter()
    const [title, setTitle] = useState(subject)
    const [draft, setDraft] = useState(subject)
    const [editing, setEditing] = useState(false)
    const [pending, startTransition] = useTransition()

    function startEditing() {
        setDraft(title)
        setEditing(true)
    }

    function save() {
        const next = draft.trim().replace(/\s+/g, ' ')
        if (next === title) {
            setEditing(false)
            return
        }
        if (next.length < TICKET_SUBJECT_MIN) {
            toast.error(`Tytuł musi mieć co najmniej ${TICKET_SUBJECT_MIN} znaki.`)
            return
        }
        startTransition(async () => {
            try {
                // Guard na `res?.success`: przy deploy skew stara karta potrafi dostać
                // undefined zamiast wyniku akcji (patrz wzorzec z innych paneli).
                const res = await renameInboxTicket(ticketId, next)
                if (!res?.success) {
                    toast.error(res?.error ?? 'Nie udało się zmienić tytułu.')
                    return
                }
                setTitle(res.data.subject)
                setEditing(false)
                toast.success('Zmieniono tytuł zgłoszenia.')
                router.refresh()
            } catch (err) {
                toast.error(err instanceof Error ? err.message : 'Nie udało się zmienić tytułu.')
            }
        })
    }

    if (!editing) {
        return (
            <div className="flex items-start gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1 h-7 w-7 shrink-0 p-0"
                    onClick={startEditing}
                    aria-label="Zmień tytuł zgłoszenia"
                    title="Zmień tytuł zgłoszenia"
                >
                    <Pencil className="h-3.5 w-3.5" />
                </Button>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-2">
            <Input
                autoFocus
                value={draft}
                maxLength={TICKET_SUBJECT_MAX}
                disabled={pending}
                aria-label="Tytuł zgłoszenia"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault()
                        save()
                    }
                    if (e.key === 'Escape') {
                        e.preventDefault()
                        setEditing(false)
                    }
                }}
            />
            <Button size="sm" onClick={save} disabled={pending} aria-label="Zapisz tytuł">
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </Button>
            <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={pending}
                aria-label="Anuluj zmianę tytułu"
            >
                <X className="h-4 w-4" />
            </Button>
        </div>
    )
}
