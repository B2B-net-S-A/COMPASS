import { z } from 'zod'

const calendarEventSchema = z.object({
    id: z.uuid(), title: z.string().min(1).max(200), courseTitle: z.string().max(500),
    startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }), revision: z.number().int().positive(),
    status: z.enum(['scheduled', 'cancelled']), joinUrl: z.url().nullable(),
})
export type AcademyCalendarEvent = z.infer<typeof calendarEventSchema>

function escapeText(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
}
function timestamp(value: string): string { return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z') }
function fold(line: string): string {
    const parts: string[] = []
    let current = ''
    let bytes = 0
    for (const char of line) {
        const length = new TextEncoder().encode(char).length
        if (bytes + length > 75) { parts.push(current); current = ' '; bytes = 1 }
        current += char
        bytes += length
    }
    return [...parts, current].join('\r\n')
}

/** An explicitly downloaded calendar file; importing again updates the same UID. It sends no invitations. */
export function createAcademyCalendarFile(value: AcademyCalendarEvent): string {
    const event = calendarEventSchema.parse(value)
    if (Date.parse(event.endsAt) <= Date.parse(event.startsAt)) throw new Error('Invalid calendar interval')
    const lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Compass//Academy//PL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        'BEGIN:VEVENT', `UID:${event.id}@academy.compass.dynaminds.pl`, `SEQUENCE:${event.revision}`,
        `DTSTAMP:${timestamp(event.updatedAt)}`, `LAST-MODIFIED:${timestamp(event.updatedAt)}`,
        `DTSTART:${timestamp(event.startsAt)}`, `DTEND:${timestamp(event.endsAt)}`,
        `SUMMARY:${escapeText(event.title)}`, `DESCRIPTION:${escapeText(event.courseTitle)}`,
        `STATUS:${event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`, 'TRANSP:OPAQUE',
    ]
    // Defend RFC line boundaries even though the DB already enforces the Teams allowlist.
    if (event.joinUrl && event.status !== 'cancelled') {
        const url = new URL(event.joinUrl)
        if (url.protocol !== 'https:' || /[\r\n]/.test(event.joinUrl)) throw new Error('Invalid calendar URL')
        lines.push(`URL:${event.joinUrl}`)
    }
    return [...lines, 'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n'
}
