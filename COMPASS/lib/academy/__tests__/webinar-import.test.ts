import { describe, expect, it } from 'vitest'
import { attendancePreviewSeconds, parseWebinarCsv, teamsTimestamp, webinarMailMergeCsv } from '../webinar-import'
describe('external webinar CSV', () => {
 it('imports 96 registrants and deduplicates normalized email', () => {
  const input = 'First name;Last name;Email\r\n' + Array.from({ length: 96 }, (_, i) => `Jan;Test ${i};User${i}@example.test`).join('\r\n') + '\r\nJan;Test 0; USER0@example.test'
  expect(parseWebinarCsv(input, 'registrations')).toHaveLength(96)
 })
 it('supports BOM/tab Teams sections and merges reconnect intervals', () => {
  const text = '\uFEFF1. Summary\r\nMeeting title\tCybersecurity\r\n2. Participants\r\nName\tJoin Time\tLeave Time\tEmail\r\n"Doe, Jan"\t7/10/2026 18:00:00\t7/10/2026 19:00:00\tJan@example.test\r\nJan\t7/10/2026 18:30:00\t7/10/2026 20:00:00\tJAN@example.test\r\n3. In-Meeting Activities'
  const rows = parseWebinarCsv(text, 'attendance'); expect(rows).toHaveLength(1); expect(rows[0].intervals).toHaveLength(2)
  expect(attendancePreviewSeconds(rows[0], { start: '2026-10-07T16:00:00Z', end: '2026-10-07T19:00:00Z' })).toBe(7200)
 })
 it('uses native summary duration, never counts reconnect gaps as attended', () => {
  const text = 'Name,First Join,Last Leave,In-Meeting Duration,Email\nJan,7/10/2026 18:00:00,7/10/2026 21:00:00,10m,jan@example.test'
  const row = parseWebinarCsv(text, 'attendance')[0]
  expect(row.evidence).toBe('summary'); expect(row.reportedSeconds).toBe(600)
  expect(attendancePreviewSeconds(row, { start: '2026-10-07T16:00:00Z', end: '2026-10-07T19:00:00Z' })).toBe(600)
  expect(() => attendancePreviewSeconds(row, { start: '2026-10-07T16:30:00Z', end: '2026-10-07T19:00:00Z' })).toThrow('wykracza')
 })
 it('prefers detailed Teams activity section over first/last summary', () => {
  const text = '2. Participants\nName,First Join,Last Leave,In-Meeting Duration,Email\nJan,7/10/2026 18:00:00,7/10/2026 21:00:00,10m,jan@example.test\n3. In-Meeting Activities\nName,Join Time,Leave Time,Duration,Email\nJan,7/10/2026 18:00:00,7/10/2026 18:05:00,5m,jan@example.test\nJan,7/10/2026 20:55:00,7/10/2026 21:00:00,5m,jan@example.test'
  const row = parseWebinarCsv(text, 'attendance')[0]; expect(row.evidence).toBe('intervals')
  expect(attendancePreviewSeconds(row, { start: '2026-10-07T16:00:00Z', end: '2026-10-07T19:00:00Z' })).toBe(600)
 })
 it('handles Polish names and Teams headers with ł', () => {
  expect(parseWebinarCsv('Imię;Nazwisko;Adres e-mail\nŁukasz;Żółć;lukasz@example.test', 'registrations')[0].fullName).toBe('Łukasz Żółć')
  const row = parseWebinarCsv('Nazwa;Godzina pierwszego dołączenia;Godzina ostatniego opuszczenia;Łączny czas trwania;Adres e-mail\nŁukasz;7.10.2026 18:00:00;7.10.2026 21:00:00;10 min.;lukasz@example.test', 'attendance')[0]
  expect(row.reportedSeconds).toBe(600)
 })
 it('detects delimiters outside quoted names and accepts quoted BOM header', () => {
  expect(parseWebinarCsv('\uFEFF"Name","Email"\n"Kowalski; Jan\tAdam",jan@example.test', 'registrations')[0].fullName).toBe('Kowalski; Jan\tAdam')
 })
 it('requires email and interval proof', () => {
  expect(() => parseWebinarCsv('Name,Email\nJan,', 'registrations')).toThrow('email')
  expect(() => parseWebinarCsv('Name,Email,Registration status\nJan,jan@example.test,Waitlisted', 'registrations')).toThrow('rezerwie')
  expect(() => parseWebinarCsv('Name,Email\nJan,shared@example.test\nAnna,shared@example.test', 'registrations')).toThrow('współdzielony')
  expect(() => parseWebinarCsv('Name,Email,Duration\nJan,jan@example.test,3h', 'attendance')).toThrow('nagłówków')
  expect(() => attendancePreviewSeconds({ email: 'a@example.test', fullName: 'A', intervals: [{ start: '2026-10-09T00:00:00Z', end: '2026-10-09T01:00:00Z' }] }, { start: '2026-10-07T16:00:00Z', end: '2026-10-07T19:00:00Z' })).toThrow('okna')
 })
 it('makes date order explicit and rejects ambiguous DST', () => {
  expect(teamsTimestamp('10/7/2026 6:00:00 PM', 'mdy')).toBe('2026-10-07T16:00:00.000Z')
  expect(() => teamsTimestamp('25/10/2026 02:30:00', 'dmy')).toThrow('niejednoznaczna')
  expect(() => teamsTimestamp('31/2/2026 18:00:00', 'dmy')).toThrow('Nieprawidłowa')
 })
 it('exports BOM and prevents spreadsheet formulas', () => {
  const csv = webinarMailMergeCsv([{ email: 'jan@example.test', fullName: '=HYPERLINK("evil")', courseTitle: 'Bezpieczeństwo', runTitle: 'Październik' }])
  expect(csv.startsWith('\uFEFF')).toBe(true); expect(csv).toContain('"\'=HYPERLINK(""evil"")"'); expect(csv).toContain('Bezpieczeństwo')
 })
})
