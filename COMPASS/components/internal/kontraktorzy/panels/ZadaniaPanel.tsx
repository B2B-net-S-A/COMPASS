'use client'

// Phase 34 — Zadania: simple department task list ("zadania naokoło"), incl. tasks spawned from inbox tickets.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/lib/toast'
import { TaskDialog } from '../TaskDialog'
import { updateTask, deleteTask } from '@/lib/actions/contractors'
import {
    CONTRACTOR_TASK_STATUS_PL, CONTRACTOR_TASK_STATUS_BADGE, CONTRACTOR_TASK_STATUSES,
    type ContractorTaskListItem, type ContractorTaskStatus,
} from '@/lib/types/contractor'
import { selectCls, todayISO } from './shared'
import { useConfirm } from '@/components/shared/ConfirmDialog'

interface Props {
    tasks: ContractorTaskListItem[]
    tcmProfiles: Array<{ id: string; fullName: string }>
    contractorsLite: Array<{ id: string; full_name: string }>
    onSaved: () => void
}

export function ZadaniaPanel({ tasks, tcmProfiles, contractorsLite, onSaved }: Props) {
    const [fStatus, setFStatus] = useState<'' | ContractorTaskStatus>('')
    const [fAssignee, setFAssignee] = useState('')
    const [q, setQ] = useState('')
    const [busyId, setBusyId] = useState<string | null>(null)
    const [confirm, ConfirmUI] = useConfirm()

    const filtered = useMemo(() => tasks.filter((t) => {
        if (fStatus && t.status !== fStatus) return false
        if (fAssignee && t.assigned_tcm_id !== fAssignee) return false
        if (q && !(`${t.title} ${t.description ?? ''} ${t.contractor_name ?? ''}`.toLowerCase().includes(q.toLowerCase()))) return false
        return true
    }), [tasks, fStatus, fAssignee, q])

    const today = todayISO()

    async function setStatus(id: string, status: ContractorTaskStatus) {
        setBusyId(id)
        try {
            await updateTask(id, { status })
            toast.success('Zaktualizowano.')
            onSaved()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Błąd.')
        } finally {
            setBusyId(null)
        }
    }

    async function remove(id: string) {
        const ok = await confirm({
            title: 'Usunąć zadanie?',
            description: 'Tej operacji nie można cofnąć.',
            confirmLabel: 'Usuń',
            variant: 'destructive',
        })
        if (!ok) return
        setBusyId(id)
        try {
            await deleteTask(id)
            toast.success('Usunięto.')
            onSaved()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Błąd.')
        } finally {
            setBusyId(null)
        }
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Input placeholder="Szukaj zadania…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
                <select className={selectCls} value={fStatus} onChange={(e) => setFStatus(e.target.value as '' | ContractorTaskStatus)}>
                    <option value="">Wszystkie statusy</option>
                    {CONTRACTOR_TASK_STATUSES.map((s) => <option key={s} value={s}>{CONTRACTOR_TASK_STATUS_PL[s]}</option>)}
                </select>
                <select className={selectCls} value={fAssignee} onChange={(e) => setFAssignee(e.target.value)}>
                    <option value="">Wszyscy TCM</option>
                    {tcmProfiles.map((t) => <option key={t.id} value={t.id}>{t.fullName}</option>)}
                </select>
                <div className="ml-auto">
                    <TaskDialog tcmProfiles={tcmProfiles} contractors={contractorsLite} onSaved={onSaved} />
                </div>
            </div>

            <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="p-2 text-left">Zadanie</th>
                            <th className="p-2 text-left">Status</th>
                            <th className="p-2 text-left">Przypisane</th>
                            <th className="p-2 text-left">Termin</th>
                            <th className="p-2 text-left">Kontekst</th>
                            <th className="p-2"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((t) => {
                            const overdue = t.due_date && t.due_date < today && t.status !== 'done'
                            return (
                                <tr key={t.id} className="border-t align-top">
                                    <td className="p-2">
                                        <div className="font-medium">{t.title}</div>
                                        {t.description && <div className="max-w-md text-xs text-muted-foreground">{t.description}</div>}
                                    </td>
                                    <td className="p-2">
                                        <span className={cn('inline-block rounded border px-2 py-0.5 text-xs', CONTRACTOR_TASK_STATUS_BADGE[t.status])}>
                                            {CONTRACTOR_TASK_STATUS_PL[t.status]}
                                        </span>
                                    </td>
                                    <td className="p-2">{t.assigned_tcm_name ?? '—'}</td>
                                    <td className={cn('p-2 whitespace-nowrap', overdue && 'font-medium text-red-600')}>{t.due_date ?? '—'}</td>
                                    <td className="p-2 text-xs">
                                        {t.contractor_name && <div>{t.contractor_name}</div>}
                                        {t.source_ticket_id && (
                                            <Link href={`/admin/inbox/${t.source_ticket_id}`} className="text-primary hover:underline">
                                                ✉ {t.source_ticket_subject ?? 'zgłoszenie'}
                                            </Link>
                                        )}
                                        {!t.contractor_name && !t.source_ticket_id && <span className="text-muted-foreground">działowe</span>}
                                    </td>
                                    <td className="p-2 whitespace-nowrap text-right">
                                        {t.status !== 'done' && (
                                            <Button size="sm" variant="ghost" disabled={busyId === t.id} onClick={() => setStatus(t.id, 'done')}>✓ Zrobione</Button>
                                        )}
                                        <TaskDialog tcmProfiles={tcmProfiles} contractors={contractorsLite} existing={t} onSaved={onSaved} triggerVariant="ghost" triggerLabel="Edytuj" />
                                        <Button size="sm" variant="ghost" disabled={busyId === t.id} onClick={() => remove(t.id)} className="text-red-600">Usuń</Button>
                                    </td>
                                </tr>
                            )
                        })}
                        {filtered.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Brak zadań.</td></tr>}
                    </tbody>
                </table>
            </div>
            <ConfirmUI />
        </div>
    )
}
