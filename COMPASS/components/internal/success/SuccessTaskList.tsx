'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Play } from 'lucide-react'
import { updateSuccessTask } from '@/lib/actions/consultant-success'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { PriorityBadge, TaskStatusBadge, formatSuccessDate, isPastDue } from './SuccessBadges'
import { EditTaskDialog } from './SuccessActions'
import { cn } from '@/lib/utils'
import type { SuccessTask, SuccessTaskStatus, SuccessTcmOption } from '@/lib/types/consultant-success'

export function SuccessTaskList({ tasks, focusId, tcmOptions = [] }: { tasks: SuccessTask[]; focusId?: string; tcmOptions?: SuccessTcmOption[] }) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [busyId, setBusyId] = useState<string | null>(null)

    function changeStatus(taskId: string, status: SuccessTaskStatus) {
        setBusyId(taskId)
        startTransition(async () => {
            try {
                await updateSuccessTask({ taskId, status })
                toast.success(status === 'done' ? 'Action step zakończony.' : 'Action step jest w toku.')
                router.refresh()
            } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Nie udało się zmienić statusu.')
            } finally {
                setBusyId(null)
            }
        })
    }

    if (tasks.length === 0) return <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Brak action steps.</p>

    return (
        <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {tasks.map((task) => {
                const overdue = task.status !== 'done' && isPastDue(task.dueDate)
                const focused = focusId === task.id
                return (
                    <article
                        key={task.id}
                        id={`focus-${task.id}`}
                        className={cn('scroll-mt-24 p-4 transition-colors', focused && 'bg-primary/5 ring-2 ring-inset ring-primary/40')}
                    >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-foreground">{task.title}</h3><TaskStatusBadge status={task.status} /><PriorityBadge priority={task.priority} /></div>
                                {task.description ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{task.description}</p> : null}
                                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                    <span>Właściciel: {task.assignedTcmName ?? 'nieprzypisany'}</span>
                                    <span className={overdue ? 'font-semibold text-destructive' : ''}>Termin: {formatSuccessDate(task.dueDate)}</span>
                                    {task.snoozedUntil ? <span>Wyciszone do: {formatSuccessDate(task.snoozedUntil)}</span> : null}
                                </div>
                                {task.outcome ? <p className="mt-2 text-sm"><strong>Rezultat:</strong> {task.outcome}</p> : null}
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                                {task.status !== 'done' && task.status !== 'cancelled' ? (
                                    <>
                                    {task.status === 'todo' ? <Button variant="outline" size="sm" disabled={pending && busyId === task.id} onClick={() => changeStatus(task.id, 'in_progress')}>{pending && busyId === task.id ? <Loader2 className="animate-spin" /> : <Play />}W toku</Button> : null}
                                    <Button size="sm" disabled={pending && busyId === task.id} onClick={() => changeStatus(task.id, 'done')}>{pending && busyId === task.id ? <Loader2 className="animate-spin" /> : <Check />}Zrobione</Button>
                                    </>
                                ) : null}
                                <EditTaskDialog task={task} tcmOptions={tcmOptions} />
                            </div>
                        </div>
                    </article>
                )
            })}
        </div>
    )
}
