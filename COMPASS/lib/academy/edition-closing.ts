import type { AcademyRunDTO, AcademyRunParticipantDTO } from '@/lib/types/academy-sessions'
import type { AcademyRunMaterial } from '@/lib/types/academy-materials'
import type { WebinarRosterRow } from './webinar-import'
import type { RunPeopleSummary } from './run-people'

export type ClosingStepState = 'done' | 'todo' | 'waiting' | 'off'

export interface ClosingStep {
    key: 'list' | 'time' | 'attendance' | 'materials' | 'messages'
    title: string
    state: ClosingStepState
    stateLabel: string
    detail: string
    note?: string
    actionLabel?: string
    actionHref?: string
}

export interface ClosingInput {
    run: Pick<AcademyRunDTO, 'id' | 'sessions'>
    summary: RunPeopleSummary
    participants: AcademyRunParticipantDTO[]
    roster: WebinarRosterRow[]
    exceptions: { available: boolean; open: number }
    materials: AcademyRunMaterial[] | null
    attendancePercent: number
}

export interface ClosingCounts { present: number; insufficient: number; noReport: number; total: number }

/** A person counts as present only with a positive result on every session that has one. */
export function closingAttendanceCounts(participants: AcademyRunParticipantDTO[], roster: WebinarRosterRow[]): ClosingCounts {
    const statuses: string[][] = participants.filter(person => person.status === 'confirmed').map(person => person.attendance.map(item => item.status))
    const registered = new Set(participants.map(person => person.userId))
    for (const row of roster) {
        if (row.status === 'confirmed' && !(row.userId && registered.has(row.userId))) statuses.push(row.attendance.map(item => item.status))
    }
    const present = statuses.filter(items => items.length > 0 && items.every(status => status === 'present')).length
    const noReport = statuses.filter(items => items.length === 0).length
    return { present, noReport, insufficient: statuses.length - present - noReport, total: statuses.length }
}

function clock(value: string, timeZone: string): string {
    return new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(new Date(value))
}

function timeStep(input: ClosingInput, href: string): ClosingStep {
    const sessions = input.run.sessions.filter(session => session.status === 'scheduled')
    const confirmed = sessions.filter(session => session.attendanceWindowConfirmed && session.actualStartsAt && session.actualEndsAt)
    const base = { key: 'time' as const, title: 'Rzeczywisty czas spotkania', actionLabel: 'Potwierdź rzeczywisty czas spotkania', actionHref: href }
    if (sessions.length === 0) return { ...base, state: 'todo', stateLabel: 'Do zrobienia', detail: 'Ta edycja nie ma zaplanowanych spotkań.' }
    if (confirmed.length < sessions.length) return { ...base, state: 'todo', stateLabel: 'Do zrobienia', detail: `Potwierdzone spotkania: ${confirmed.length} z ${sessions.length}.`, note: 'Bez potwierdzonego czasu nie da się policzyć progu obecności.' }
    const first = confirmed[0]
    const minutes = Math.round((Date.parse(first.actualEndsAt!) - Date.parse(first.actualStartsAt!)) / 60000)
    return {
        ...base, state: 'done', stateLabel: 'Gotowe',
        detail: sessions.length === 1 ? `Plan ${clock(first.startsAt, first.timeZone)}–${clock(first.endsAt, first.timeZone)}, rzeczywiście ${clock(first.actualStartsAt!, first.timeZone)}–${clock(first.actualEndsAt!, first.timeZone)}, czyli ${minutes} min.` : `Potwierdzone wszystkie spotkania: ${sessions.length}.`,
        note: sessions.length === 1 ? `Próg obecności ${input.attendancePercent}%: co najmniej ${Math.ceil(minutes * input.attendancePercent / 100)} min.` : undefined,
    }
}

