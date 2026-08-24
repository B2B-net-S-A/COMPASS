// Phase 53 — default Out-of-Office auto-reply templates (pure module).
//
// Extracted from graph-oof.ts so that:
//   - the leave form can PREVIEW the generated auto-reply through a server
//     action without dragging Graph/Sentry imports along,
//   - the templates are unit-testable in isolation (same pattern as
//     shouldPreserveUserOof in graph-oof.ts).
//
// Design constraints — learned the hard way, do not undo:
//   - The text MUST stay silent about the absence TYPE. OOF is also set for
//     sick leave (L4 has an auto-approve flow) — "jestem na urlopie" would be
//     false there, and switching the copy per leave type would leak health
//     data (RODO). Hence the neutral "jestem poza biurem".
//   - Person names stay in the NOMINATIVE ("zastępuje mnie Anna Nowak",
//     never "kontakt z Anna Nowak") — programmatic Polish declension of
//     names is a trap; phrase around it instead.
//   - No gendered forms ("nieobecny/-a") — profiles carry no gender field,
//     so the copy must not need one.
//   - The internal reply is short Polish; the external reply is bilingual
//     PL+EN with a company signature. The EN half formats dates in English
//     (the old template leaked "20 sierpnia 2026" into the EN paragraph).

/** Company-wide fallback contact when neither substitute nor manager exists. */
export const OFFICE_CONTACT_EMAIL = 'administracja@b2bnetwork.pl'

export interface BuildDefaultOofInput {
    employeeName: string
    /** Last day of the leave, inclusive (YYYY-MM-DD). */
    endDate: string
    /**
     * First working day after endDate (YYYY-MM-DD) — computed by the caller
     * (weekend + public_holidays aware, see nextWorkingDayAfter). The template
     * itself never does date math.
     */
    returnDate: string
    substituteName?: string | null
    substituteEmail?: string | null
    /** Urgent-contact fallback used only when no substitute is assigned. */
    managerName?: string | null
    managerEmail?: string | null
}

/**
 * Should an approved leave get an Outlook auto-reply at all?
 *
 * Single-day half-day leave → NO: the employee works part of that day, and a
 * full-day auto-reply would tell senders otherwise. Everything else → yes.
 * (Fixes the Phase 25 tautology `!start_date.includes('XXX')`, which promised
 * this skip in a comment but always evaluated to true.)
 */
export function shouldSetOofForLeave(input: {
    startDate: string
    endDate: string
    halfDay: 'morning' | 'afternoon' | null
}): boolean {
    return !(Boolean(input.halfDay) && input.startDate === input.endDate)
}

type UrgentContact =
    | { kind: 'substitute'; name: string; email: string }
    | { kind: 'manager'; name: string; email: string }
    | { kind: 'office' }

function resolveUrgentContact(input: BuildDefaultOofInput): UrgentContact {
    if (input.substituteName && input.substituteEmail) {
        return { kind: 'substitute', name: input.substituteName, email: input.substituteEmail }
    }
    if (input.managerName && input.managerEmail) {
        return { kind: 'manager', name: input.managerName, email: input.managerEmail }
    }
    return { kind: 'office' }
}

function mailtoLink(email: string): string {
    const e = escapeHtml(email)
    return `<a href="mailto:${e}">${e}</a>`
}

/** Nominative-safe Polish urgent-contact line. */
function contactLinePl(contact: UrgentContact): string {
    switch (contact.kind) {
        case 'substitute':
            return `<p>W pilnych sprawach zastępuje mnie <strong>${escapeHtml(contact.name)}</strong> (${mailtoLink(contact.email)}).</p>`
        case 'manager':
            return `<p>W pilnych sprawach proszę o kontakt: <strong>${escapeHtml(contact.name)}</strong> (${mailtoLink(contact.email)}).</p>`
        case 'office':
            return `<p>W pilnych sprawach proszę o kontakt z biurem B2B Network: ${mailtoLink(OFFICE_CONTACT_EMAIL)}.</p>`
    }
}

function contactLineEn(contact: UrgentContact): string {
    switch (contact.kind) {
        case 'substitute':
            return `<p>For urgent matters, please contact <strong>${escapeHtml(contact.name)}</strong> (${mailtoLink(contact.email)}), who is covering for me.</p>`
        case 'manager':
            return `<p>For urgent matters, please contact <strong>${escapeHtml(contact.name)}</strong> (${mailtoLink(contact.email)}).</p>`
        case 'office':
            return `<p>For urgent matters, please contact our office at ${mailtoLink(OFFICE_CONTACT_EMAIL)}.</p>`
    }
}

/**
 * Generate the default auto-reply pair when the user provides no custom text.
 *
 * internal — short Polish note for @b2bnetwork.pl senders.
 * external — formal bilingual PL+EN reply with a company signature.
 *
 * Both state the last absence day as INCLUSIVE and name the concrete return
 * date — "do 20 sierpnia" alone reads as "I'm back on the 20th" to half the
 * audience, which is exactly wrong for an inclusive end date.
 */
export function buildDefaultOofMessages(input: BuildDefaultOofInput): {
    internal: string
    external: string
} {
    const plEnd = formatPolishDate(input.endDate)
    const plReturn = formatPolishDate(input.returnDate)
    const enEnd = formatEnglishDate(input.endDate)
    const enReturn = formatEnglishDate(input.returnDate)
    const contact = resolveUrgentContact(input)
    const name = escapeHtml(input.employeeName)

    const internal = `<p>Dzień dobry,</p>
<p>jestem poza biurem do <strong>${plEnd}</strong> włącznie — odpowiem po powrocie, <strong>${plReturn}</strong>.</p>
${contactLinePl(contact)}
<p>— ${name}</p>`

    const external = `<p>Dzień dobry,</p>
<p>dziękuję za wiadomość. Jestem poza biurem do <strong>${plEnd}</strong> włącznie i odpowiem po powrocie, <strong>${plReturn}</strong>.</p>
${contactLinePl(contact)}
<hr/>
<p>Hello,</p>
<p>thank you for your email. I am out of office until <strong>${enEnd}</strong> (inclusive) and will respond after my return on <strong>${enReturn}</strong>.</p>
${contactLineEn(contact)}
<p>${name}<br/>B2B Network</p>`

    return { internal, external }
}

/** "2026-08-20" → "20 sierpnia 2026" (genitive month after a day number). */
function formatPolishDate(iso: string): string {
    const months = [
        'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
        'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
    ]
    const [year, month, day] = iso.split('-')
    return `${parseInt(day, 10)} ${months[parseInt(month, 10) - 1]} ${year}`
}

/** "2026-08-20" → "20 August 2026". UTC-anchored so the calendar date never shifts. */
function formatEnglishDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00Z`)
    return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(d)
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
}
