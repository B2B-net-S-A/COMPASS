import { createHash } from 'node:crypto'
import { ACADEMY_PERSONAL_LINK_PLACEHOLDER } from './outbound'

const HOUR = 3_600_000
const DAY = 24 * HOUR

export const REMINDER_STAGES = [
    { key: 't21', before: 21 * DAY, label: '21 dni przed szkoleniem' },
    { key: 't7', before: 7 * DAY, label: 'tydzień przed szkoleniem' },
    { key: 't1', before: DAY, label: 'dzień przed szkoleniem' },
    { key: 't1h', before: HOUR, label: 'godzinę przed szkoleniem' },
] as const

export type ReminderStage = (typeof REMINDER_STAGES)[number]['key']
export const REMINDER_KIND = 'academy.run_reminder'
export const REMINDER_HORIZON_MS = 22 * DAY

/** Stages whose moment has not passed yet. A stage already behind us is never created late. */
export function upcomingStages(startsAt: string, now: Date): ReminderStage[] {
    const start = Date.parse(startsAt)
    if (!Number.isFinite(start) || start <= now.getTime()) return []
    return REMINDER_STAGES.filter(stage => start - stage.before > now.getTime()).map(stage => stage.key)
}

export function reminderDedupeKey(sessionId: string, stage: ReminderStage, email: string): string {
    return `run_reminder:${sessionId}:${stage}:${email}`
}

/** One batch per session and stage, stable across worker runs, so a person approves one stage at a time. */
export function reminderBatchId(sessionId: string, stage: ReminderStage): string {
    const hex = createHash('sha256').update(`${sessionId}:${stage}`).digest('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function runReminderMail(input: { stage: ReminderStage; courseTitle: string; sessionTitle: string; startsLabel: string; appUrl: string; runId: string; sessionId: string; hasCalendarFile: boolean }): { subject: string; html: string } {
    const stage = REMINDER_STAGES.find(item => item.key === input.stage)!
    const editionUrl = `${input.appUrl}/learning/edycje/${input.runId}`
    const calendar = input.hasCalendarFile ? `<p><a href="${input.appUrl}/api/academy/sessions/${input.sessionId}/calendar">Pobierz plik kalendarza</a></p>` : ''
    return {
        subject: `Przypomnienie: ${input.courseTitle}, ${stage.label}`,
        html: `<p>Przypominamy o szkoleniu <strong>${escapeHtml(input.courseTitle)}</strong> (${escapeHtml(input.sessionTitle)}).</p><p>Termin: ${escapeHtml(input.startsLabel)}.</p><p><a href="${ACADEMY_PERSONAL_LINK_PLACEHOLDER}">Otwórz szkolenie</a></p>${calendar}<p><a href="${editionUrl}">Zrezygnuj z udziału</a></p>`,
    }
}
