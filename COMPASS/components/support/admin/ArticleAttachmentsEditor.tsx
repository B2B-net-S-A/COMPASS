'use client'

import { useState, useTransition } from 'react'
import { FileUp, Loader2, Paperclip, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    deleteArticleAttachment,
    uploadArticleAttachment,
} from '@/lib/actions/support-materials'
import type { ArticleAttachment } from '@/lib/types/support'

interface Props {
    articleId: string
    initialAttachments: ArticleAttachment[]
    canEdit: boolean
}

export function ArticleAttachmentsEditor({ articleId, initialAttachments, canEdit }: Props) {
    const [attachments, setAttachments] = useState<ArticleAttachment[]>(initialAttachments)
    const [title, setTitle] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const upload = () => {
        if (!file) { setError('Wybierz plik.'); return }
        if (!title.trim()) { setError('Podaj tytuł załącznika.'); return }
        setError(null)
        startTransition(async () => {
            const res = await uploadArticleAttachment(articleId, file, title.trim())
            if (!res.success) { setError(res.error); return }
            setAttachments((prev) => [...prev, res.data])
            setTitle('')
            setFile(null)
            const input = document.getElementById(`article-attach-${articleId}`) as HTMLInputElement | null
            if (input) input.value = ''
        })
    }

    const remove = (id: string) => {
        if (!confirm('Usunąć załącznik?')) return
        setError(null)
        startTransition(async () => {
            const res = await deleteArticleAttachment(id)
            if (!res.success) { setError(res.error); return }
            setAttachments((prev) => prev.filter((a) => a.id !== id))
        })
    }

    if (!canEdit && attachments.length === 0) return null

    return (
        <div className="space-y-3 p-4 rounded-lg bg-white/5 border border-white/10">
            <h3 className="text-sm font-semibold flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-primary" /> Załączniki ({attachments.length})
            </h3>

            {error && <div className="text-xs text-red-400">{error}</div>}

            {attachments.length > 0 ? (
                <div className="space-y-1">
                    {attachments.map((a) => (
                        <div key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-md bg-white/5 border border-white/10">
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{a.title}</div>
                                <div className="text-[10px] text-muted-foreground">
                                    {a.file_name} · {(a.file_size / 1024).toFixed(0)} KB
                                </div>
                            </div>
                            {canEdit && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => remove(a.id)}
                                    disabled={isPending}
                                    className="text-red-400 hover:text-red-300"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    ))}
                </div>
            ) : (
                canEdit && <p className="text-xs text-muted-foreground">Brak załączników. Dodaj poniżej.</p>
            )}

            {canEdit && (
                <div className="space-y-2 p-3 rounded-md bg-white/5 border border-dashed border-white/10">
                    <Input
                        placeholder="Tytuł załącznika"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        disabled={isPending}
                    />
                    <input
                        id={`article-attach-${articleId}`}
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.gif,.txt,.csv"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        disabled={isPending}
                        className="block w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                    />
                    <Button size="sm" onClick={upload} disabled={isPending || !file || !title.trim()} className="gap-2">
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                        Wgraj
                    </Button>
                </div>
            )}
        </div>
    )
}
