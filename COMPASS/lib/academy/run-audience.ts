import { ACADEMY_PERSONAL_LINK_PLACEHOLDER } from './outbound'

export interface AudienceFilter {
    includeNexus: boolean
    includeOffice: boolean
    /** Empty means every client. */
    clients: string[]
}

export interface AudienceCandidate {
    email: string
    fullName: string
    source: 'nexus' | 'office'
    clientName: string | null
}

export interface AudienceResult {
    recipients: AudienceCandidate[]
    excludedCount: number
}

/** A person on both lists receives one invitation; the office entry names them. */
export function selectAudience(candidates: AudienceCandidate[], filter: AudienceFilter, excludedEmails: string[]): AudienceResult {
    const excluded = new Set(excludedEmails.map(email => email.trim().toLowerCase()).filter(Boolean))
    const wanted = new Set(filter.clients)
    const byEmail = new Map<string, AudienceCandidate>()
    let excludedCount = 0
    for (const candidate of candidates) {
        const email = candidate.email.trim().toLowerCase()
        if (!email) continue
        if (candidate.source === 'nexus' && !filter.includeNexus) continue
        if (candidate.source === 'office' && !filter.includeOffice) continue
        if (candidate.source === 'nexus' && wanted.size > 0 && !(candidate.clientName && wanted.has(candidate.clientName))) continue
        if (excluded.has(email)) {
            if (!byEmail.has(`-${email}`)) { excludedCount++; byEmail.set(`-${email}`, candidate) }
            continue
        }
        const previous = byEmail.get(email)
        if (!previous || candidate.source === 'office') byEmail.set(email, { ...candidate, email })
    }
    const recipients = Array.from(byEmail.entries()).filter(([key]) => !key.startsWith('-')).map(([, value]) => value)
    return { recipients: recipients.sort((a, b) => a.fullName.localeCompare(b.fullName, 'pl')), excludedCount }
}

export function audienceClients(candidates: AudienceCandidate[]): string[] {
    return Array.from(new Set(candidates.flatMap(item => item.source === 'nexus' && item.clientName ? [item.clientName] : []))).sort((a, b) => a.localeCompare(b, 'pl'))
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function runInvitationMail(input: { courseTitle: string; runTitle: string; startsLabel: string }): { subject: string; html: string } {
    const course = escapeHtml(input.courseTitle)
    return {
        subject: `Zaproszenie na szkolenie: ${input.courseTitle}`,
        html: `<p>Zapraszamy na szkolenie <strong>${course}</strong> (${escapeHtml(input.runTitle)}).</p><p>Termin: ${escapeHtml(input.startsLabel)}.</p><p><a href="${ACADEMY_PERSONAL_LINK_PLACEHOLDER}">Otwórz szkolenie i zapisz się</a></p>`,
    }
}

/** Queue expiry must fall on the event and stay inside the outbox limit of 90 days. */
export function invitationExpiry(firstSessionStartsAt: string, now: Date): string | null {
    const startsAt = Date.parse(firstSessionStartsAt)
    if (!Number.isFinite(startsAt) || startsAt <= now.getTime()) return null
    return new Date(Math.min(startsAt, now.getTime() + 89 * 86_400_000)).toISOString()
}
