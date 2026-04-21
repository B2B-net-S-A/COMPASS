'use client'

import React, { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { X, Trash2, Calendar, Tag, AlertTriangle, MessageSquare, Clock, Send, Plus } from "lucide-react"
import { getTaskComments, addTaskComment, getTaskActivity } from '@/lib/actions/tasks'
import type { Task, TaskPriority, TaskComment } from '@/lib/actions/tasks'
import { toast } from "sonner"

const PRIORITY_OPTIONS: { value: TaskPriority; label: string; color: string }[] = [
    { value: 'low', label: 'Niski', color: 'text-slate-400' },
    { value: 'medium', label: 'Średni', color: 'text-blue-400' },
    { value: 'high', label: 'Wysoki', color: 'text-amber-400' },
    { value: 'critical', label: 'Krytyczny', color: 'text-red-400' },
]

const ACTION_LABELS: Record<string, string> = {
    created: 'Utworzono zadanie',
    updated: 'Zaktualizowano',
    moved: 'Przeniesiono',
    commented: 'Dodano komentarz',
    assigned: 'Przypisano',
}

interface TaskDetailDialogProps {
    task: Task
    onClose: () => void
    onUpdate: (updates: Partial<Pick<Task, 'title' | 'description' | 'priority' | 'due_date' | 'labels'>>) => Promise<void>
    onDelete: () => void
}

export function TaskDetailDialog({ task, onClose, onUpdate, onDelete }: TaskDetailDialogProps) {
    const [title, setTitle] = useState(task.title)
    const [description, setDescription] = useState(task.description || '')
    const [priority, setPriority] = useState<TaskPriority>(task.priority)
    const [dueDate, setDueDate] = useState(task.due_date || '')
    const [labelInput, setLabelInput] = useState('')
    const [labels, setLabels] = useState<string[]>(task.labels || [])
    const [activeTab, setActiveTab] = useState<'details' | 'comments' | 'activity'>('details')
    const [comments, setComments] = useState<TaskComment[]>([])
    const [activities, setActivities] = useState<any[]>([])
    const [newComment, setNewComment] = useState('')
    const [saving, setSaving] = useState(false)
    const [loadingComments, setLoadingComments] = useState(false)

    useEffect(() => {
        if (activeTab === 'comments') loadComments()
        if (activeTab === 'activity') loadActivity()
    }, [activeTab])

    const loadComments = async () => {
        setLoadingComments(true)
        const result = await getTaskComments(task.id)
        if (result.success && 'comments' in result) setComments(result.comments)
        setLoadingComments(false)
    }

    const loadActivity = async () => {
        const result = await getTaskActivity(task.id)
        if (result.success && 'activities' in result) setActivities(result.activities)
    }

    const handleSave = async () => {
        setSaving(true)
        await onUpdate({
            title: title.trim() || task.title,
            description: description.trim() || null,
            priority,
            due_date: dueDate || null,
            labels,
        })
        toast.success('Zadanie zaktualizowane')
        setSaving(false)
    }

    const handleAddComment = async () => {
        if (!newComment.trim()) return
        const result = await addTaskComment(task.id, newComment.trim())
        if (result.success) {
            setNewComment('')
            await loadComments()
        }
    }

    const handleAddLabel = () => {
        if (labelInput.trim() && !labels.includes(labelInput.trim())) {
            setLabels([...labels, labelInput.trim()])
            setLabelInput('')
        }
    }

    const formatDate = (iso: string) => {
        try {
            return new Date(iso).toLocaleDateString('pl-PL', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
            })
        } catch { return iso }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div
                className="w-full max-w-2xl max-h-[85vh] bg-card rounded-xl border border-white/10 shadow-2xl overflow-hidden flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className={`h-4 w-4 ${PRIORITY_OPTIONS.find(p => p.value === priority)?.color || ''}`} />
                        <span className="text-sm text-muted-foreground">Zadanie</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" onClick={onDelete}>
                            <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={onClose}>
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 px-6 py-2 border-b border-white/5">
                    {[
                        { id: 'details' as const, label: 'Szczegóły', icon: <Tag className="h-3.5 w-3.5" /> },
                        { id: 'comments' as const, label: `Komentarze${task.comments_count ? ` (${task.comments_count})` : ''}`, icon: <MessageSquare className="h-3.5 w-3.5" /> },
                        { id: 'activity' as const, label: 'Historia', icon: <Clock className="h-3.5 w-3.5" /> },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                activeTab === tab.id
                                    ? 'bg-primary/10 text-primary'
                                    : 'text-muted-foreground hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                    {activeTab === 'details' && (
                        <>
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                className="w-full bg-transparent text-xl font-semibold text-white border-none outline-none placeholder:text-muted-foreground"
                                placeholder="Tytuł zadania..."
                            />

                            <Textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Dodaj opis..."
                                className="min-h-[100px] bg-white/5 border-white/10 text-sm"
                            />

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-muted-foreground block mb-1.5">Priorytet</label>
                                    <select
                                        value={priority}
                                        onChange={e => setPriority(e.target.value as TaskPriority)}
                                        className="w-full bg-card border border-white/10 rounded-md px-3 py-2 text-sm text-white"
                                    >
                                        {PRIORITY_OPTIONS.map(p => (
                                            <option key={p.value} value={p.value}>{p.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-muted-foreground block mb-1.5">Termin</label>
                                    <input
                                        type="date"
                                        value={dueDate}
                                        onChange={e => setDueDate(e.target.value)}
                                        className="w-full bg-card border border-white/10 rounded-md px-3 py-2 text-sm text-white"
                                    />
                                </div>
                            </div>

                            {/* Labels */}
                            <div>
                                <label className="text-xs text-muted-foreground block mb-1.5">Etykiety</label>
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {labels.map(label => (
                                        <Badge
                                            key={label}
                                            variant="outline"
                                            className="text-xs gap-1 bg-primary/10 border-primary/20 cursor-pointer hover:bg-red-500/10 hover:border-red-500/20"
                                            onClick={() => setLabels(labels.filter(l => l !== label))}
                                        >
                                            {label} <X className="h-3 w-3" />
                                        </Badge>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={labelInput}
                                        onChange={e => setLabelInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddLabel()}
                                        placeholder="Dodaj etykietę..."
                                        className="flex-1 bg-card/50 border border-white/10 rounded-md px-3 py-1.5 text-xs text-white placeholder:text-muted-foreground"
                                    />
                                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleAddLabel}>
                                        <Plus className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>

                            {/* Assignees */}
                            {task.assignees && task.assignees.length > 0 && (
                                <div>
                                    <label className="text-xs text-muted-foreground block mb-1.5">Przypisani</label>
                                    <div className="flex gap-2">
                                        {task.assignees.map(a => (
                                            <div key={a.user_id} className="flex items-center gap-2 px-2 py-1 rounded-md bg-white/5 border border-white/10">
                                                <Avatar className="h-5 w-5">
                                                    <AvatarImage src={a.avatar_url || ''} />
                                                    <AvatarFallback className="text-[8px]">{a.full_name?.[0]}</AvatarFallback>
                                                </Avatar>
                                                <span className="text-xs text-white">{a.full_name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {activeTab === 'comments' && (
                        <div className="space-y-4">
                            {/* Add comment */}
                            <div className="flex gap-2">
                                <Textarea
                                    value={newComment}
                                    onChange={e => setNewComment(e.target.value)}
                                    placeholder="Napisz komentarz..."
                                    className="min-h-[60px] bg-white/5 border-white/10 text-sm flex-1"
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddComment()
                                    }}
                                />
                                <Button size="sm" className="h-auto" onClick={handleAddComment} disabled={!newComment.trim()}>
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>

                            {loadingComments ? (
                                <p className="text-sm text-muted-foreground text-center py-4">Ładowanie...</p>
                            ) : comments.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">Brak komentarzy</p>
                            ) : (
                                comments.map(comment => (
                                    <div key={comment.id} className="flex gap-3 p-3 rounded-lg bg-white/[0.02] border border-white/5">
                                        <Avatar className="h-7 w-7 shrink-0">
                                            <AvatarImage src={comment.author_avatar || ''} />
                                            <AvatarFallback className="text-[10px]">{comment.author_name?.[0] || '?'}</AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-xs font-medium text-white">{comment.author_name}</span>
                                                <span className="text-[10px] text-muted-foreground">{formatDate(comment.created_at)}</span>
                                            </div>
                                            <p className="text-sm text-white/80 whitespace-pre-wrap">{comment.content}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'activity' && (
                        <div className="space-y-2">
                            {activities.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">Brak historii</p>
                            ) : (
                                activities.map(activity => (
                                    <div key={activity.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                                        <div className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <span className="text-xs text-white">{ACTION_LABELS[activity.action] || activity.action}</span>
                                        </div>
                                        <span className="text-[10px] text-muted-foreground shrink-0">{formatDate(activity.created_at)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {activeTab === 'details' && (
                    <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-white/10">
                        <Button variant="ghost" size="sm" onClick={onClose}>Anuluj</Button>
                        <Button size="sm" onClick={handleSave} disabled={saving}>
                            {saving ? 'Zapisuję...' : 'Zapisz zmiany'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )
}
