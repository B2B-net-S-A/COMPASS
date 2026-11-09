import type { ClosingStep } from './edition-closing'

// Kokpit organizatora (V13). Składa to, co już zapisały inne panele, bez własnego modelu.

export const INVITATION_KIND = 'academy.run_invitation'
export const REMINDER_KIND = 'academy.run_reminder'

export type CockpitStepState = 'done' | 'current' | 'upcoming' | 'attention'
export interface CockpitOutboxRow { kind: string; status: string; dedupe_key: string | null }
export interface CockpitStep { key: string; label: string; title: string; dateIso: string; state: CockpitStepState; status: string; detail: string }
export interface CockpitIssue { key: string; title: string; detail: string; href?: string }
export interface CockpitInput {
    runId: string
    sessionStart: string | null
    sessionEnd: string | null
    capacity: number
    confirmed: number
    waitlisted: number
    outbox: CockpitOutboxRow[] | null
    questions: { approved: number; draft: number } | null
    closing: ClosingStep[]
    now: number
}

const DAY = 86_400_000
const HELD_LIKE = new Set(['held', 'approved'])

function stageOf(row: CockpitOutboxRow): string | null {
    const match = /^run_reminder:[^:]+:(t21|t7|t1h|t1):/.exec(row.dedupe_key ?? '')
    return match ? match[1] : null
}

function messageStatus(rows: CockpitOutboxRow[] | null): string {
    if (rows === null) return 'Kolejka niedostępna'
    if (rows.length === 0) return 'Brak wiadomości w kolejce'
    const held = rows.filter(row => HELD_LIKE.has(row.status)).length
    const sent = rows.filter(row => row.status === 'sent').length
    const expired = rows.filter(row => row.status === 'expired').length
    if (held) return `Wstrzymane: ${held}`
    if (sent) return `Wysłane: ${sent}`
    if (expired) return `Wygasłe: ${expired}`
    return `Wiadomości: ${rows.length}`
}

const closingStep = (input: CockpitInput, key: ClosingStep['key']) => input.closing.find(step => step.key === key)

/** Oś edycji od T-21 do T+30. Stan bierze się z dat i z zapisanych danych, a nie z deklaracji. */
export function editionCockpitSteps(input: CockpitInput): CockpitStep[] {
    if (!input.sessionStart) return []
    const start = Date.parse(input.sessionStart)
    const end = Date.parse(input.sessionEnd ?? input.sessionStart)
    const at = (base: number, days: number) => new Date(base + days * DAY).toISOString()
    const timing = (iso: string, done: boolean): CockpitStepState => done ? 'done' : Date.parse(iso) <= input.now ? 'attention' : 'upcoming'
    const messages = (kinds: (row: CockpitOutboxRow) => boolean) => input.outbox === null ? null : input.outbox.filter(kinds)
    const messageStep = (key: string, label: string, title: string, dateIso: string, rows: CockpitOutboxRow[] | null): CockpitStep => ({
        key, label, title, dateIso, status: messageStatus(rows), detail: rows?.length ? 'Nic nie wyszło bez zatwierdzenia paczki.' : 'Wiadomości powstaną przed tym terminem.',
        state: rows?.some(row => row.status === 'sent' || row.status === 'sent_test') ? 'done' : rows?.some(row => HELD_LIKE.has(row.status)) ? 'current' : 'upcoming',
    })
    const attendance = closingStep(input, 'attendance')
    const materials = closingStep(input, 'materials')
    const pool = input.questions
    const liveEnded = end <= input.now
    return [
        messageStep('t21', 'T-21', 'Zaproszenia', at(start, -21), messages(row => row.kind === INVITATION_KIND || stageOf(row) === 't21')),
        messageStep('t7', 'T-7', 'Przypomnienie', at(start, -7), messages(row => stageOf(row) === 't7')),
        messageStep('t1', 'T-1', 'Przypomnienie', at(start, -1), messages(row => stageOf(row) === 't1' || stageOf(row) === 't1h')),
        { key: 't0', label: 'T0', title: 'Live w Teams', dateIso: new Date(start).toISOString(), state: liveEnded ? 'done' : start <= input.now ? 'current' : 'upcoming', status: liveEnded ? 'Zakończone' : 'Zaplanowane', detail: `Zapisani: ${input.confirmed}.` },
        { key: 't1p', label: 'T+1', title: 'Frekwencja', dateIso: at(end, 1), state: timing(at(end, 1), attendance?.state === 'done'), status: attendance?.stateLabel ?? 'Po live', detail: attendance?.detail ?? 'Odczyt raportu obecności po spotkaniu.' },
        { key: 't2p', label: 'T+2', title: 'Materiały i test', dateIso: at(end, 2), state: timing(at(end, 2), materials?.state === 'done'), status: materials?.stateLabel ?? 'Po live', detail: [materials?.detail, pool ? `Pytania zatwierdzone: ${pool.approved}.` : null].filter(Boolean).join(' ') },
        { key: 't7p', label: 'T+7', title: 'Raport', dateIso: at(end, 7), state: attendance?.state === 'done' && Date.parse(at(end, 7)) <= input.now ? 'done' : 'upcoming', status: 'Po live', detail: 'Frekwencja, wyniki testu, ankieta.' },
        { key: 't30p', label: 'T+30', title: 'Kurs z modułów od prowadzącego', dateIso: at(end, 30), state: 'upcoming', status: 'Po live', detail: 'Prowadzący nagrywa osobne moduły, publikacja w katalogu.' },
    ]
}

/** Tylko sprawy, które organizator może załatwić teraz. */
export function editionCockpitIssues(input: CockpitInput, steps: CockpitStep[]): CockpitIssue[] {
    const editionHref = `/learning/edycje/${input.runId}`
    const issues: CockpitIssue[] = []
    const overdue = new Set(steps.filter(step => step.state === 'attention').map(step => step.key))
    if (overdue.has('t1p')) issues.push({ key: 'attendance', title: 'Frekwencja nie została domknięta', detail: closingStep(input, 'attendance')?.detail ?? '', href: `${editionHref}/zamkniecie` })
    if (overdue.has('t2p')) issues.push({ key: 'materials', title: 'Materiały po szkoleniu czekają', detail: closingStep(input, 'materials')?.detail ?? '', href: `${editionHref}#materialy` })
    if (input.questions && input.questions.draft > 0) issues.push({ key: 'questions', title: `Pytania czekają na zatwierdzenie: ${input.questions.draft}`, detail: `Zatwierdzonych w puli: ${input.questions.approved}.` })
    const expired = input.outbox?.filter(row => row.status === 'expired').length ?? 0
    if (expired > 0) issues.push({ key: 'expired', title: `Wiadomości wygasły bez wysyłki: ${expired}`, detail: 'Termin zdarzenia minął, a paczka nie została zatwierdzona.' })
    if (input.outbox === null) issues.push({ key: 'outbox', title: 'Stan kolejki wiadomości jest niedostępny', detail: 'Kolejka czeka na migrację albo odczyt się nie udał.' })
    if (input.capacity > 0 && input.confirmed >= input.capacity && input.waitlisted === 0 && input.now < Date.parse(input.sessionStart ?? '')) issues.push({ key: 'full', title: 'Limit miejsc zajęty', detail: `Zapisani: ${input.confirmed} z ${input.capacity}.` })
    return issues
}
