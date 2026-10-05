import { unionAttendanceSeconds } from './attendance'

export interface WebinarRow {
    email: string
    fullName: string
    intervals?: Array<{ start: string; end: string }>
    evidence?: 'intervals' | 'summary'
    reportedSeconds?: number
}
export type WebinarImportKind = 'registrations' | 'attendance'
export interface WebinarImportPreviewRow extends WebinarRow {
    candidates: Array<{ userId: string; fullName: string | null; contractualEmail: string | null }>
    match: 'matched' | 'unmatched' | 'ambiguous'
    userId: string | null
    existing: boolean
    attendedSeconds?: number
}
export interface WebinarImportPreview {
    id: string
    kind: WebinarImportKind
    rows: WebinarImportPreviewRow[]
    expiresAt: string
}
export interface WebinarRosterRow {
    id: string; email: string; fullName: string; userId: string | null
    contractualEmail: string | null; status: 'confirmed' | 'cancelled'; match: string
    registrationStatus: string | null
    attendance: Array<{ sessionId: string; attendedSeconds: number; status: string }>
}
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export function normalizeWebinarEmail(value: string) { return value.trim().toLowerCase() }
function key(value: string) {
    return value.replace(/^\uFEFF/, '').replace(/[łŁ]/g, 'l').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]/g, '')
}
/** CSV/TSV parser supporting quoted delimiters, doubled quotes, CRLF and Teams section headers. */
export function parseWebinarCells(text: string): string[][] {
    if (text.length > 2_000_000 || text.includes('\0')) throw new Error('Plik jest za duży lub ma nieprawidłowe kodowanie.')
    text = text.replace(/^\uFEFF/, '')
    const firstLines = text.split(/\r?\n/).slice(0, 30)
    const candidateLines = firstLines.filter(line => /email|e.mail/i.test(line))
    function separators(line: string, delimiter: string) {
        let count = 0; let quoted = false
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') { if (quoted && line[i + 1] === '"') i++; else quoted = !quoted }
            else if (!quoted && line[i] === delimiter) count++
        }
        return count
    }
    const delimiter = ['\t', ';', ','].map(value => ({ value, count: Math.max(0, ...(candidateLines.length ? candidateLines : firstLines).map(line => separators(line, value))) })).sort((a, b) => b.count - a.count)[0].value
    const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false
    for (let i = 0; i < text.length; i++) {
        const c = text[i]
        if (c === '"') {
            if (quoted && text[i + 1] === '"') { field += '"'; i++ }
            else if (quoted || !field) quoted = !quoted
            else throw new Error('Nieprawidłowy cudzysłów w CSV.')
        } else if (!quoted && (c === delimiter || c === '\n' || c === '\r')) {
            row.push(field.replace(/^\uFEFF/, '').trim()); field = ''
            if (c !== delimiter) { if (c === '\r' && text[i + 1] === '\n') i++; if (row.some(Boolean)) rows.push(row); row = [] }
        } else field += c
    }
    if (quoted) throw new Error('Niezamknięty cudzysłów w CSV.')
    row.push(field.trim()); if (row.some(Boolean)) rows.push(row)
    return rows
}
function headerColumn(headers: string[], aliases: string[]) { return headers.findIndex(h => aliases.includes(key(h))) }
const emailHeaders = ['email', 'emailaddress', 'adresemail', 'adresmail', 'emailuczestnika', 'participantemail', 'registeredemail']
/** Local Teams dates require an explicit date order; the UI shows it before preview. */
export function teamsTimestamp(value: string, dateOrder: 'dmy' | 'mdy') {
    const raw = value.trim()
    if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)) {
        const timestamp = Date.parse(raw)
        if (!Number.isFinite(timestamp)) throw new Error('Nieprawidłowa data obecności.')
        return new Date(timestamp).toISOString()
    }
    const match = raw.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i)
    if (!match) throw new Error('Daty raportu muszą być ISO z offsetem lub dd/mm/yyyy hh:mm (strefa Europe/Warsaw).')
    const a = Number(match[1]); const b = Number(match[2]); const day = dateOrder === 'dmy' ? a : b; const month = dateOrder === 'dmy' ? b : a
    const year = Number(match[3]) + (match[3].length === 2 ? 2000 : 0)
    let hour = Number(match[4]); const minute = Number(match[5]); const second = Number(match[6] ?? 0)
    if (match[7]) { if (hour < 1 || hour > 12) throw new Error('Nieprawidłowa godzina.'); hour = hour % 12 + (match[7].toUpperCase() === 'PM' ? 12 : 0) }
    const local = Date.UTC(year, month - 1, day, hour, minute, second)
    if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59 || new Date(local).getUTCDate() !== day) throw new Error('Nieprawidłowa data obecności.')
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    const candidates = [1, 2].map(offset => local - offset * 3600000).filter(timestamp => {
        const parts = Object.fromEntries(formatter.formatToParts(timestamp).map(p => [p.type, p.value]))
        return Number(parts.year) === year && Number(parts.month) === month && Number(parts.day) === day && Number(parts.hour) === hour && Number(parts.minute) === minute && Number(parts.second) === second
    })
    if (candidates.length !== 1) throw new Error('Godzina jest niejednoznaczna przy zmianie czasu; użyj ISO z offsetem.')
    return new Date(candidates[0]).toISOString()
}
export function teamsDurationSeconds(value: string): number {
    const raw = value.trim().toLowerCase().replace(/godz\.?|hours?|hrs?/g, 'h').replace(/min\.?|minutes?/g, 'm').replace(/sek\.?|seconds?|secs?/g, 's').replace(/\s+/g, '')
    const clock = raw.match(/^(\d{1,2}):(\d{2}):(\d{2})$/)
    if (clock) {
        if (Number(clock[2]) > 59 || Number(clock[3]) > 59) throw new Error('Nieprawidłowy czas trwania obecności.')
        return Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3])
    }
    const parts = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
    if (!parts || !raw) throw new Error('Czas trwania obecności musi mieć format 1h 20m 3s lub hh:mm:ss.')
    const seconds = Number(parts[1] ?? 0) * 3600 + Number(parts[2] ?? 0) * 60 + Number(parts[3] ?? 0)
    if (seconds > 86400) throw new Error('Czas obecności przekracza 24 godziny.')
    return seconds
}
export function parseWebinarCsv(text: string, kind: WebinarImportKind, dateOrder: 'dmy' | 'mdy' = 'dmy'): WebinarRow[] {
    const cells = parseWebinarCells(text)
    const detailJoinHeaders = ['jointime', 'join', 'joinat', 'czasdolaczenia', 'godzinadolaczenia']
    const summaryJoinHeaders = ['firstjoin', 'pierwszedolaczenie', 'godzinapierwszegodolaczenia']
    const detailedIndex = kind === 'attendance' ? cells.findIndex(row => headerColumn(row, emailHeaders) >= 0 && headerColumn(row, detailJoinHeaders) >= 0) : -1
    const index = detailedIndex >= 0 ? detailedIndex : cells.findIndex(row => headerColumn(row, emailHeaders) >= 0 && (kind !== 'attendance' || headerColumn(row, summaryJoinHeaders) >= 0))
    const summary = kind === 'attendance' && detailedIndex < 0
    if (index < 0) throw new Error(kind === 'attendance' ? 'Nie znaleziono nagłówków Email, First join i Last leave w raporcie Teams.' : 'Nie znaleziono kolumny Email w raporcie zapisów.')
    const headers = cells[index]; const emailIndex = headerColumn(headers, emailHeaders)
    const nameIndex = headerColumn(headers, ['name', 'fullname', 'participantname', 'imieinazwisko', 'nazwa'])
    const firstName = headerColumn(headers, ['firstname', 'imie']); const lastName = headerColumn(headers, ['lastname', 'nazwisko'])
    const join = headerColumn(headers, [...detailJoinHeaders, ...summaryJoinHeaders])
    const leave = headerColumn(headers, ['leavetime', 'leave', 'leaveat', 'lastleave', 'czasopuszczenia', 'godzinaopuszczenia', 'ostatnieopuszczenie', 'godzinaostatniegoopuszczenia'])
    const duration = headerColumn(headers, ['inmeetingduration', 'duration', 'czastrwania', 'czastrwaniapodczasspotkania', 'czastrwaniaspotkania', 'lacznyczastrwania'])
    if (summary && duration < 0) throw new Error('Podsumowanie Teams wymaga kolumny In-meeting duration. Czas pierwszego i ostatniego połączenia nie dowodzi ciągłej obecności.')
    const statusIndex = headerColumn(headers, ['registrationstatus', 'status', 'statusrejestracji'])
    if (kind === 'attendance' && leave < 0) throw new Error('Raport musi zawierać czas dołączenia i opuszczenia. Sam czas trwania nie dowodzi obecności w oknie szkolenia.')
    const rows = new Map<string, WebinarRow>()
    for (let i = index + 1; i < cells.length; i++) {
        const row = cells[i]
        // Teams includes an optional third section with participant activities.
        if (row.length === 1 && /^[0-9]+\./.test(row[0])) break
        if (headerColumn(row, emailHeaders) >= 0) continue
        if (statusIndex >= 0 && /^(cancelled|canceled|anulowan[ay]|odrzucon[ay])$/i.test(row[statusIndex] ?? '')) continue
        if (kind === 'registrations' && statusIndex >= 0 && /waitlist|pending|oczekuj|rezerw/i.test(row[statusIndex] ?? '')) throw new Error(`Wiersz ${i + 1}: zapis jest oczekujący lub na rezerwie w Teams. Importuj potwierdzone rejestracje; nie zamienimy rezerwy w potwierdzone miejsce.`)
        const email = normalizeWebinarEmail(row[emailIndex] ?? '')
        if (!emailPattern.test(email) || email.length > 254) throw new Error(`Wiersz ${i + 1}: brak poprawnego emaila. Nazwa uczestnika nie wystarcza do dopasowania.`)
        const fullName = (nameIndex >= 0 ? row[nameIndex] : [row[firstName], row[lastName]].filter(Boolean).join(' '))?.trim().slice(0, 200) || email
        const previous = rows.get(email)
        if (kind === 'registrations' && previous && previous.fullName !== fullName) throw new Error(`Wiersz ${i + 1}: ten sam email ma różne nazwy uczestników. Wyjaśnij współdzielony adres przed importem.`)
        const current = previous ?? { email, fullName, ...(kind === 'attendance' ? { intervals: [], evidence: summary ? 'summary' as const : 'intervals' as const } : {}) }
        if (kind === 'attendance') {
            const start = teamsTimestamp(row[join] ?? '', dateOrder); const end = teamsTimestamp(row[leave] ?? '', dateOrder)
            if (Date.parse(end) <= Date.parse(start)) throw new Error(`Wiersz ${i + 1}: czas opuszczenia musi następować po dołączeniu.`)
            if (summary) {
                const reportedSeconds = teamsDurationSeconds(row[duration] ?? '')
                if (reportedSeconds > Math.floor((Date.parse(end) - Date.parse(start)) / 1000)) throw new Error(`Wiersz ${i + 1}: czas obecności przekracza przedział połączeń.`)
                if (current.intervals!.length && (current.intervals![0].start !== start || current.intervals![0].end !== end || current.reportedSeconds !== reportedSeconds)) throw new Error('Wiele różnych podsumowań dla tej samej osoby. Użyj szczegółowej sekcji In-meeting activities, aby bezpiecznie zsumować połączenia.')
                current.intervals = [{ start, end }]; current.reportedSeconds = reportedSeconds
            } else current.intervals!.push({ start, end })
        }
        rows.set(email, current)
        if (rows.size > 500 || (current.intervals?.length ?? 0) > 100) throw new Error('Import obsługuje do 500 osób i 100 przedziałów na osobę.')
    }
    if (!rows.size) throw new Error('Plik nie zawiera uczestników.')
    return [...rows.values()]
}
export function attendancePreviewSeconds(row: WebinarRow, window: { start: string; end: string }) {
    if (!row.intervals?.length || !row.intervals.some(i => Date.parse(i.end) > Date.parse(window.start) && Date.parse(i.start) < Date.parse(window.end))) throw new Error('Raport obecności nie pokrywa okna tego spotkania.')
    if (row.evidence === 'summary') {
        if (row.intervals.length !== 1 || row.reportedSeconds === undefined || row.intervals.some(i => Date.parse(i.start) < Date.parse(window.start) || Date.parse(i.end) > Date.parse(window.end))) throw new Error('Podsumowanie Teams wykracza poza okno zajęć. Użyj szczegółowych przedziałów połączeń.')
        return Math.min(row.reportedSeconds, unionAttendanceSeconds(row.intervals, window))
    }
    return unionAttendanceSeconds(row.intervals, window)
}
function csvCell(value: unknown) {
    let text = String(value ?? '')
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
}
export function webinarMailMergeCsv(rows: Array<{ email: string; fullName: string; courseTitle: string; runTitle: string }>) {
    return '\uFEFF' + [['Email', 'ImieNazwisko', 'Szkolenie', 'Edycja'], ...rows.map(r => [r.email, r.fullName, r.courseTitle, r.runTitle])].map(row => row.map(csvCell).join(';')).join('\r\n') + '\r\n'
}
