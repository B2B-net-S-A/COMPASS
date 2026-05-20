'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { completeOffboardingTask } from '@/lib/actions/lifecycle'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import type { OffboardingTask } from '@/lib/types/lifecycle'

const CATEGORY_LABEL: Record<OffboardingTask['category'], string> = {
    access_revoke: 'Cofnięcie dostępów',
    equipment_return: 'Zwrot sprzętu',
    final_settlement: 'Finalne rozliczenie',
    docs_archive: 'Archiwizacja',
    knowledge_transfer: 'Knowledge transfer',
    other: 'Inne',
}

const RESPONSIBLE_LABEL: Record<OffboardingTask['responsible_role'], string> = {
    employee: 'Pracownik',
    manager: 'Manager',
    tcm: 'TCM',
    admin: 'Admin',
    finanse: 'Finanse',
}

interface Props {
    tasks: OffboardingTask[]
    currentUserId: string
    currentUserRole: string
    employeeManagerId: string | null
}

export function OffboardingChecklist({ tasks, currentUserId, currentUserRole, employeeManagerId }: Props) {
    const router = useRouter()
    const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const [taskNotes, setTaskNotes] = useState<Record<string, string>>({})

    function canMarkComplete(task: OffboardingTask): boolean {
        if (task.completed_at) return false
        const isAdminOrTcm = currentUserRole === 'admin' || currentUserRole === 'talent_community'
        if (isAdminOrTcm) return true
        if (task.responsible_role === 'manager' && currentUserId === employeeManagerId) return true
        if (task.responsible_role === 'finanse' && currentUserRole === 'finanse') return true
        if (task.responsible_role === 'employee' && currentUserId === task.user_id) return true
        return false
    }

    function handleComplete(task: OffboardingTask) {
        setPendingTaskId(task.id)
        startTransition(async () => {
            try {
                await completeOffboardingTask(task.id, taskNotes[task.id] || null)
                toastSuccess(`Zadanie wykonane: ${task.title}`)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd przy oznaczaniu zadania')
            } finally {
                setPendingTaskId(null)
            }
        })
    }

    return (
        <div className="rounded-lg border bg-card overflow-hidden">
            <ul className="divide-y">
                {tasks.map((task) => {
                    const completed = task.completed_at !== null
                    const overdue = !completed && task.due_date && new Date(task.due_date) < new Date()
                    const allowComplete = canMarkComplete(task)
                    const taskPending = pendingTaskId === task.id && isPending

                    return (
                        <li key={task.id} className="p-4">
                            <div className="flex items-start gap-3">
                                <div className="pt-0.5">
                                    {completed ? (
                                        <div className="h-5 w-5 rounded-full bg-green-500 flex items-center justify-center">
                                            <Check className="h-3 w-3 text-white" />
                                        </div>
                                    ) : (
                                        <div className={`h-5 w-5 rounded-full border-2 ${overdue ? 'border-red-400' : 'border-muted-foreground'}`} />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <div className={`font-medium ${completed ? 'line-through text-muted-foreground' : ''}`}>
                                        {task.title}
                                        {!task.is_required && (
                                            <span className="text-xs text-muted-foreground ml-2">(opcjonalne)</span>
                                        )}
                                    </div>
                                    {task.description && (
                                        <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                                    )}
                                    <div className="flex items-center gap-2 mt-2 text-xs">
                                        <span className="px-2 py-0.5 rounded bg-muted">{CATEGORY_LABEL[task.category]}</span>
                                        <span className="text-muted-foreground">
                                            {RESPONSIBLE_LABEL[task.responsible_role]}
                                            {task.due_date && (
                                                <> • {overdue ? <span className="text-red-400">Termin: </span> : 'Termin: '}{new Date(task.due_date).toLocaleDateString('pl-PL')}</>
                                            )}
                                        </span>
                                    </div>
                                    {allowComplete && (
                                        <div className="mt-3 space-y-2">
                                            <textarea
                                                placeholder="Notatka (opcjonalna)"
                                                value={taskNotes[task.id] ?? ''}
                                                onChange={(e) => setTaskNotes({ ...taskNotes, [task.id]: e.target.value })}
                                                className="w-full rounded border bg-background px-3 py-2 text-xs"
                                                rows={2}
                                            />
                                            <Button size="sm" onClick={() => handleComplete(task)} disabled={taskPending}>
                                                {taskPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Oznacz jako zrobione'}
                                            </Button>
                                        </div>
                                    )}
                                    {completed && task.notes && (
                                        <p className="text-xs text-muted-foreground mt-2 italic">"{task.notes}"</p>
                                    )}
                                </div>
                            </div>
                        </li>
                    )
                })}
            </ul>
            {tasks.length === 0 && (
                <p className="p-8 text-sm text-muted-foreground text-center">Brak zadań offboardingu.</p>
            )}
        </div>
    )
}
