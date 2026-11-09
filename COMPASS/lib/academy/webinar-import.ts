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
export type WebinarExceptionKind = 'missing_email' | 'invalid_row' | 'waitlisted_in_teams' | 'conflicting_names' | 'ambiguous_summary'
    | 'not_on_list' | 'outside_window' | 'cancelled_on_list' | 'resigned' | 'on_waitlist'
export interface WebinarRowException {
    kind: WebinarExceptionKind
    rowNumber: number
    email: string | null
    fullName: string | null
    message: string
    intervals?: Array<{ start: string; end: string }>
    reportedSeconds?: number
}
export interface WebinarImportReport { rows: WebinarRow[]; exceptions: WebinarRowException[] }
export interface WebinarImportPreview {
    /** Null when every row went to exceptions, so there is nothing to approve. */
    id: string | null
    kind: WebinarImportKind
    rows: WebinarImportPreviewRow[]
    expiresAt: string | null
    exceptions?: WebinarRowException[]
    excludedCount?: number
    exceptionsAvailable?: boolean
}
export interface WebinarStoredException {
    id: string; sessionId: string | null; kind: WebinarExceptionKind; rowNumber: number
    email: string | null; fullName: string | null; detail: string; connections: number
    status: 'open' | 'ignored' | 'assigned'; note: string | null; resolvedAt: string | null
}
export interface WebinarExcludedEmail { email: string; note: string | null }
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
/** One bad row never stops the file. File-level problems (no headers, wrong report, too big) still throw. */
export function parseWebinarReport(text: string, kind: WebinarImportKind, dateOrder: 'dmy' | 'mdy' = 'dmy'): WebinarImportReport {
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
    const exceptions: WebinarRowException[] = []
    // A person with one bad row is held back whole: partial intervals would under-report them.
    const heldBack = new Set<string>()
    // Reconnects of one guest without an address are shown together; a person decides what they mean.
    const withoutEmail = new Map<string, WebinarRowException>()
    function hold(email: string, exception: WebinarRowException) {
        rows.delete(email); heldBack.add(email); exceptions.push(exception)
        if (exceptions.length > 1000) throw new Error('Plik ma ponad 1000 wierszy do wyjaśnienia. Sprawdź, czy to właściwy raport.')
    }
    function interval(row: string[]) {
        const start = teamsTimestamp(row[join] ?? '', dateOrder); const end = teamsTimestamp(row[leave] ?? '', dateOrder)
        if (Date.parse(end) <= Date.parse(start)) throw new Error('czas opuszczenia musi następować po dołączeniu.')
        return { start, end }
    }
    for (let i = index + 1; i < cells.length; i++) {
        const row = cells[i]
        const rowNumber = i + 1
        // Teams includes an optional third section with participant activities.
        if (row.length === 1 && /^[0-9]+\./.test(row[0])) break
        if (headerColumn(row, emailHeaders) >= 0) continue
        if (statusIndex >= 0 && /^(cancelled|canceled|anulowan[ay]|odrzucon[ay])$/i.test(row[statusIndex] ?? '')) continue
        const email = normalizeWebinarEmail(row[emailIndex] ?? '')
        const rawName = (nameIndex >= 0 ? row[nameIndex] : [row[firstName], row[lastName]].filter(Boolean).join(' '))?.trim().slice(0, 200) || ''
        const validEmail = emailPattern.test(email) && email.length <= 254
        if (kind === 'registrations' && statusIndex >= 0 && /waitlist|pending|oczekuj|rezerw/i.test(row[statusIndex] ?? '')) {
            exceptions.push({ kind: 'waitlisted_in_teams', rowNumber, email: validEmail ? email : null, fullName: rawName || null, message: `Wiersz ${rowNumber}: zapis jest oczekujący lub na rezerwie w Teams. Importuj potwierdzone rejestracje; nie zamienimy rezerwy w potwierdzone miejsce.` })
            continue
        }
        if (!validEmail) {
            const message = `Wiersz ${rowNumber}: brak poprawnego emaila. Nazwa uczestnika nie wystarcza do dopasowania.`
            const reported: { interval?: { start: string; end: string }; seconds?: number } = {}
            if (kind === 'attendance') {
                try { reported.interval = interval(row); if (summary) reported.seconds = teamsDurationSeconds(row[duration] ?? '') } catch { reported.interval = undefined }
            }
            const previous = rawName ? withoutEmail.get(key(rawName)) : undefined
            if (previous && reported.interval && !summary) { previous.intervals = [...(previous.intervals ?? []), reported.interval]; continue }
            const exception: WebinarRowException = { kind: 'missing_email', rowNumber, email: null, fullName: rawName || null, message, ...(reported.interval ? { intervals: [reported.interval] } : {}), ...(reported.seconds !== undefined ? { reportedSeconds: reported.seconds } : {}) }
            if (rawName) withoutEmail.set(key(rawName), exception)
            exceptions.push(exception)
            continue
        }
        if (heldBack.has(email)) continue
        const fullName = rawName || email
        const previous = rows.get(email)
        if (kind === 'registrations' && previous && previous.fullName !== fullName) {
            hold(email, { kind: 'conflicting_names', rowNumber, email, fullName, message: `Wiersz ${rowNumber}: ten sam email ma różne nazwy uczestników. Wyjaśnij współdzielony adres przed importem.` })
            continue
        }
        const current: WebinarRow = previous ?? { email, fullName, ...(kind === 'attendance' ? { intervals: [], evidence: summary ? 'summary' as const : 'intervals' as const } : {}) }
        if (kind === 'attendance') {
            try {
                const { start, end } = interval(row)
                if (summary) {
                    const reportedSeconds = teamsDurationSeconds(row[duration] ?? '')
                    if (reportedSeconds > Math.floor((Date.parse(end) - Date.parse(start)) / 1000)) throw new Error('czas obecności przekracza przedział połączeń.')
                    if (current.intervals!.length && (current.intervals![0].start !== start || current.intervals![0].end !== end || current.reportedSeconds !== reportedSeconds)) {
                        hold(email, { kind: 'ambiguous_summary', rowNumber, email, fullName, message: 'Wiele różnych podsumowań dla tej samej osoby. Użyj szczegółowej sekcji In-meeting activities, aby bezpiecznie zsumować połączenia.' })
                        continue
                    }
                    current.intervals = [{ start, end }]; current.reportedSeconds = reportedSeconds
                } else current.intervals!.push({ start, end })
            } catch (cause) {
                const detail = cause instanceof Error ? cause.message : 'nieprawidłowy wiersz.'
                hold(email, { kind: 'invalid_row', rowNumber, email, fullName, message: `Wiersz ${rowNumber}: ${detail}` })
                continue
            }
        }
        rows.set(email, current)
        if (rows.size > 500 || (current.intervals?.length ?? 0) > 100) throw new Error('Import obsługuje do 500 osób i 100 przedziałów na osobę.')
    }
    if (!rows.size && !exceptions.length) throw new Error('Plik nie zawiera uczestników.')
    return { rows: [...rows.values()], exceptions }
}
/** All-or-nothing variant: used until the exceptions migration is applied. */
export function parseWebinarCsv(text: string, kind: WebinarImportKind, dateOrder: 'dmy' | 'mdy' = 'dmy'): WebinarRow[] {
    const { rows, exceptions } = parseWebinarReport(text, kind, dateOrder)
    if (exceptions.length) throw new Error(exceptions[0].message)
    return rows
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
