import { describe, expect, it } from 'vitest'
import { createAcademyCalendarFile, type AcademyCalendarEvent } from '../calendar'

const event: AcademyCalendarEvent = {
    id:'11111111-1111-4111-8111-111111111111',title:'Szkolenie, online; Teams',courseTitle:'Praktyczny kurs',
    startsAt:'2026-10-25T02:00:00+02:00',endsAt:'2026-10-25T02:00:00+01:00',
    updatedAt:'2026-09-22T12:00:00Z',revision:3,status:'scheduled',joinUrl:'https://teams.microsoft.com/meet/123',
}
describe('Academy calendar export', () => {
    it('uses stable UID and UTC across the duplicated autumn hour', () => {
        const calendar=createAcademyCalendarFile(event)
        expect(calendar).toContain('DTSTART:20261025T000000Z\r\nDTEND:20261025T010000Z')
        expect(calendar).toContain('SEQUENCE:3')
        expect(calendar).toContain(`UID:${event.id}@academy.compass.dynaminds.pl`)
        expect(calendar).toContain('SUMMARY:Szkolenie\\, online\\; Teams')
        expect(calendar).not.toContain('ATTENDEE')
    })
    it('escapes newlines and folds Unicode by octets without splitting a codepoint', () => {
        const calendar=createAcademyCalendarFile({...event,title:'Zażółć '.repeat(20)+'\r\nATTENDEE:someone'})
        expect(calendar).not.toContain('\r\nATTENDEE:')
        for (const line of calendar.split('\r\n')) expect(Buffer.byteLength(line,'utf8')).toBeLessThanOrEqual(75)
        expect(calendar).not.toContain('�')
    })
    it('cancels the existing event without exposing its join link', () => {
        const calendar=createAcademyCalendarFile({...event,status:'cancelled'})
        expect(calendar).toContain('STATUS:CANCELLED')
        expect(calendar).not.toContain('URL:')
    })
})
