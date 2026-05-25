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

// Phase 29 / Attendance STRICT: pracownik samodzielnie wpisuje TYLKO swoją
// lokalizację w dniach gdy pracuje (W biurze / Zdalnie). Każda nieobecność
// (urlop, L4, opieka, delegacja, szkolenie) musi mieć dokument źródłowy
// (leave_request, ewentualnie inny rejestr) — nie pozwalamy obejść procesu approval
// przez \"ręczny\" wpis w attendance. Pozostałe statusy w AttendanceStatus typie
// zostają — trafiają do attendance_records przez sync z leave_requests
// (syncAttendanceFromLeave), nie przez ten dialog.

export function AttendanceDayPopover({
    date,
    existing,
    defaultLocation,
    blockedByLeave,
    onClose,
    onSave,
    onClear,
}: Props) {
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
                        Oznacz gdzie pracujesz. Jeśli nie pracujesz w tym dniu — złóż wniosek
                        urlopowy w zakładce <strong>Urlopy</strong>.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
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
                        <Button onClick={() => onSave('active', location, note)}>Zapisz</Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
