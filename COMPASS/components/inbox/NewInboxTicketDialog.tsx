'use client'

import { useState } from 'react'
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
import { AREA_LABELS, INBOX_WORK_PRIORITY_LABEL, type InboxArea } from '@/lib/inbox/workspace'
import { fieldClass } from './InboxCaseEditor'
import { ConsultantTypeahead, type ConsultantSelection } from './ConsultantTypeahead'
import { createInboxTicket } from '@/lib/actions/support-inbox'
import {
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

interface NewInboxTicketDialogProps {
    categories: CategoryOption[]
    handlers: HandlerOption[]
    currentUserId: string
    defaultArea?: InboxArea
    triggerLabel?: string
}

export function NewInboxTicketDialog({
    categories,
    handlers,
    currentUserId,
    triggerLabel = 'Dodaj sprawę',
    defaultArea = 'administration',
}: NewInboxTicketDialogProps) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [isPending, setPending] = useState(false)

    const defaultCategory = (defaultArea === 'marketing' ? categories.find((category) => category.slug === 'inbox_marketing') : categories[0])?.id ?? ''
    const defaultAssignee = handlers.some((handler) => handler.id === currentUserId) ? currentUserId : ''
    const [area, setArea] = useState<InboxArea>(defaultArea)
    const [plannedDate, setPlannedDate] = useState('')
    const [subject, setSubject] = useState('')
    const [bodyMd, setBodyMd] = useState('')
    const [emailFrom, setEmailFrom] = useState('')
    const [categoryId, setCategoryId] = useState<string>(defaultCategory)
    const [priorityLevel, setPriorityLevel] = useState<InboxPriorityLevel>('P3')
    const [consultant, setConsultant] = useState<ConsultantSelection | null>(null)
    const [consultantPhone, setConsultantPhone] = useState('')
    const [clientName, setClientName] = useState('')
    const [assigneeId, setAssigneeId] = useState<string>(defaultAssignee)

    // Selecting a directory consultant auto-fills phone + client; both stay editable.
    const handleConsultantChange = (sel: ConsultantSelection | null) => {
        setConsultant(sel)
        if (sel) {
            setConsultantPhone(sel.phone ?? '')
            setClientName(sel.current_client ?? '')
        }
    }

    const reset = () => {
        setSubject('')
        setBodyMd('')
        setEmailFrom('')
        setCategoryId(defaultCategory)
        setPriorityLevel('P3')
        setConsultant(null)
        setConsultantPhone('')
        setClientName('')
        setAssigneeId(defaultAssignee)
        setArea(defaultArea)
        setPlannedDate('')
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

        if (!assigneeId) { toast.error('Wybierz osobę odpowiedzialną'); return }

        if (isPending) return
        setPending(true)
        void (async () => {
            try {
            const res = await createInboxTicket({
                category_id: categoryId,
                work_area: area,
                planned_due_date: plannedDate || null,
                subject: subject.trim(),
                body_md: bodyMd.trim(),
                priority_level: priorityLevel,
                consultant_name: consultant?.full_name || undefined,
                consultant_phone: consultantPhone.trim() || undefined,
                client_name: clientName.trim() || undefined,
                contractor_id: consultant?.id ?? undefined,
                assignee_id: assigneeId,
                email_from: emailFrom.trim() || undefined,
            })
            if (!res.success) {
                toast.error(res.error)
                return
            }
            toast.success('Sprawa utworzona')
            reset()
            setOpen(false)
            router.refresh()
            } catch { toast.error('Nie udało się utworzyć sprawy. Spróbuj ponownie.') }
            finally { setPending(false) }
        })()
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                if (isPending) return
                setOpen(o)
                if (!o) reset()
            }}
        >
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <Plus className="w-4 h-4" />
                    {triggerLabel}
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Nowa sprawa</DialogTitle>
                    <DialogDescription>
                        Opisz, co trzeba zrobić, wskaż osobę odpowiedzialną i termin. Checklistę i materiały dodasz w szczegółach sprawy.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="subject">Tytuł sprawy *</Label>
                        <Input
                            id="subject"
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            placeholder={area === 'marketing' ? 'np. Grafika do kampanii jesiennej' : 'np. Wypowiedzenie umowy — Jan Kowalski'}
                            maxLength={200}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="body">Treść / opis sprawy *</Label>
                        <Textarea
                            id="body"
                            value={bodyMd}
                            onChange={(e) => setBodyMd(e.target.value)}
                            placeholder="Wklej treść maila albo opisz sprawę własnymi słowami..."
                            rows={3}
                            maxLength={20000}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="text-sm font-medium space-y-2">Obszar
                            <select className={fieldClass} value={area} onChange={(event) => setArea(event.target.value as InboxArea)}>{Object.entries(AREA_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                        </label>
                        <label className="text-sm font-medium space-y-2">Planowany termin
                            <Input type="date" min="2000-01-01" max="2100-12-31" value={plannedDate} onChange={(event) => setPlannedDate(event.target.value)} />
                        </label>
                    </div>
                    <p className="text-xs text-muted-foreground">{area === 'marketing' ? 'Termin Marketingu jest niezależny od SLA. Możesz ustalić go później.' : 'Bez planowanego terminu obowiązuje SLA: P1 — 2, P2 — 5, P3 — 10 dni roboczych.'}</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="inbox-new-category">Typ sprawy *</Label>
                            <Select value={categoryId} onValueChange={setCategoryId}>
                                <SelectTrigger id="inbox-new-category">
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
                            <Label htmlFor="inbox-new-priority">Priorytet *</Label>
                            <Select
                                value={priorityLevel}
                                onValueChange={(v) => setPriorityLevel(v as InboxPriorityLevel)}
                            >
                                <SelectTrigger id="inbox-new-priority">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {(['P1', 'P2', 'P3'] as InboxPriorityLevel[]).map((p) => (
                                        <SelectItem key={p} value={p}>
                                            {INBOX_WORK_PRIORITY_LABEL[p]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="inbox-new-owner">Osoba odpowiedzialna *</Label>
                        <Select value={assigneeId} onValueChange={setAssigneeId}>
                            <SelectTrigger id="inbox-new-owner">
                                <SelectValue placeholder="Wybierz osobę" />
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
                    <details className="rounded-md border p-3 space-y-4">
                        <summary className="cursor-pointer text-sm font-medium">Dodatkowe dane: email, konsultant, telefon, klient</summary>
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
                        <Label>Podpięty konsultant (opcjonalnie)</Label>
                        <ConsultantTypeahead value={consultant} onChange={handleConsultantChange} />
                        <p className="text-xs text-muted-foreground">
                            Szukaj w bazie konsultantów — po wybraniu telefon i klient uzupełnią się automatycznie. Brak w bazie? Wpisz ręcznie.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="consultant-phone">Telefon konsultanta</Label>
                            <Input
                                id="consultant-phone"
                                type="tel"
                                value={consultantPhone}
                                onChange={(e) => setConsultantPhone(e.target.value)}
                                placeholder="np. +48 600 000 000"
                                maxLength={40}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="client-name">Klient</Label>
                            <Input
                                id="client-name"
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                placeholder="np. Nordea"
                                maxLength={120}
                            />
                        </div>
                    </div>

                    </details>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
                        Anuluj
                    </Button>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending ? 'Tworzenie...' : 'Utwórz sprawę'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
