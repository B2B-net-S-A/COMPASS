// „Ludzie w NEXUSIE” — miesiąc bez timesheetu w archiwum (moduł `time` w NEXUSIE).
// Archiwum nie zakłada nowych szkiców, więc zamiast pustego edytora mówimy wprost,
// że tego miesiąca w Compassie nie ma, i prowadzimy do listy zapisanych miesięcy.

import Link from 'next/link'

export function TimesheetArchiveEmpty({ year, month }: { year: number; month: number }) {
    const label = `${String(month).padStart(2, '0')}.${year}`
    return (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            <p>W archiwum Compassa nie ma timesheetu za {label}.</p>
            <Link href="/internal/timesheet/archiwum" className="mt-2 inline-block font-medium text-primary hover:underline">
                Zobacz zapisane miesiące
            </Link>
        </div>
    )
}
