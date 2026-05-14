'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { MessageSquare, Plus, User } from "lucide-react"
import { toast } from "sonner"

interface AdminNote {
    author_id: string
    author_name: string
    content: string
    created_at: string
    category: 'feedback' | 'observation' | 'warning' | 'praise' | 'other'
}

const CATEGORY_CONFIG: Record<AdminNote['category'], { label: string; color: string }> = {
    feedback: { label: 'Feedback', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    observation: { label: 'Obserwacja', color: 'bg-slate-500/20 text-slate-300 border-slate-500/30' },
    warning: { label: 'Ostrzeżenie', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
    praise: { label: 'Pochwała', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
    other: { label: 'Inne', color: 'bg-gray-500/20 text-gray-300 border-gray-500/30' },
}

const CATEGORIES = Object.entries(CATEGORY_CONFIG).map(([value, cfg]) => ({
    value: value as AdminNote['category'],
    label: cfg.label,
}))

interface AdminNotesSectionProps {
    notes: AdminNote[]
    onAddNote: (data: { content: string; category: string }) => Promise<void>
    canAdd?: boolean
}

export type { AdminNote }

export function AdminNotesSection({ notes, onAddNote, canAdd = true }: AdminNotesSectionProps) {
    const [content, setContent] = useState('')
    const [category, setCategory] = useState<AdminNote['category']>('observation')
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async () => {
        if (!content.trim()) {
            toast.error('Treść notatki nie może być pusta')
            return
        }
        setSubmitting(true)
        try {
            await onAddNote({ content: content.trim(), category })
            setContent('')
            setCategory('observation')
            toast.success('Notatka dodana')
        } catch {
            toast.error('Nie udało się dodać notatki')
        } finally {
            setSubmitting(false)
        }
    }

    const formatDate = (iso: string) => {
        try {
            return new Date(iso).toLocaleDateString('pl-PL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
            })
        } catch {
            return iso
        }
    }

    const sortedNotes = [...notes].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-primary" />
                    Notatki wewnętrzne
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                    Widoczne tylko dla zespołu Centrala i Administratorów
                </p>
            </CardHeader>
            <CardContent className="space-y-4">
                {canAdd && (
                    <div className="space-y-3 p-4 rounded-lg border border-white/10 bg-white/[0.02]">
                        <Textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder="Dodaj notatkę..."
                            className="min-h-[80px] bg-white/5 border-white/10"
                        />
                        <div className="flex items-center justify-between gap-3">
                            <select
                                value={category}
                                onChange={e => setCategory(e.target.value as AdminNote['category'])}
                                className="bg-card border border-white/10 rounded-md px-3 py-1.5 text-sm text-white"
                            >
                                {CATEGORIES.map(cat => (
                                    <option key={cat.value} value={cat.value}>
                                        {cat.label}
                                    </option>
                                ))}
                            </select>
                            <Button size="sm" onClick={handleSubmit} disabled={submitting || !content.trim()}>
                                <Plus className="h-4 w-4 mr-1" />
                                {submitting ? 'Dodaję...' : 'Dodaj notatkę'}
                            </Button>
                        </div>
                    </div>
                )}

                {sortedNotes.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-6">
                        Brak notatek
                    </p>
                )}

                <div className="space-y-3">
                    {sortedNotes.map((note, idx) => {
                        const cfg = CATEGORY_CONFIG[note.category] || CATEGORY_CONFIG.other
                        return (
                            <div
                                key={`${note.created_at}-${idx}`}
                                className="p-3 rounded-lg border border-white/10 bg-white/[0.02] space-y-2"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <User className="h-3.5 w-3.5" />
                                        <span className="font-medium text-white/80">{note.author_name}</span>
                                        <span>·</span>
                                        <span>{formatDate(note.created_at)}</span>
                                    </div>
                                    <Badge variant="outline" className={`text-[10px] ${cfg.color}`}>
                                        {cfg.label}
                                    </Badge>
                                </div>
                                <p className="text-sm text-white/90 whitespace-pre-wrap">{note.content}</p>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}
