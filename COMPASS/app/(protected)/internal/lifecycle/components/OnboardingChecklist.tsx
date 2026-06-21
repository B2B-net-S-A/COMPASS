'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, FileUp, GraduationCap, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { completeOnboardingTask } from '@/lib/actions/lifecycle'
import type { OnboardingTask, ResponsibleRole } from '@/lib/types/lifecycle'

const CATEGORY_LABEL: Record<OnboardingTask['category'], string> = {
    docs: 'Dokumenty',
    access: 'Dostępy',
    training: 'Szkolenia',
    meeting: 'Spotkania',
    equipment: 'Sprzęt',
    other: 'Inne',
}

const RESPONSIBLE_LABEL: Record<ResponsibleRole, string> = {
    employee: 'Pracownik',
    manager: 'Manager',
    buddy: 'Buddy',
    tcm: 'TCM',
    admin: 'Admin',
}

interface Props {
    tasks: OnboardingTask[]
    canEdit: boolean
    currentUserId: string
    currentUserRole: string
    employeeId: string
    employeeManagerId: string | null
    employeeBuddyId: string | null
}

export function OnboardingChecklist({
    tasks,
    canEdit,
    currentUserId,
    currentUserRole,
    employeeId,
    employeeManagerId,
    employeeBuddyId,
}: Props) {
    const router = useRouter()
    const [pendingTaskId, setPendingTaskId] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    function canMarkComplete(task: OnboardingTask): boolean {
        if (!canEdit) return false
        if (task.completed_at) return false
        const isAdminOrTcm = currentUserRole === 'admin' || currentUserRole === 'talent_community'
        if (isAdminOrTcm) return true
        if (task.responsible_role === 'employee' && currentUserId === employeeId) return true
        if (task.responsible_role === 'manager' && currentUserId === employeeManagerId) return true
        if (task.responsible_role === 'buddy' && currentUserId === employeeBuddyId) return true
        return false
    }

    async function handleComplete(task: OnboardingTask, formData: FormData) {
        formData.set('taskId', task.id)
        setPendingTaskId(task.id)
        startTransition(async () => {
            try {
                await completeOnboardingTask(formData)
                toastSuccess(`Zadanie wykonane: ${task.title}`)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd przy oznaczaniu zadania')
            } finally {
                setPendingTaskId(null)
            }
        })
    }

    // Group by category
    const grouped = new Map<OnboardingTask['category'], OnboardingTask[]>()
    for (const t of tasks) {
        const list = grouped.get(t.category) ?? []
        list.push(t)
        grouped.set(t.category, list)
    }

    return (
        <div className="space-y-4">
            {Array.from(grouped.entries()).map(([cat, list]) => (
                <div key={cat} className="rounded-lg border bg-card overflow-hidden">
                    <div className="bg-muted/50 px-4 py-2 border-b">
                        <h3 className="font-semibold text-sm">{CATEGORY_LABEL[cat]}</h3>
                    </div>
                    <ul className="divide-y">
                        {list.map((task) => {
                            const completed = task.completed_at !== null
                            const overdue = !completed && task.due_date && new Date(task.due_date) < new Date()
                            const allowComplete = canMarkComplete(task)
                            const taskPending = pendingTaskId === task.id && isPending

                            return (
                                <li key={task.id} className="p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="pt-0.5">
                                            {completed ? (
                                                <div className="h-5 w-5 rounded-full bg-success flex items-center justify-center">
                                                    <Check className="h-3 w-3 text-white" />
                                                </div>
                                            ) : (
                                                <div className={`h-5 w-5 rounded-full border-2 ${overdue ? 'border-destructive' : 'border-muted-foreground'}`} />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
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
                                                <span className="text-muted-foreground">
                                                    {RESPONSIBLE_LABEL[task.responsible_role]}
                                                </span>
                                                {task.due_date && (
                                                    <span className={overdue ? 'text-destructive' : 'text-muted-foreground'}>
                                                        • Termin: {new Date(task.due_date).toLocaleDateString('pl-PL')}
                                                    </span>
                                                )}
                                                {task.course_slug && (
                                                    <Link
                                                        href={`/learning/${task.course_slug}`}
                                                        target="_blank"
                                                        className="inline-flex items-center gap-1 text-info hover:underline"
                                                    >
                                                        <GraduationCap className="h-3 w-3" /> Kurs Akademii
                                                    </Link>
                                                )}
                                            </div>

                                            {allowComplete && (
                                                <form
                                                    action={(formData) => handleComplete(task, formData)}
                                                    className="mt-3 flex items-end gap-2"
                                                    encType="multipart/form-data"
                                                >
                                                    {task.requires_file && (
                                                        <div className="flex-1 min-w-0">
                                                            <label className="block text-xs text-muted-foreground mb-1">
                                                                <FileUp className="inline h-3 w-3 mr-1" />
                                                                Plik (wymagany)
                                                            </label>
                                                            <input
                                                                type="file"
                                                                name="file"
                                                                required
                                                                className="text-xs w-full"
                                                                disabled={taskPending}
                                                            />
                                                        </div>
                                                    )}
                                                    <input type="hidden" name="taskId" value={task.id} />
                                                    <Button type="submit" size="sm" disabled={taskPending}>
                                                        {taskPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Oznacz jako zrobione'}
                                                    </Button>
                                                </form>
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
                </div>
            ))}
            {tasks.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Brak zadań w tym onboardingu.</p>
            )}
        </div>
    )
}
