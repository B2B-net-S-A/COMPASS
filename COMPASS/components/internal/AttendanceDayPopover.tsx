'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import type { AttendanceLocation, AttendanceRecord, AttendanceStatus } from '@/lib/actions/internal-attendance'

interface Props {
    date: string
    existing: AttendanceRecord | null
    defaultLocation: AttendanceLocation
    blockedByLeave: boolean
    onClose: () => void
    onSave: (status: AttendanceStatus, location: AttendanceLocation | null, note: string) => void
    onClear: () => void
}

const STATUS_OPTIONS: ReadonlyArray<{ value: AttendanceStatus; label: string }> = [
    { value: 'active', label: 'Pracuję' },
    { value: 'vacation', label: 'Urlop wypoczynkowy' },
    { value: 'parental_leave', label: 'Opieka rodzicielska' },
    { value: 'unpaid_leave', label: 'Urlop bezpłatny' },
    { value: 'business_trip', label: 'Delegacja' },
    { value: 'other', label: 'Inne' },
]

export function AttendanceDayPopover({
    date,
    existing,
    defaultLocation,
    blockedByLeave,
    onClose,
    onSave,
    onClear,
}: Props) {
    const [status, setStatus] = useState<AttendanceStatus>(existing?.status ?? 'active')
    const [location, setLocation] = useState<AttendanceLocation>(
        (existing?.location as AttendanceLocation | null) ?? defaultLocation,
    )
    const [note, setNote] = useState<string>(existing?.note ?? '')

    const heading = format(parseISO(date), 'EEEE, d LLLL yyyy', { locale: pl })

    if (blockedByLeave) {
        return (
            <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="capitalize">{heading}</DialogTitle>
                        <DialogDescription>
                            Ten dzień wynika z zaakceptowanego wniosku urlopowego. Aby go zmienić, anuluj
                            wniosek w sekcji <strong>Moje urlopy</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>Zamknij</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        )
    }

    return (
        <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="capitalize">{heading}</DialogTitle>
                    <DialogDescription>
                        {existing
                            ? 'Edytuj status dla tego dnia.'
                            : 'Nadpisz domyślny status dla tego dnia.'}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="att_status">Status</Label>
                        <select
                            id="att_status"
                            value={status}
                            onChange={(e) => setStatus(e.target.value as AttendanceStatus)}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            {STATUS_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                    {o.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {status === 'active' && (
                        <div className="space-y-1.5">
                            <Label htmlFor="att_location">Lokalizacja</Label>
                            <select
                                id="att_location"
                                value={location}
                                onChange={(e) => setLocation(e.target.value as AttendanceLocation)}
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            >
                                <option value="onsite">W biurze</option>
                                <option value="remote">Zdalnie</option>
                            </select>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label htmlFor="att_note">Notatka (opcjonalna)</Label>
                        <Textarea
                            id="att_note"
                            rows={2}
                            maxLength={300}
                            placeholder="np. wyjątkowo z biura klienta…"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-2 sm:justify-between">
                    {existing ? (
                        <Button
                            variant="ghost"
                            onClick={onClear}
                            className="text-muted-foreground hover:text-destructive"
                        >
                            Wyczyść (powrót do domyślnego)
                        </Button>
                    ) : (
                        <span />
                    )}
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={onClose}>Anuluj</Button>
                        <Button
                            onClick={() => onSave(status, status === 'active' ? location : null, note)}
                        >
                            Zapisz
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
