'use client'

import { useState, useTransition } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getMaterialDownloadUrl } from '@/lib/actions/support-materials'

interface DownloadItem {
    id: string
    title: string
    description?: string | null
    file_path: string
    file_name: string
    file_size: number
    mime_type: string
}

interface Props {
    items: DownloadItem[]
    emptyText?: string
}

export function DownloadList({ items, emptyText }: Props) {
    const [error, setError] = useState<string | null>(null)
    const [pendingId, setPendingId] = useState<string | null>(null)
    const [, startTransition] = useTransition()

    const download = (item: DownloadItem) => {
        setError(null)
        setPendingId(item.id)
        startTransition(async () => {
            const res = await getMaterialDownloadUrl(item.file_path)
            setPendingId(null)
            if (!res.success) { setError(res.error); return }
            // Otwórz w nowej karcie. Supabase Storage zwraca Content-Disposition
            // z oryginalną nazwą pliku, więc browser pobierze pod właściwą nazwą.
            window.open(res.data, '_blank', 'noopener,noreferrer')
        })
    }

    if (items.length === 0) {
        if (!emptyText) return null
        return <p className="text-xs text-muted-foreground">{emptyText}</p>
    }

    return (
        <div className="space-y-2">
            {error && <div className="text-xs text-red-400">{error}</div>}
            {items.map((it) => (
                <div key={it.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-white/5 border border-white/10 hover:border-primary/30 transition-colors">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        <FileText className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{it.title}</div>
                            {it.description && (
                                <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{it.description}</div>
                            )}
                            <div className="text-[10px] text-muted-foreground mt-1">
                                {it.file_name} · {(it.file_size / 1024).toFixed(0)} KB
                            </div>
                        </div>
                    </div>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => download(it)}
                        disabled={pendingId === it.id}
                        className="gap-2 shrink-0"
                    >
                        {pendingId === it.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        Pobierz
                    </Button>
                </div>
            ))}
        </div>
    )
}
