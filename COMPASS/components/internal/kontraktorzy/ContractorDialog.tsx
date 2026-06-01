'use client'

// Phase 33 — Kontraktorzy: add / edit a contractor identity.

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
import { createContractor, updateContractor } from '@/lib/actions/contractors'
import { CONTRACTOR_STATUS_PL, type ContractorRow, type ContractorStatus } from '@/lib/types/contractor'

const selectCls = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm'

interface Props {
    tcmProfiles: Array<{ id: string; fullName: string }>
    existing?: ContractorRow
    onSaved: () => void
    triggerLabel?: string
    triggerVariant?: 'default' | 'secondary' | 'outline' | 'ghost'
}

export function ContractorDialog({ tcmProfiles, existing, onSaved, triggerLabel, triggerVariant = 'default' }: Props) {
    const [open, setOpen] = useState(false)
    const [saving, setSaving] = useState(false)
    const [fullName, setFullName] = useState(existing?.full_name ?? '')
    const [phone, setPhone] = useState(existing?.phone ?? '')
    const [email, setEmail] = useState(existing?.email ?? '')
    const [client, setClient] = useState(existing?.current_client ?? '')
    const [position, setPosition] = useState(existing?.current_position ?? '')
    const [ownerTcmId, setOwnerTcmId] = useState(existing?.owner_tcm_id ?? '')
    const [status, setStatus] = useState<ContractorStatus>(existing?.status ?? 'active')
    const [notes, setNotes] = useState(existing?.notes ?? '')

    async function save() {
        if (fullName.trim().length < 2) { toast.error('Podaj imię i nazwisko.'); return }
        setSaving(true)
        try {
            const payload = { phone, email, currentClient: client, currentPosition: position, ownerTcmId: ownerTcmId || null, status, notes }
            if (existing) await updateContractor(existing.id, { fullName, ...payload })
            else await createContractor({ fullName, ...payload })
            toast.success(existing ? 'Zapisano.' : 'Dodano kontraktora.')
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
                {!existing && <Plus className="h-4 w-4" />} {triggerLabel ?? (existing ? 'Edytuj' : 'Dodaj kontraktora')}
            </Button>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{existing ? 'Edytuj kontraktora' : 'Nowy kontraktor'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div>
                        <Label htmlFor="c-name">Imię i nazwisko</Label>
                        <Input id="c-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="c-phone">Telefon</Label>
                            <Input id="c-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
                        </div>
                        <div>
                            <Label htmlFor="c-email">E-mail</Label>
                            <Input id="c-email" value={email} onChange={(e) => setEmail(e.target.value)} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label htmlFor="c-client">Klient</Label>
                            <Input id="c-client" value={client} onChange={(e) => setClient(e.target.value)} />
                        </div>
                        <div>
                            <Label htmlFor="c-position">Stanowisko</Label>
                            <Input id="c-position" value={position} onChange={(e) => setPosition(e.target.value)} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Opiekun (TCM)</Label>
                            <select className={selectCls} value={ownerTcmId} onChange={(e) => setOwnerTcmId(e.target.value)}>
                                <option value="">— brak —</option>
                                {tcmProfiles.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label>Status</Label>
                            <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as ContractorStatus)}>
                                {Object.entries(CONTRACTOR_STATUS_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <Label htmlFor="c-notes">Notatki</Label>
                        <Textarea id="c-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
