'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { ConsultantTypeahead } from './ConsultantTypeahead'
import { createInboxTicket } from '@/lib/actions/support-inbox'
import {
    INBOX_PRIORITY_LABEL,
    type InboxPriorityLevel,
} from '@/lib/types/support'

interface CategoryOption {
    id: string
    slug: string
    name_pl: string
}

interface HandlerOption {
    id: string
    full_name: string | null
    email: string
}

interface ConsultantOption {
    id: string
    full_name: string | null
    email: string
}

interface NewInboxTicketDialogProps {
    categories: CategoryOption[]
    handlers: HandlerOption[]
    currentUserId: string
}

export function NewInboxTicketDialog({
    categories,
    handlers,
    currentUserId,
}: NewInboxTicketDialogProps) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [isPending, startTransition] = useTransition()

    const [subject, setSubject] = useState('')
    const [bodyMd, setBodyMd] = useState('')
    const [emailFrom, setEmailFrom] = useState('')
    const [categoryId, setCategoryId] = useState<string>(categories[0]?.id ?? '')
    const [priorityLevel, setPriorityLevel] = useState<InboxPriorityLevel>('P3')
    const [consultant, setConsultant] = useState<ConsultantOption | null>(null)
    const [assigneeId, setAssigneeId] = useState<string>(currentUserId)

    const reset = () => {
        setSubject('')
        setBodyMd('')
        setEmailFrom('')
        setCategoryId(categories[0]?.id ?? '')
        setPriorityLevel('P3')
        setConsultant(null)
        setAssigneeId(currentUserId)
    }

    const handleSubmit = () => {
        if (!subject.trim() || subject.trim().length < 3) {
            toast.error('Tytuł musi mieć co najmniej 3 znaki')
            return
        }
        if (!bodyMd.trim() || bodyMd.trim().length < 10) {
            toast.error('Treść musi mieć co najmniej 10 znaków')
            return
        }
        if (!categoryId) {
            toast.error('Wybierz kategorię')
            return
        }

        startTransition(async () => {
            const res = await createInboxTicket({
                category_id: categoryId,
                subject: subject.trim(),
                body_md: bodyMd.trim(),
                priority_level: priorityLevel,
                consultant_id: consultant?.id,
                assignee_id: assigneeId,
                email_from: emailFrom.trim() || undefined,
            })
            if (!res.success) {
                toast.error(res.error)
                return
            }
            toast.success('Zgłoszenie utworzone')
            reset()
            setOpen(false)
            router.refresh()
        })
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                setOpen(o)
                if (!o) reset()
            }}
        >
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <Plus className="w-4 h-4" />
                    Nowe zgłoszenie
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Nowe zgłoszenie</DialogTitle>
                    <DialogDescription>
                        Wklej treść maila <em>albo</em> opisz sprawę własnymi słowami. Termin SLA zostanie obliczony automatycznie z priorytetu (P1=2, P2=5, P3=10 dni roboczych).
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="subject">Tytuł zgłoszenia *</Label>
                        <Input
                            id="subject"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder="np. Wypowiedzenie umowy — Jan Kowalski"
                            maxLength={200}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="email-from">Email nadawcy (opcjonalnie — jeśli zgłoszenie pochodzi z maila)</Label>
                        <Input
                            id="email-from"
                            type="email"
                            value={emailFrom}
                            onChange={(e) => setEmailFrom(e.target.value)}
                            placeholder="example@b2bnetwork.pl"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="body">Treść / opis sprawy *</Label>
                        <Textarea
                            id="body"
                            value={bodyMd}
                            onChange={(e) => setBodyMd(e.target.value)}
                            placeholder="Wklej treść maila albo opisz sprawę własnymi słowami..."
                            rows={8}
                            className="font-mono text-xs"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Kategoria *</Label>
                            <Select value={categoryId} onValueChange={setCategoryId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Wybierz kategorię" />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name_pl}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label>Priorytet *</Label>
                            <Select
                                value={priorityLevel}
                                onValueChange={(v) => setPriorityLevel(v as InboxPriorityLevel)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(['P1', 'P2', 'P3'] as InboxPriorityLevel[]).map((p) => (
                                        <SelectItem key={p} value={p}>
                                            {INBOX_PRIORITY_LABEL[p]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Podpięty konsultant (opcjonalnie)</Label>
                        <ConsultantTypeahead value={consultant} onChange={setConsultant} />
                    </div>

                    <div className="space-y-2">
                        <Label>Osoba odpowiedzialna *</Label>
                        <Select value={assigneeId} onValueChange={setAssigneeId}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {handlers.map((h) => (
                                    <SelectItem key={h.id} value={h.id}>
                                        {h.full_name ?? h.email}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                        Anuluj
                    </Button>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending ? 'Tworzenie...' : 'Utwórz zgłoszenie'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
