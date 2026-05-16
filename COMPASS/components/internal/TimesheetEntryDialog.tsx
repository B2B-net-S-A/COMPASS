'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Sparkles } from 'lucide-react'
import Link from 'next/link'
import type { TimesheetEntryRow } from '@/lib/actions/internal-timesheet'
import {
    listMyTemplates,
    type TimesheetUserTemplate,
} from '@/lib/actions/internal-timesheet-templates'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    initial?: TimesheetEntryRow | null
    minDate: string
    maxDate: string
    saving: boolean
    /** H2.6: istniejące wpisy (do duplicate-warning gdy user dodaje na zajęty dzień). */
    existingEntries?: ReadonlyArray<Pick<TimesheetEntryRow, 'id' | 'work_date' | 'hours' | 'project'>>
    onSubmit: (values: { workDate: string; hours: number; project: string | null; description: string }) => void
}

export function TimesheetEntryDialog({
    open,
    onOpenChange,
    initial,
    minDate,
    maxDate,
    saving,
    existingEntries,
    onSubmit,
}: Props) {
    const [workDate, setWorkDate] = useState<string>(initial?.work_date ?? minDate)
    const [hours, setHours] = useState<string>(initial?.hours?.toString() ?? '8')
    const [project, setProject] = useState<string>(initial?.project ?? '')
    const [description, setDescription] = useState<string>(initial?.description ?? '')
    const [templates, setTemplates] = useState<TimesheetUserTemplate[]>([])
    const [templatesLoaded, setTemplatesLoaded] = useState(false)

    useEffect(() => {
        if (!open || templatesLoaded) return
        let cancelled = false
        listMyTemplates()
            .then((data) => {
                if (!cancelled) {
                    setTemplates(data)
                    setTemplatesLoaded(true)
                }
            })
            .catch(() => {
                if (!cancelled) setTemplatesLoaded(true)
            })
        return () => {
            cancelled = true
        }
    }, [open, templatesLoaded])

    function applyTemplate(t: TimesheetUserTemplate) {
        setDescription(t.description)
        if (t.project) setProject(t.project)
    }

    // H2.6: znajdź istniejące wpisy dla wybranego dnia (excluding bieżący przy edycji).
    const conflictingEntries = (existingEntries ?? []).filter(
        (e) => e.work_date === workDate && e.id !== initial?.id,
    )
    const hasConflict = conflictingEntries.length > 0
    const conflictingTotalHours = conflictingEntries.reduce((sum, e) => sum + e.hours, 0)

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        const h = Number(hours)
        if (!Number.isFinite(h) || h <= 0 || h > 24) {
            alert('Liczba godzin musi być w zakresie (0, 24].')
            return
        }
        if (!description.trim()) {
            alert('Opis jest wymagany.')
            return
        }
        // H2.6: confirm gdy user dodaje wpis na dzień który już ma wpisy.
        if (hasConflict) {
            const projectsList = conflictingEntries
                .map((e) => e.project ?? '(bez projektu)')
                .join(', ')
            const ok = window.confirm(
                `Ten dzień ma już ${conflictingEntries.length} ${
                    conflictingEntries.length === 1 ? 'wpis' : 'wpisy'
                } na łącznie ${conflictingTotalHours}h (${projectsList}).\n\nDodać kolejny wpis (${h}h)? Suma: ${conflictingTotalHours + h}h.`,
            )
            if (!ok) return
        }
        onSubmit({
            workDate,
            hours: h,
            project: project.trim() || null,
            description: description.trim(),
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md max-h-[95vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{initial ? 'Edytuj wpis' : 'Nowy wpis'}</DialogTitle>
                    <DialogDescription>
                        Logowane godziny przepracowane danego dnia.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="entry_date" className="text-sm">Data</Label>
                            <Input
                                id="entry_date"
                                type="date"
                                value={workDate}
                                min={minDate}
                                max={maxDate}
                                onChange={(e) => setWorkDate(e.target.value)}
                                required
                                className="min-h-[44px] text-base"
                            />
                            {hasConflict && (
                                <p className="text-[11px] text-amber-400 mt-1">
                                    ⚠ Ten dzień ma już {conflictingEntries.length}{' '}
                                    {conflictingEntries.length === 1 ? 'wpis' : 'wpisy'} ({conflictingTotalHours}h)
                                </p>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="entry_hours" className="text-sm">Godziny</Label>
                            <Input
                                id="entry_hours"
                                type="number"
                                step="0.25"
                                min="0.25"
                                max="24"
                                inputMode="decimal"
                                pattern="[0-9]*\.?[0-9]*"
                                value={hours}
                                onChange={(e) => setHours(e.target.value)}
                                required
                                className="min-h-[44px] text-base"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="entry_project" className="text-sm">Projekt (opcjonalny)</Label>
                        <Input
                            id="entry_project"
                            placeholder="np. Klient X / Onboarding"
                            value={project}
                            onChange={(e) => setProject(e.target.value)}
                            maxLength={100}
                            className="min-h-[44px] text-base"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                            <Label htmlFor="entry_desc" className="text-sm">Opis prac</Label>
                            {templates.length > 0 ? (
                                <select
                                    className="text-xs rounded-md border bg-background px-2 py-1"
                                    value=""
                                    onChange={(e) => {
                                        const tpl = templates.find((t) => t.id === e.target.value)
                                        if (tpl) applyTemplate(tpl)
                                        e.target.value = ''
                                    }}
                                >
                                    <option value="">Wstaw snippet ▾</option>
                                    {templates.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                templatesLoaded && (
                                    <Link
                                        href="/internal/timesheet/snippets"
                                        className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                                    >
                                        <Sparkles className="h-3 w-3" />
                                        Utwórz snippet
                                    </Link>
                                )
                            )}
                        </div>
                        <Textarea
                            id="entry_desc"
                            rows={3}
                            maxLength={500}
                            placeholder="Co dokładnie robiłeś tego dnia…"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            required
                            className="text-base"
                        />
                        {templates.length > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                                <Link href="/internal/timesheet/snippets" className="hover:underline">
                                    Zarządzaj snippetami
                                </Link>
                            </p>
                        )}
                    </div>

                    <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={saving}
                            className="w-full sm:w-auto min-h-[44px]"
                        >
                            Anuluj
                        </Button>
                        <Button type="submit" disabled={saving} className="w-full sm:w-auto min-h-[44px]">
                            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                            Zapisz
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
