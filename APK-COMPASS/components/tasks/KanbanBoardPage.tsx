'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Plus, ArrowLeft, Calendar, MessageSquare, GripVertical, MoreHorizontal, Trash2 } from "lucide-react"
import { getColumns, getBoardTasks, createTask, moveTask, updateTask, deleteTask, createColumn } from '@/lib/actions/tasks'
import type { TaskColumn, Task, TaskPriority } from '@/lib/actions/tasks'
import { TaskDetailDialog } from './TaskDetailDialog'
import Link from 'next/link'
import { toast } from "sonner"

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string }> = {
    low: { label: 'Niski', color: 'text-slate-400', bg: 'bg-slate-500/20 border-slate-500/30' },
    medium: { label: 'Średni', color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30' },
    high: { label: 'Wysoki', color: 'text-amber-400', bg: 'bg-amber-500/20 border-amber-500/30' },
    critical: { label: 'Krytyczny', color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30' },
}

interface KanbanBoardPageProps {
    boardId: string
}

export function KanbanBoardPage({ boardId }: KanbanBoardPageProps) {
    const [columns, setColumns] = useState<TaskColumn[]>([])
    const [tasks, setTasks] = useState<Task[]>([])
    const [loading, setLoading] = useState(true)
    const [addingToColumn, setAddingToColumn] = useState<string | null>(null)
    const [newTaskTitle, setNewTaskTitle] = useState('')
    const [selectedTask, setSelectedTask] = useState<Task | null>(null)
    const [showAddColumn, setShowAddColumn] = useState(false)
    const [newColumnTitle, setNewColumnTitle] = useState('')

    const loadData = useCallback(async () => {
        const [colResult, taskResult] = await Promise.all([
            getColumns(boardId),
            getBoardTasks(boardId),
        ])
        if (colResult.success && 'columns' in colResult) setColumns(colResult.columns)
        if (taskResult.success && 'tasks' in taskResult) setTasks(taskResult.tasks)
        setLoading(false)
    }, [boardId])

    useEffect(() => { loadData() }, [loadData])

    const handleDragEnd = async (result: DropResult) => {
        if (!result.destination) return

        const { draggableId, destination } = result
        const targetColumnId = destination.droppableId
        const targetPosition = destination.index

        setTasks(prev => prev.map(t =>
            t.id === draggableId
                ? { ...t, column_id: targetColumnId, position: targetPosition }
                : t
        ))

        await moveTask(draggableId, targetColumnId, targetPosition)
    }

    const handleAddTask = async (columnId: string) => {
        if (!newTaskTitle.trim()) return
        const result = await createTask({
            board_id: boardId,
            column_id: columnId,
            title: newTaskTitle.trim(),
        })
        if (result.success) {
            setNewTaskTitle('')
            setAddingToColumn(null)
            await loadData()
        } else {
            toast.error('error' in result ? result.error : 'Nie udało się utworzyć zadania')
        }
    }

    const handleDeleteTask = async (taskId: string) => {
        const result = await deleteTask(taskId)
        if (result.success) {
            setTasks(prev => prev.filter(t => t.id !== taskId))
            setSelectedTask(null)
            toast.success('Zadanie usunięte')
        }
    }

    const handleAddColumn = async () => {
        if (!newColumnTitle.trim()) return
        const result = await createColumn(boardId, newColumnTitle.trim())
        if (result.success) {
            setNewColumnTitle('')
            setShowAddColumn(false)
            await loadData()
            toast.success('Kolumna dodana')
        }
    }

    const getColumnTasks = (columnId: string) =>
        tasks.filter(t => t.column_id === columnId).sort((a, b) => a.position - b.position)

    const isOverdue = (date: string | null) => {
        if (!date) return false
        return new Date(date) < new Date()
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-muted-foreground animate-pulse">Ładowanie tablicy...</div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] -m-6">
            {/* Header */}
            <div className="flex items-center gap-4 px-6 py-3 bg-background/80 border-b border-white/10 backdrop-blur-md z-20">
                <Link href="/admin/tasks">
                    <Button variant="ghost" size="icon" className="hover:bg-white/10">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                </Link>
                <h1 className="text-lg font-semibold text-white">Kanban Board</h1>
                <div className="ml-auto flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                        {tasks.length} zadań
                    </Badge>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
                <DragDropContext onDragEnd={handleDragEnd}>
                    <div className="flex gap-4 h-full min-w-max">
                        {columns.map(column => {
                            const colTasks = getColumnTasks(column.id)
                            return (
                                <div key={column.id} className="flex flex-col w-72 shrink-0 bg-card/30 rounded-xl border border-white/5">
                                    {/* Column header */}
                                    <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: column.color }} />
                                            <span className="text-sm font-medium text-white">{column.title}</span>
                                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px] bg-white/5">
                                                {colTasks.length}
                                            </Badge>
                                        </div>
                                        <button
                                            onClick={() => { setAddingToColumn(column.id); setNewTaskTitle('') }}
                                            className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </button>
                                    </div>

                                    {/* Add task form */}
                                    {addingToColumn === column.id && (
                                        <div className="p-2 border-b border-white/5">
                                            <input
                                                type="text"
                                                value={newTaskTitle}
                                                onChange={e => setNewTaskTitle(e.target.value)}
                                                placeholder="Tytuł zadania..."
                                                className="w-full bg-card/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                                                autoFocus
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleAddTask(column.id)
                                                    if (e.key === 'Escape') setAddingToColumn(null)
                                                }}
                                            />
                                            <div className="flex gap-1.5 mt-1.5">
                                                <Button size="sm" className="h-7 text-xs" onClick={() => handleAddTask(column.id)} disabled={!newTaskTitle.trim()}>
                                                    Dodaj
                                                </Button>
                                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddingToColumn(null)}>
                                                    Anuluj
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Task cards */}
                                    <Droppable droppableId={column.id}>
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.droppableProps}
                                                className={`flex-1 overflow-y-auto p-2 space-y-2 min-h-[60px] transition-colors ${
                                                    snapshot.isDraggingOver ? 'bg-primary/5' : ''
                                                }`}
                                            >
                                                {colTasks.map((task, index) => (
                                                    <Draggable key={task.id} draggableId={task.id} index={index}>
                                                        {(provided, snapshot) => (
                                                            <div
                                                                ref={provided.innerRef}
                                                                {...provided.draggableProps}
                                                                className={`group rounded-lg border p-3 cursor-pointer transition-all ${
                                                                    snapshot.isDragging
                                                                        ? 'bg-card border-primary/30 shadow-lg shadow-primary/10 rotate-1'
                                                                        : 'bg-card/50 border-white/5 hover:border-white/15'
                                                                }`}
                                                                onClick={() => setSelectedTask(task)}
                                                            >
                                                                <div className="flex items-start gap-2">
                                                                    <div
                                                                        {...provided.dragHandleProps}
                                                                        className="mt-0.5 opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity"
                                                                    >
                                                                        <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="text-sm font-medium text-white line-clamp-2">{task.title}</p>

                                                                        {/* Labels */}
                                                                        {task.labels && task.labels.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                                                                {task.labels.map(label => (
                                                                                    <span key={label} className="px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary border border-primary/20">
                                                                                        {label}
                                                                                    </span>
                                                                                ))}
                                                                            </div>
                                                                        )}

                                                                        {/* Bottom row: priority, due date, assignees, comments */}
                                                                        <div className="flex items-center gap-2 mt-2">
                                                                            <Badge
                                                                                variant="outline"
                                                                                className={`text-[10px] px-1.5 py-0 h-4 ${PRIORITY_CONFIG[task.priority].bg} ${PRIORITY_CONFIG[task.priority].color}`}
                                                                            >
                                                                                {PRIORITY_CONFIG[task.priority].label}
                                                                            </Badge>

                                                                            {task.due_date && (
                                                                                <span className={`flex items-center gap-0.5 text-[10px] ${
                                                                                    isOverdue(task.due_date) ? 'text-red-400' : 'text-muted-foreground'
                                                                                }`}>
                                                                                    <Calendar className="h-3 w-3" />
                                                                                    {new Date(task.due_date).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short' })}
                                                                                </span>
                                                                            )}

                                                                            {(task.comments_count ?? 0) > 0 && (
                                                                                <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                                                                    <MessageSquare className="h-3 w-3" />
                                                                                    {task.comments_count}
                                                                                </span>
                                                                            )}

                                                                            <div className="flex -space-x-1 ml-auto">
                                                                                {(task.assignees || []).slice(0, 3).map(a => (
                                                                                    <Avatar key={a.user_id} className="h-5 w-5 border border-card">
                                                                                        <AvatarImage src={a.avatar_url || ''} />
                                                                                        <AvatarFallback className="text-[8px] bg-primary/20">
                                                                                            {a.full_name?.[0] || '?'}
                                                                                        </AvatarFallback>
                                                                                    </Avatar>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </Draggable>
                                                ))}
                                                {provided.placeholder}
                                            </div>
                                        )}
                                    </Droppable>
                                </div>
                            )
                        })}

                        {/* Add column */}
                        <div className="w-72 shrink-0">
                            {showAddColumn ? (
                                <div className="bg-card/30 rounded-xl border border-white/5 p-3 space-y-2">
                                    <input
                                        type="text"
                                        value={newColumnTitle}
                                        onChange={e => setNewColumnTitle(e.target.value)}
                                        placeholder="Nazwa kolumny..."
                                        className="w-full bg-transparent border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                                        autoFocus
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') handleAddColumn()
                                            if (e.key === 'Escape') setShowAddColumn(false)
                                        }}
                                    />
                                    <div className="flex gap-1.5">
                                        <Button size="sm" className="h-7 text-xs" onClick={handleAddColumn}>Dodaj</Button>
                                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddColumn(false)}>Anuluj</Button>
                                    </div>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowAddColumn(true)}
                                    className="w-full h-10 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/10 text-muted-foreground hover:border-primary/30 hover:text-primary transition-all text-sm"
                                >
                                    <Plus className="h-4 w-4" />
                                    Dodaj kolumnę
                                </button>
                            )}
                        </div>
                    </div>
                </DragDropContext>
            </div>

            {/* Task Detail Dialog */}
            {selectedTask && (
                <TaskDetailDialog
                    task={selectedTask}
                    onClose={() => setSelectedTask(null)}
                    onUpdate={async (updates) => {
                        await updateTask(selectedTask.id, updates)
                        await loadData()
                        setSelectedTask(null)
                    }}
                    onDelete={() => handleDeleteTask(selectedTask.id)}
                />
            )}
        </div>
    )
}
