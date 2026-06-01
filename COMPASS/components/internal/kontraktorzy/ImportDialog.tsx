'use client'

// Phase 33 — Kontraktorzy: generic Excel import dialog for the 3 TCM sheets.
// Upload → preview (counts + person match + sample) → commit (idempotent).

import { useState } from 'react'
import { Loader2, Upload, FileSpreadsheet, AlertTriangle } from 'lucide-react'
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/lib/toast'
import {
    previewRozmowyImport, commitRozmowyImport,
    previewWejsciaImport, commitWejsciaImport,
    previewZejsciaImport, commitZejsciaImport,
    type ImportPreview, type ImportResult,
} from '@/lib/actions/contractor-import'

type Kind = 'rozmowy' | 'wejscia' | 'zejscia'

const META: Record<Kind, { title: string; desc: string; preview: (fd: FormData) => Promise<ImportPreview>; commit: (fd: FormData) => Promise<ImportResult> }> = {
    rozmowy: {
        title: 'Import rozmów z kontraktorami',
        desc: 'Plik „Rozmowy z kontraktorami.xlsx". Status czytany z koloru komórki (żółty/zielony/niebieski/czerwony).',
        preview: previewRozmowyImport, commit: commitRozmowyImport,
    },
    wejscia: {
        title: 'Import wejść do klientów',
        desc: 'Arkusz „Wejścia do klientów". Archiwum analityczne (nie nalicza premii — to robi moduł Placementy).',
        preview: previewWejsciaImport, commit: commitWejsciaImport,
    },
    zejscia: {
        title: 'Import zejść od klientów',
        desc: 'Arkusz „Zejścia od klientów". Zapisuje powód, przepięcie, replacement i marżę-stratę.',
        preview: previewZejsciaImport, commit: commitZejsciaImport,
    },
}

export function ImportDialog({ kind, onImported }: { kind: Kind; onImported: () => void }) {
    const meta = META[kind]
    const [open, setOpen] = useState(false)
    const [file, setFile] = useState<File | null>(null)
    const [analyzing, setAnalyzing] = useState(false)
    const [committing, setCommitting] = useState(false)
    const [preview, setPreview] = useState<ImportPreview | null>(null)

    function reset() {
        setFile(null)
        setPreview(null)
    }

    async function analyze() {
        if (!file) return
        setAnalyzing(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            setPreview(await meta.preview(fd))
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się przeanalizować pliku.')
        } finally {
            setAnalyzing(false)
        }
    }

    async function commit() {
        if (!file || !preview) return
        setCommitting(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            const res = await meta.commit(fd)
            toast.success(
                `Zaimportowano ${res.inserted} wierszy (${res.contractorsCreated} nowych kontraktorów${res.skippedDuplicates ? `, ${res.skippedDuplicates} duplikatów pominięto` : ''}).`,
            )
            setOpen(false)
            reset()
            onImported()
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się zapisać importu.')
        } finally {
            setCommitting(false)
        }
    }

    const sampleKeys = preview?.sample[0] ? Object.keys(preview.sample[0]) : []

    return (
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
            <Button onClick={() => setOpen(true)} variant="secondary" className="gap-2">
                <Upload className="h-4 w-4" /> {meta.title.replace('Import ', 'Importuj ')}
            </Button>

            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5" /> {meta.title}
                    </DialogTitle>
                    <DialogDescription>{meta.desc}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex items-end gap-3">
                        <div className="flex-1">
                            <Label htmlFor="import-file">Plik .xlsx</Label>
                            <Input
                                id="import-file"
                                type="file"
                                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null) }}
                            />
                        </div>
                        <Button onClick={analyze} disabled={!file || analyzing} variant="secondary" className="gap-2">
                            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Analizuj
                        </Button>
                    </div>

                    {preview && (
                        <div className="space-y-4">
                            <div className="rounded-md border bg-muted/30 p-3 text-sm">
                                Wczytano: <span className="font-semibold text-emerald-700">{preview.validRows}</span> wierszy
                                {' '}/ przeskanowano: {preview.scannedRows}
                                {preview.skippedBlankRows > 0 && <> · pominięto pustych: {preview.skippedBlankRows}</>}
                                <div className="mt-1 text-muted-foreground">
                                    Kontraktorzy w pliku: <strong>{preview.distinctContractors}</strong> ·
                                    {' '}dopasowano osób do profili: {preview.peopleMatched}/{preview.peopleMatched + preview.peopleUnmatched}
                                    {preview.peopleUnmatched > 0 && ' (reszta zapisana jako tekst — bez profilu)'}
                                </div>
                            </div>

                            {preview.warnings.length > 0 && (
                                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                                    <div className="mb-2 flex items-center gap-2 font-medium">
                                        <AlertTriangle className="h-4 w-4" /> Uwagi ({preview.warnings.length})
                                    </div>
                                    <ul className="max-h-48 list-inside list-disc space-y-0.5 overflow-y-auto pr-2">
                                        {preview.warnings.slice(0, 50).map((w, i) => <li key={i}>{w}</li>)}
                                    </ul>
                                </div>
                            )}

                            {preview.sample.length > 0 && (
                                <div>
                                    <h3 className="mb-2 text-sm font-semibold">Podgląd (pierwsze {preview.sample.length})</h3>
                                    <div className="overflow-x-auto rounded-md border">
                                        <table className="w-full text-sm">
                                            <thead className="bg-muted/50">
                                                <tr>{sampleKeys.map((k) => <th key={k} className="p-2 text-left capitalize">{k}</th>)}</tr>
                                            </thead>
                                            <tbody>
                                                {preview.sample.map((row, i) => (
                                                    <tr key={i} className="border-t">
                                                        {sampleKeys.map((k) => <td key={k} className="p-2">{row[k] ?? '—'}</td>)}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={committing}>Anuluj</Button>
                    <Button onClick={commit} disabled={!preview || preview.validRows === 0 || committing} className="gap-2">
                        {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Zapisz import
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
