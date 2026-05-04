'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, FileText, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createArticle, updateArticle } from '@/lib/actions/support-articles'
import type { SupportCategory, SupportArticle } from '@/lib/types/support'

interface ArticleEditorProps {
    categories: SupportCategory[]
    initial?: SupportArticle
}

export function ArticleEditor({ categories, initial }: ArticleEditorProps) {
    const router = useRouter()
    const [title, setTitle] = useState(initial?.title ?? '')
    const [excerpt, setExcerpt] = useState(initial?.excerpt ?? '')
    const [content, setContent] = useState(initial?.content_md ?? '')
    const [categoryId, setCategoryId] = useState(initial?.category_id ?? categories[0]?.id ?? '')
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const isPublished = !!initial?.published_at

    const handleSave = (publish: boolean) => {
        setError(null)
        startTransition(async () => {
            if (initial) {
                const res = await updateArticle(initial.id, {
                    title,
                    excerpt: excerpt || undefined,
                    content_md: content,
                    category_id: categoryId,
                    publish,
                })
                if (!res.success) { setError(res.error); return }
                router.refresh()
                router.push('/admin/support/kb')
            } else {
                const res = await createArticle({
                    title,
                    excerpt: excerpt || undefined,
                    content_md: content,
                    category_id: categoryId,
                    slug: '',
                    publish,
                })
                if (!res.success) { setError(res.error); return }
                router.push(`/admin/support/kb/${res.data.slug}/edit`)
            }
        })
    }

    const canSave = !isPending && title.trim().length >= 3 && content.trim().length >= 10 && categoryId

    return (
        <div className="space-y-4">
            {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>}

            <Card className="bg-white/5 border-white/10">
                <CardContent className="p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Kategoria *</label>
                            <select
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                disabled={isPending}
                                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm focus:outline-none focus:border-primary/50"
                            >
                                {categories.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name_pl}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                            <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-md text-sm">
                                {isPublished ? (
                                    <span className="inline-flex items-center gap-1 text-emerald-400">
                                        <CheckCircle2 className="w-4 h-4" /> Opublikowany
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-amber-400">
                                        <FileText className="w-4 h-4" /> Wersja robocza
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Tytuł *</label>
                        <Input
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="np. Jak złożyć wniosek o Multisport"
                            disabled={isPending}
                            required
                            minLength={3}
                        />
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Krótki opis (excerpt)</label>
                        <Textarea
                            value={excerpt}
                            onChange={(e) => setExcerpt(e.target.value)}
                            rows={2}
                            placeholder="1-2 zdania widoczne na liście artykułów"
                            disabled={isPending}
                        />
                    </div>

                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Treść (markdown) *</label>
                        <Textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={20}
                            placeholder="# Tytuł sekcji&#10;&#10;Treść artykułu..."
                            disabled={isPending}
                            required
                            minLength={10}
                            className="font-mono text-sm"
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => handleSave(false)} disabled={!canSave} className="gap-2">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Zapisz draft
                </Button>
                <Button onClick={() => handleSave(true)} disabled={!canSave} className="gap-2">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {isPublished ? 'Zaktualizuj publikację' : 'Opublikuj'}
                </Button>
            </div>
        </div>
    )
}
