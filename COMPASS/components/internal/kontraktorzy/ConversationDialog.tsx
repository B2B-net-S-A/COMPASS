'use client'

// Phase 33 — Kontraktorzy: add/edit a conversation log entry.

import { useState } from 'react'
import { Loader2, Plus } from 'lucide-react'
import {
    Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/lib/toast'
import { addConversation, updateConversation } from '@/lib/actions/contractors'
import {
    CONVERSATION_CATEGORY_PL, CONVERSATION_STATUS_PL,
    type ConversationCategory, type ConversationListItem, type ConversationStatus,
} from '@/lib/types/contractor'

const selectCls = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm'

interface Props {
    contractors: Array<{ id: string; full_name: string }>
    tcmProfiles: Array<{ id: string; fullName: string }>
    presetContractorId?: string
    existing?: ConversationListItem
    onSaved: () => void
    triggerLabel?: string
    triggerVariant?: 'default' | 'secondary' | 'outline' | 'ghost'
}

const todayISO = (): string => new Date().toISOString().slice(0, 10)

export function ConversationDialog({ contractors, tcmProfiles, presetContractorId, existing, onSaved, triggerLabel, triggerVariant = 'default' }: Props) {
    const [open, setOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [contractorId, setContractorId] = useState(existing?.contractor_id ?? presetContractorId ?? '')
    const [date, setDate] = useState(existing?.conversation_date ?? todayISO())
    const [tcmId, setTcmId] = useState(existing?.tcm_id ?? '')
    const [client, setClient] = useState(existing?.client_snapshot ?? '')
    const [category, setCategory] = useState<ConversationCategory>(existing?.category ?? 'follow_up')
    const [status, setStatus] = useState<ConversationStatus>(existing?.status ?? 'w_toku')
    const [note, setNote] = useState(existing?.note ?? '')
    const [followUp, setFollowUp] = useState(existing?.follow_up_date ?? '')

    async function save() {
        if (!contractorId) { toast.error('Wybierz kontraktora.'); return }
        setSaving(true)
        try {
            if (existing) {
                await updateConversation(existing.id, { conversationDate: date, tcmId: tcmId || null, clientSnapshot: client, category, status, note, followUpDate: followUp || null })
            } else {
                await addConversation({ contractorId, conversationDate: date, tcmId: tcmId || null, clientSnapshot: client, category, status, note, followUpDate: followUp || null })
            }
            toast.success(existing ? 'Zapisano zmiany.' : 'Dodano rozmowę.')
            setOpen(false)
            onSaved()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się zapisać.')
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <Button onClick={() => setOpen(true)} variant={triggerVariant} className="gap-2" size="sm">
                {!existing && <Plus className="h-4 w-4" />} {triggerLabel ?? (existing ? 'Edytuj' : 'Dodaj rozmowę')}
            </Button>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{existing ? 'Edytuj rozmowę' : 'Nowa rozmowa z kontraktorem'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    {!presetContractorId && !existing && (
                        <div>
                            <Label>Kontraktor</Label>
                            <select className={selectCls} value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
                                <option value="">— wybierz —</option>
                                {contractors.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="conv-date">Data rozmowy</Label>
                            <Input id="conv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                        </div>
                        <div>
                            <Label>TCM</Label>
                            <select className={selectCls} value={tcmId} onChange={(e) => setTcmId(e.target.value)}>
                                <option value="">— ja —</option>
                                {tcmProfiles.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Sprawa</Label>
                            <select className={selectCls} value={category} onChange={(e) => setCategory(e.target.value as ConversationCategory)}>
                                {Object.entries(CONVERSATION_CATEGORY_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label>Status</Label>
                            <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as ConversationStatus)}>
                                {Object.entries(CONVERSATION_STATUS_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="conv-client">Klient</Label>
                            <Input id="conv-client" value={client} onChange={(e) => setClient(e.target.value)} placeholder="np. Nordea" />
                        </div>
                        <div>
                            <Label htmlFor="conv-followup">Follow-up (opcjonalnie)</Label>
                            <Input id="conv-followup" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="conv-note">Notatka</Label>
                        <Textarea id="conv-note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Anuluj</Button>
                    <Button onClick={save} disabled={saving} className="gap-2">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Zapisz
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
