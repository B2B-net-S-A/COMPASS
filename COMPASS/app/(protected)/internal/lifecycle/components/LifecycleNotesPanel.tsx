'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Flag, Loader2, MessageSquare, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { addLifecycleNote, deleteLifecycleNote, listLifecycleNotes, type LifecycleNote } from '@/lib/actions/lifecycle'

const CATEGORY_LABEL: Record<LifecycleNote['category'], string> = {
    general: 'Ogólne',
    onboarding: 'Onboarding',
    exit: 'Exit',
    flag: 'Flaga',
}

const CATEGORY_COLOR: Record<LifecycleNote['category'], string> = {
    general: 'bg-muted text-muted-foreground',
    onboarding: 'bg-cyan-500/20 text-cyan-300',
    exit: 'bg-amber-500/20 text-amber-300',
    flag: 'bg-red-500/20 text-red-300',
}

interface Props {
    userId: string
    defaultCategory?: LifecycleNote['category']
}

export function LifecycleNotesPanel({ userId, defaultCategory = 'general' }: Props) {
    const router = useRouter()
    const [notes, setNotes] = useState<LifecycleNote[]>([])
    const [loading, setLoading] = useState(true)
    const [showAdd, setShowAdd] = useState(false)
    const [content, setContent] = useState('')
    const [category, setCategory] = useState<LifecycleNote['category']>(defaultCategory)
    const [isPrivate, setIsPrivate] = useState(true)
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        let cancelled = false
        listLifecycleNotes(userId)
            .then((data) => { if (!cancelled) setNotes(data) })
            .catch(() => undefined)
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [userId])

    function handleAdd() {
        if (!content.trim()) {
            toast.error('Treść notatki jest wymagana.')
            return
        }
        startTransition(async () => {
            try {
                await addLifecycleNote({ userId, category, content: content.trim(), isPrivate })
                toastSuccess('Notatka dodana.')
                setContent('')
                setShowAdd(false)
                const updated = await listLifecycleNotes(userId)
                setNotes(updated)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd dodawania notatki.')
            }
        })
    }

    function handleDelete(noteId: string) {
        if (!confirm('Usunąć notatkę?')) return
        startTransition(async () => {
            try {
                await deleteLifecycleNote(noteId)
                toastSuccess('Notatka usunięta.')
                setNotes(notes.filter((n) => n.id !== noteId))
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd usuwania.')
            }
        })
    }

    return (
        <div className="rounded-lg border bg-card overflow-hidden">
            <div className="bg-muted/50 p-3 border-b flex items-center justify-between">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Notatki TCM ({notes.length})
                </h2>
                <Button size="sm" onClick={() => setShowAdd((v) => !v)} disabled={isPending}>
                    <Plus className="h-3 w-3 mr-1" />
                    Dodaj
                </Button>
            </div>

            {showAdd && (
                <div className="p-4 border-b bg-muted/20 space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                        {(['general', 'onboarding', 'exit', 'flag'] as const).map((c) => (
                            <button
                                key={c}
                                type="button"
                                onClick={() => setCategory(c)}
                                className={`px-2 py-1 rounded border ${
                                    category === c ? `${CATEGORY_COLOR[c]} border-current` : 'border-muted text-muted-foreground'
                                }`}
                            >
                                {c === 'flag' && <Flag className="h-3 w-3 inline mr-1" />}
                                {CATEGORY_LABEL[c]}
                            </button>
                        ))}
                    </div>
                    <textarea
                        className="w-full rounded border bg-background px-3 py-2 text-sm"
                        rows={3}
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Treść notatki..."
                    />
                    <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                            <input
                                type="checkbox"
                                checked={isPrivate}
                                onChange={(e) => setIsPrivate(e.target.checked)}
                                className="h-3 w-3"
                            />
                            Prywatna (widoczna tylko dla TCM/admin)
                        </label>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => { setShowAdd(false); setContent('') }} disabled={isPending}>
                                Anuluj
                            </Button>
                            <Button size="sm" onClick={handleAdd} disabled={isPending}>
                                {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Zapisz'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {loading ? (
                <p className="p-6 text-sm text-muted-foreground text-center">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Ładowanie...
                </p>
            ) : notes.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground text-center">
                    Brak notatek. Dodaj pierwszą obserwację o tym pracowniku.
                </p>
            ) : (
                <ul className="divide-y">
                    {notes.map((n) => (
                        <li key={n.id} className="p-4">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-xs px-2 py-0.5 rounded ${CATEGORY_COLOR[n.category]}`}>
                                            {n.category === 'flag' && <Flag className="h-3 w-3 inline mr-1" />}
                                            {CATEGORY_LABEL[n.category]}
                                        </span>
                                        {n.is_private && (
                                            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
                                                Prywatna
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm whitespace-pre-wrap">{n.content}</p>
                                    <p className="text-xs text-muted-foreground mt-2">
                                        {n.author_name ?? 'TCM'} • {new Date(n.created_at).toLocaleString('pl-PL')}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleDelete(n.id)}
                                    disabled={isPending}
                                    className="text-red-400 hover:bg-red-400/10"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
