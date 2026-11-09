'use client'

import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { listVideoChapters, saveVideoChapters } from '@/lib/actions/academy-video-chapters'
import { formatChapterTime, parseChapterTime } from '@/lib/academy/video-chapters'

interface Row { key: number; time: string; title: string }

let nextKey = 0
const row = (time = '', title = ''): Row => ({ key: nextKey++, time, title })

export function VideoChaptersEditor({ assetId, disabled = false }: { assetId: string; disabled?: boolean }) {
    const [rows, setRows] = useState<Row[]>([])
    const [loaded, setLoaded] = useState(false)
    const [available, setAvailable] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)

    useEffect(() => {
        let cancelled = false
        listVideoChapters(assetId).then(result => {
            if (cancelled) return
            if (result?.success) {
                setAvailable(result.data.available)
                setRows(result.data.chapters.map(chapter => row(formatChapterTime(chapter.position_seconds), chapter.title)))
            } else {
                setMessage({ error: true, text: result?.error ?? 'Nie udało się wczytać rozdziałów.' })
            }
            setLoaded(true)
        }).catch(() => { if (!cancelled) { setMessage({ error: true, text: 'Nie udało się wczytać rozdziałów.' }); setLoaded(true) } })
        return () => { cancelled = true }
    }, [assetId])

    async function save() {
        setMessage(null)
        const chapters: { position_seconds: number; title: string }[] = []
        for (const item of rows) {
            const position = parseChapterTime(item.time)
            if (position === null) { setMessage({ error: true, text: `Popraw czas „${item.time || 'pusty'}”. Użyj zapisu mm:ss albo g:mm:ss.` }); return }
            if (!item.title.trim()) { setMessage({ error: true, text: `Podaj tytuł rozdziału przy ${item.time}.` }); return }
            chapters.push({ position_seconds: position, title: item.title.trim() })
        }
        if (new Set(chapters.map(chapter => chapter.position_seconds)).size !== chapters.length) { setMessage({ error: true, text: 'Dwa rozdziały mają ten sam czas. Zmień jeden z nich.' }); return }
        setSaving(true)
        try {
            const result = await saveVideoChapters(assetId, chapters)
            setMessage(result?.success ? { error: false, text: 'Zapisano rozdziały.' } : { error: true, text: result?.error ?? 'Nie udało się zapisać rozdziałów.' })
        } catch {
            setMessage({ error: true, text: 'Połączenie zostało przerwane. Spróbuj ponownie.' })
        } finally {
            setSaving(false)
        }
    }

    if (!loaded) return null
    if (!available) return <p className="text-xs text-muted-foreground">Rozdziały będą dostępne po zastosowaniu migracji bazy.</p>
    return <div className="space-y-2 rounded-lg border border-border p-3">
        <p className="text-xs font-medium">Rozdziały nagrania</p>
        {rows.map(item => <div key={item.key} className="flex items-center gap-2">
            <Input aria-label="Czas rozdziału" placeholder="mm:ss" value={item.time} disabled={disabled} onChange={event => setRows(current => current.map(entry => entry.key === item.key ? { ...entry, time: event.target.value } : entry))} className="h-9 w-24" />
            <Input aria-label="Tytuł rozdziału" placeholder="Tytuł" maxLength={120} value={item.title} disabled={disabled} onChange={event => setRows(current => current.map(entry => entry.key === item.key ? { ...entry, title: event.target.value } : entry))} className="h-9 min-w-0 flex-1" />
            <Button type="button" variant="ghost" size="icon" aria-label="Usuń rozdział" disabled={disabled} onClick={() => setRows(current => current.filter(entry => entry.key !== item.key))}><Trash2 className="size-4" aria-hidden="true" /></Button>
        </div>)}
        <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setRows(current => [...current, row()])}><Plus className="size-4" aria-hidden="true" />Dodaj rozdział</Button>
            <Button type="button" size="sm" disabled={disabled || saving} onClick={() => { void save() }}>Zapisz rozdziały</Button>
            {message && <span role={message.error ? 'alert' : 'status'} className={`text-xs ${message.error ? 'text-destructive' : 'text-muted-foreground'}`}>{message.text}</span>}
        </div>
    </div>
}
