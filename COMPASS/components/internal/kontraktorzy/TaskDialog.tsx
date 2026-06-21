'use client'

// Phase 34 — Kontraktorzy: create/edit a department task ("Zadania"). Mirrors ConversationDialog.
// Supports controlled open + hidden trigger so the inbox "Ticket → Zadanie" button can drive it.

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
import { createTask, updateTask } from '@/lib/actions/contractors'
import {
    CONTRACTOR_TASK_STATUS_PL,
    type ContractorTaskListItem,
    type ContractorTaskStatus,
} from '@/lib/types/contractor'

const selectCls = 'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm'

interface Props {
    tcmProfiles: Array<{ id: string; fullName: string }>
    contractors: Array<{ id: string; full_name: string }>
    existing?: ContractorTaskListItem
    presetTitle?: string
    presetSourceTicketId?: string
    presetContractorId?: string
    onSaved: () => void
    triggerLabel?: string
    triggerVariant?: 'default' | 'secondary' | 'outline' | 'ghost'
    /** Controlled open (for the inbox "Ticket → Zadanie" flow). */
    open?: boolean
    onOpenChange?: (open: boolean) => void
    /** Hide the built-in trigger button (parent renders its own). */
    hideTrigger?: boolean
}

export function TaskDialog({
    tcmProfiles, contractors, existing, presetTitle, presetSourceTicketId, presetContractorId,
    onSaved, triggerLabel, triggerVariant = 'default', open: controlledOpen, onOpenChange, hideTrigger,
}: Props) {
    const [internalOpen, setInternalOpen] = useState(false)
    const open = controlledOpen ?? internalOpen
    const setOpen = onOpenChange ?? setInternalOpen
    const [saving, setSaving] = useState(false)
    const [title, setTitle] = useState(existing?.title ?? presetTitle ?? '')
    const [description, setDescription] = useState(existing?.description ?? '')
    const [status, setStatus] = useState<ContractorTaskStatus>(existing?.status ?? 'todo')
    const [assignedTcmId, setAssignedTcmId] = useState(existing?.assigned_tcm_id ?? '')
    const [dueDate, setDueDate] = useState(existing?.due_date ?? '')
    const [contractorId, setContractorId] = useState(existing?.contractor_id ?? presetContractorId ?? '')

    async function save() {
        if (title.trim().length < 2) { toast.error('Tytuł zadania jest wymagany.'); return }
        setSaving(true)
        try {
            if (existing) {
                await updateTask(existing.id, {
                    title, description, status,
                    assignedTcmId: assignedTcmId || null, dueDate: dueDate || null, contractorId: contractorId || null,
                })
            } else {
                await createTask({
                    title, description, status,
                    assignedTcmId: assignedTcmId || null, dueDate: dueDate || null,
                    contractorId: contractorId || null, sourceTicketId: presetSourceTicketId || null,
                })
            }
            toast.success(existing ? 'Zapisano zadanie.' : 'Dodano zadanie.')
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
            {!hideTrigger && (
                <Button onClick={() => setOpen(true)} variant={triggerVariant} className="gap-2" size="sm">
                    {!existing && <Plus className="h-4 w-4" />} {triggerLabel ?? (existing ? 'Edytuj' : 'Nowe zadanie')}
                </Button>
            )}
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{existing ? 'Edytuj zadanie' : 'Nowe zadanie'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div>
                        <Label htmlFor="task-title">Tytuł</Label>
                        <Input id="task-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="np. Skontaktować się z klientem ws. przedłużenia" />
                    </div>
                    <div>
                        <Label htmlFor="task-desc">Opis (opcjonalnie)</Label>
                        <Textarea id="task-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Status</Label>
                            <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value as ContractorTaskStatus)}>
                                {Object.entries(CONTRACTOR_TASK_STATUS_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label htmlFor="task-due">Termin (opcjonalnie)</Label>
                            <Input id="task-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label>Przypisz do (TCM)</Label>
                            <select className={selectCls} value={assignedTcmId} onChange={(e) => setAssignedTcmId(e.target.value)}>
                                <option value="">— nieprzypisane —</option>
                                {tcmProfiles.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                            </select>
                        </div>
                        <div>
                            <Label>Kontraktor (opcjonalnie)</Label>
                            <select className={selectCls} value={contractorId} onChange={(e) => setContractorId(e.target.value)}>
                                <option value="">— zadanie działowe —</option>
                                {contractors.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
                            </select>
                        </div>
                    </div>
                    {presetSourceTicketId && (
                        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                            Zadanie powiązane ze zgłoszeniem ze skrzynki administracja@.
                        </p>
                    )}
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
