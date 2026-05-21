'use client'

// Phase 28 — Placementy: Excel import dialog (upload → preview/review → commit).
// Distinct DL/recruiter names are mapped once to profiles; commit is blocked until all map.

import { useState } from 'react'
import { Loader2, Upload, FileSpreadsheet, AlertTriangle } from 'lucide-react'
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { toast } from '@/lib/toast'
import { previewPlacementImport, commitPlacementImport } from '@/lib/actions/placements'
import type { PlacementImportPreview } from '@/lib/types/placement'

interface Props {
    onImported: () => void
}

const diffLabel: Record<string, string> = { new: 'nowy', updated: 'zmiana', unchanged: 'bez zmian' }

function pln(n: number): string {
    return `${Number(n).toLocaleString('pl-PL')} zł`
}

export function PlacementImportDialog({ onImported }: Props) {
    const [open, setOpen] = useState(false)
    const [file, setFile] = useState<File | null>(null)
    const [analyzing, setAnalyzing] = useState(false)
    const [committing, setCommitting] = useState(false)
    const [preview, setPreview] = useState<PlacementImportPreview | null>(null)
    const [personMap, setPersonMap] = useState<Record<string, string>>({})
    const [cancelSelected, setCancelSelected] = useState<Set<string>>(new Set())

    function reset() {
        setFile(null)
        setPreview(null)
        setPersonMap({})
        setCancelSelected(new Set())
    }

    async function analyze() {
        if (!file) return
        setAnalyzing(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            const result = await previewPlacementImport(fd)
            setPreview(result)
            const init: Record<string, string> = {}
            for (const p of result.people) {
                if (p.suggestedProfileId) init[p.rawNameNorm] = p.suggestedProfileId
            }
            setPersonMap(init)
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Nie udało się przeanalizować pliku.')
        } finally {
            setAnalyzing(false)
        }
    }

    const allMapped = preview ? preview.people.every((p) => personMap[p.rawNameNorm]) : false

    async function commit() {
        if (!file || !preview || !allMapped) return
        setCommitting(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            fd.append('personMap', JSON.stringify(personMap))
            if (cancelSelected.size > 0) {
                fd.append('cancelDisappeared', JSON.stringify(Array.from(cancelSelected)))
            }
            const res = await commitPlacementImport(fd)
            toast.success(
                `Zaimportowano: ${res.created} nowych, ${res.updated} zaktualizowanych, ${res.ticketsCreated} ticketów TCM${res.cancelled ? `, ${res.cancelled} anulowanych` : ''}.`,
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

    return (
        <Dialog
            open={open}
            onOpenChange={(o) => {
                setOpen(o)
                if (!o) reset()
            }}
        >
            <Button onClick={() => setOpen(true)} className="gap-2">
                <Upload className="h-4 w-4" /> Importuj z Excela
            </Button>

            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileSpreadsheet className="h-5 w-5" /> Import placementów
                    </DialogTitle>
                    <DialogDescription>
                        Wgraj plik .xlsx z nowymi placementami. Daty muszą zawierać rok (np. 2026-04-01).
                        Premie DL (10%) i rekrutera (próg wg marży) policzą się automatycznie.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex items-end gap-3">
                        <div className="flex-1">
                            <Label htmlFor="placement-file">Plik .xlsx</Label>
                            <Input
                                id="placement-file"
                                type="file"
                                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                onChange={(e) => {
                                    setFile(e.target.files?.[0] ?? null)
                                    setPreview(null)
                                }}
                            />
                        </div>
                        <Button onClick={analyze} disabled={!file || analyzing} variant="secondary" className="gap-2">
                            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Analizuj
                        </Button>
                    </div>

                    {preview && (
                        <div className="space-y-5">
                            {preview.warnings.length > 0 && (
                                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                                    <div className="mb-1 flex items-center gap-2 font-medium">
                                        <AlertTriangle className="h-4 w-4" /> Uwagi ({preview.warnings.length})
                                    </div>
                                    <ul className="list-inside list-disc space-y-0.5">
                                        {preview.warnings.slice(0, 8).map((w, i) => (
                                            <li key={i}>{w}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* People mapping */}
                            <div>
                                <h3 className="mb-2 text-sm font-semibold">
                                    Przypisz osoby do profili ({preview.people.filter((p) => personMap[p.rawNameNorm]).length}/{preview.people.length})
                                </h3>
                                <div className="space-y-2">
                                    {preview.people.map((p) => (
                                        <div key={p.rawNameNorm} className="flex items-center gap-3">
                                            <span className="w-48 shrink-0 text-sm">{p.rawName}</span>
                                            <select
                                                className="flex h-9 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm"
                                                value={personMap[p.rawNameNorm] ?? ''}
                                                onChange={(e) =>
                                                    setPersonMap((m) => ({ ...m, [p.rawNameNorm]: e.target.value }))
                                                }
                                            >
                                                <option value="">— wybierz profil —</option>
                                                {preview.candidates.map((c) => (
                                                    <option key={c.id} value={c.id}>
                                                        {c.fullName} ({c.role})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Rows preview */}
                            <div>
                                <h3 className="mb-2 text-sm font-semibold">Wiersze ({preview.rows.length})</h3>
                                <div className="overflow-x-auto rounded-md border">
                                    <table className="w-full text-sm">
                                        <thead className="bg-muted/50">
                                            <tr>
                                                <th className="p-2 text-left">Konsultant</th>
                                                <th className="p-2 text-left">Klient</th>
                                                <th className="p-2 text-left">Start</th>
                                                <th className="p-2 text-right">Premia DL</th>
                                                <th className="p-2 text-right">Premia rekr.</th>
                                                <th className="p-2 text-left">Stan</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {preview.rows.map((r, i) => (
                                                <tr key={i} className="border-t">
                                                    <td className="p-2">{r.consultantName}</td>
                                                    <td className="p-2">{r.clientName}</td>
                                                    <td className="p-2">{r.startDate}</td>
                                                    <td className="p-2 text-right">{pln(r.dlBonusAmount)}</td>
                                                    <td className="p-2 text-right">
                                                        {pln(r.recruiterBonusAmount)} <span className="text-muted-foreground">(t{r.recruiterTier})</span>
                                                    </td>
                                                    <td className="p-2">
                                                        <Badge variant={r.diff === 'new' ? 'default' : 'secondary'}>
                                                            {diffLabel[r.diff]}
                                                        </Badge>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Disappeared */}
                            {preview.disappeared.length > 0 && (
                                <div>
                                    <h3 className="mb-2 text-sm font-semibold text-orange-700">
                                        Brak w pliku ({preview.disappeared.length}) — zaznacz, by anulować
                                    </h3>
                                    <div className="space-y-1">
                                        {preview.disappeared.map((d) => (
                                            <label key={d.id} className="flex items-center gap-2 text-sm">
                                                <input
                                                    type="checkbox"
                                                    checked={cancelSelected.has(d.id)}
                                                    onChange={(e) =>
                                                        setCancelSelected((prev) => {
                                                            const next = new Set(prev)
                                                            if (e.target.checked) next.add(d.id)
                                                            else next.delete(d.id)
                                                            return next
                                                        })
                                                    }
                                                />
                                                {d.consultantName} @ {d.clientName} (start {d.startDate})
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => setOpen(false)} disabled={committing}>
                        Anuluj
                    </Button>
                    <Button onClick={commit} disabled={!preview || !allMapped || committing} className="gap-2">
                        {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                        Zapisz import
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
