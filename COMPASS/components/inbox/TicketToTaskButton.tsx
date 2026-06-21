'use client'

// Phase 34 — "Ticket → Zadanie": spawn a tracked Talent Community task from an inbox ticket.
// Visible only to TCM/admin (who can create contractor_tasks). The task links back via source_ticket_id.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TaskDialog } from '@/components/internal/kontraktorzy/TaskDialog'

interface Props {
    ticketId: string
    ticketSubject: string
    tcmProfiles: Array<{ id: string; fullName: string }>
    contractors: Array<{ id: string; full_name: string }>
}

export function TicketToTaskButton({ ticketId, ticketSubject, tcmProfiles, contractors }: Props) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    return (
        <>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setOpen(true)}>
                <ListPlus className="h-4 w-4" /> Utwórz zadanie z tego zgłoszenia
            </Button>
            <TaskDialog
                tcmProfiles={tcmProfiles}
                contractors={contractors}
                presetTitle={ticketSubject}
                presetSourceTicketId={ticketId}
                onSaved={() => router.refresh()}
                open={open}
                onOpenChange={setOpen}
                hideTrigger
            />
        </>
    )
}
