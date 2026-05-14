'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Send, Pin } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createNewsPost, updateNewsPost, deleteNewsPost } from '@/lib/actions/news'
import type { NewsPost } from '@/lib/types/news'

interface PostComposerProps {
    initial?: NewsPost
}

const ROLES = ['consultant', 'admin'] as const

export function PostComposer({ initial }: PostComposerProps) {
    const router = useRouter()
    const [title, setTitle] = useState(initial?.title ?? '')
    const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '')
    const [body, setBody] = useState(initial?.body_md ?? '')
    const [cover, setCover] = useState(initial?.cover_url ?? '')
    const [pinned, setPinned] = useState(initial?.pinned ?? false)
    const [audience, setAudience] = useState<string[]>(initial?.audience_role ?? [])
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const isPublished = !!initial?.published_at
    const canSave = !isPending && title.trim().length >= 3 && body.trim().length >= 10

    const toggleAudience = (role: string) => {
        setAudience((prev) => prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role])
    }

    const handleSave = (publish: boolean) => {
        setError(null)
        startTransition(async () => {
            if (initial) {
                const res = await updateNewsPost(initial.id, {
                    title, excerpt: excerpt || undefined, body_md: body, cover_url: cover || null, pinned,
                    audience_role: audience.length > 0 ? audience : null,
                    publish,
                })
                if (!res.success) { setError(res.error); return }
                router.push('/admin/news')
                router.refresh()
            } else {
                const res = await createNewsPost({
                    title, excerpt: excerpt || undefined, body_md: body, cover_url: cover || undefined, pinned,
                    audience_role: audience.length > 0 ? audience : undefined,
                    publish,
                })
                if (!res.success) { setError(res.error); return }
                router.push(`/admin/news/${res.data.slug}/edit`)
            }
        })
    }

    const handleDelete = () => {
        if (!initial) return
        if (!confirm('Skasować ten post na stałe?')) return
        startTransition(async () => {
            const res = await deleteNewsPost(initial.id)
            if (!res.success) { setError(res.error); return }
            router.push('/admin/news')
            router.refresh()
        })
    }

    return (
        <div className="space-y-4">
            {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>}

            <Card className="bg-white/5 border-white/10">
                <CardContent className="p-5 space-y-4">
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Tytuł *</label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={isPending} required minLength={3} />
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Krótki opis (excerpt)</label>
                        <Textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} disabled={isPending} />
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Cover image URL</label>
                        <Input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://..." disabled={isPending} />
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Treść (markdown) *</label>
                        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={15} disabled={isPending} required minLength={10} className="font-mono text-sm" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} disabled={isPending} className="accent-amber-500" />
                            <Pin className="w-4 h-4 text-amber-400" />
                            Przypnij na górze feeda
                        </label>

                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Grupa docelowa (puste = wszyscy)</label>
                            <div className="flex flex-wrap gap-2">
                                {ROLES.map((r) => (
                                    <button
                                        key={r}
                                        type="button"
                                        onClick={() => toggleAudience(r)}
                                        disabled={isPending}
                                        className={`px-3 py-1 rounded-md text-xs border transition-colors ${
                                            audience.includes(r)
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-white/5 text-muted-foreground border-white/10 hover:border-primary/40'
                                        }`}
                                    >
                                        {r}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-between items-center gap-2">
                {initial && (
                    <Button variant="outline" onClick={handleDelete} disabled={isPending} className="text-red-400 border-red-500/30 hover:bg-red-500/10">
                        Usuń
                    </Button>
                )}
                <div className="flex gap-2 ml-auto">
                    <Button variant="outline" onClick={() => handleSave(false)} disabled={!canSave} className="gap-2">
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isPublished ? 'Zapisz (cofnij publikację)' : 'Zapisz draft'}
                    </Button>
                    <Button onClick={() => handleSave(true)} disabled={!canSave} className="gap-2">
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        {isPublished ? 'Zaktualizuj publikację' : 'Opublikuj + powiadom'}
                    </Button>
                </div>
            </div>
        </div>
    )
}