function attendanceStep(input: ClosingInput, counts: ClosingCounts, href: string): ClosingStep {
    const base = { key: 'attendance' as const, title: 'Raport frekwencji', actionLabel: 'Wczytaj raport frekwencji', actionHref: href }
    const detail = `Obecni ${counts.present}, za krótko ${counts.insufficient}, bez raportu ${counts.noReport}.`
    if (counts.present + counts.insufficient === 0) return { ...base, state: 'todo', stateLabel: 'Do zrobienia', detail: 'Raport frekwencji nie został jeszcze wczytany.' }
    if (input.exceptions.open > 0) return { ...base, state: 'todo', stateLabel: `Wyjątki: ${input.exceptions.open}`, detail, note: 'Rozstrzygnij wyjątki albo pomiń wiersze, które nie dotyczą szkolenia.' }
    return { ...base, state: 'done', stateLabel: 'Gotowe', detail, note: input.exceptions.available ? undefined : 'Wyjątki importu zaczną działać po zastosowaniu migracji.' }
}

function materialsStep(materials: ClosingInput['materials'], href: string): ClosingStep {
    const base = { key: 'materials' as const, title: 'Materiały po szkoleniu', actionLabel: 'Otwórz materiały', actionHref: href }
    if (materials === null) return { ...base, state: 'todo', stateLabel: 'Sprawdź', detail: 'Nie udało się wczytać materiałów tej edycji.' }
    const active = materials.filter(item => item.review_status !== 'withdrawn' && item.review_status !== 'rejected' && item.status !== 'rejected')
    if (active.length === 0) return { ...base, state: 'todo', stateLabel: 'Do zrobienia', detail: 'Nie dodano jeszcze materiałów tej edycji.' }
    const waiting = active.filter(item => item.review_status === 'pending_review').length
    if (waiting > 0) return { ...base, state: 'waiting', stateLabel: 'Czeka na akceptację', detail: `Czeka na akceptację: ${waiting} z ${active.length}.`, note: 'Materiał przyjmuje osoba niezależna od autora.' }
    return { ...base, state: 'done', stateLabel: 'Gotowe', detail: `Opublikowane materiały: ${active.length}.` }
}

/** Decides nothing by itself: every step reports what the source panels already recorded. */
export function editionClosingSteps(input: ClosingInput): ClosingStep[] {
    const editionHref = `/learning/edycje/${input.run.id}`
    const counts = closingAttendanceCounts(input.participants, input.roster)
    return [
        input.summary.total > 0
            ? { key: 'list', title: 'Ostatnia lista rejestracji', state: 'done', stateLabel: 'Gotowe', detail: `Na liście ${input.summary.total}, w tym bez konta ${input.summary.withoutAccount}.`, note: 'Wczytaj listę tuż przed frekwencją, żeby spóźnione rejestracje trafiły do dopasowania.', actionLabel: 'Wczytaj ostatnią listę', actionHref: `${editionHref}#import-webinaru` }
            : { key: 'list', title: 'Ostatnia lista rejestracji', state: 'todo', stateLabel: 'Do zrobienia', detail: 'Na liście tej edycji nie ma jeszcze nikogo.', actionLabel: 'Wczytaj listę', actionHref: `${editionHref}#import-webinaru` },
        timeStep(input, `${editionHref}#spotkania`),
        attendanceStep(input, counts, `${editionHref}#import-webinaru`),
        materialsStep(input.materials, `${editionHref}#materialy`),
        { key: 'messages', title: 'Wiadomości po szkoleniu', state: 'off', stateLabel: 'Wysyłka wyłączona', detail: `Adresaci: obecni ${counts.present}, za krótko ${counts.insufficient}, bez raportu ${counts.noReport}.`, note: 'Zatwierdzenie paczki będzie aktywne po włączeniu przełącznika wysyłki. Dziś nikt nie dostanie wiadomości.' },
    ]
}

export function completedSteps(steps: ClosingStep[]): number {
    return steps.filter(step => step.state === 'done').length
}
