// Phase 18.x PR1.C — Email preview helpers (admin-only diagnostic).
//
// These functions build HTML for each transactional email with mock data,
// without sending anything. The admin email-preview endpoint
// (app/api/admin/email-preview) uses them to render in an iframe so we can
// QA template changes without waiting for the 25th of the month.
//
// Why a separate file rather than refactoring lib/email.ts:
//   - send* functions in lib/email.ts mix business logic (DB lookups, label
//     mapping, branch on decision/phase) with the HTML template. A clean
//     refactor would split each into render* + send* — that's 14 templates
//     of churn for one preview feature.
//   - Previews need pure inputs: caller passes mock data, gets HTML out.
//     No DB, no side effects.
//   - We import the shared wrapHrEmail wrapper from lib/email.ts so the
//     visual frame stays in sync. If the wrapper changes, previews follow.
//
// Coverage (initial set, MVP — 5 most compliance-relevant templates):
//   - leave_decision (approved + rejected)
//   - timesheet_decision (approved + rejected)
//   - role_change
//   - broadcast
//   - timesheet_reminder (4 phases)

import { wrapHrEmail } from '@/lib/email'

export const PREVIEW_TEMPLATES = [
    'leave_decision_approved',
    'leave_decision_rejected',
    'timesheet_decision_approved',
    'timesheet_decision_rejected',
    'role_change_added',
    'role_change_removed',
    'broadcast',
    'timesheet_reminder_mon_nudge',
    'timesheet_reminder_wed_warning',
    'timesheet_reminder_warning',
    'timesheet_reminder_final',
] as const

export type PreviewTemplate = (typeof PREVIEW_TEMPLATES)[number]

export interface PreviewResult {
    subject: string
    html: string
}

export function isPreviewTemplate(value: string): value is PreviewTemplate {
    return (PREVIEW_TEMPLATES as readonly string[]).includes(value)
}

export function renderPreview(template: PreviewTemplate): PreviewResult {
    switch (template) {
        case 'leave_decision_approved':
            return previewLeaveDecision('approved')
        case 'leave_decision_rejected':
            return previewLeaveDecision('rejected')
        case 'timesheet_decision_approved':
            return previewTimesheetDecision('approved')
        case 'timesheet_decision_rejected':
            return previewTimesheetDecision('rejected')
        case 'role_change_added':
            return previewRoleChange('added')
        case 'role_change_removed':
            return previewRoleChange('removed')
        case 'broadcast':
            return previewBroadcast()
        case 'timesheet_reminder_mon_nudge':
            return previewTimesheetReminder('mon-nudge')
        case 'timesheet_reminder_wed_warning':
            return previewTimesheetReminder('wed-warning')
        case 'timesheet_reminder_warning':
            return previewTimesheetReminder('warning')
        case 'timesheet_reminder_final':
            return previewTimesheetReminder('final')
    }
}

// ─── Individual template renderers (mirror lib/email.ts shape) ───────────────

function previewLeaveDecision(decision: 'approved' | 'rejected'): PreviewResult {
    const isApproved = decision === 'approved'
    const subject = isApproved
        ? `[COMPASS HR] Wniosek urlopowy zaakceptowany`
        : `[COMPASS HR] Wniosek urlopowy odrzucony`
    const accent = isApproved ? '#22c55e' : '#f59e0b'
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>Jan Testowy</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">Twój wniosek urlopowy został <strong>${isApproved ? 'zaakceptowany' : 'odrzucony'}</strong>:</p>
        <ul style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
            <li><strong>Typ:</strong> Urlop wypoczynkowy</li>
            <li><strong>Od:</strong> 2026-06-01</li>
            <li><strong>Do:</strong> 2026-06-05</li>
            ${!isApproved ? `<li><strong>Komentarz admina:</strong> Termin koliduje z deadline'em projektu — przesuń o tydzień.</li>` : ''}
        </ul>
    `
    return {
        subject,
        html: wrapHrEmail({ tag: 'Decyzja urlopowa', heading: subject, bodyHtml, accent }),
    }
}

function previewTimesheetDecision(decision: 'approved' | 'rejected'): PreviewResult {
    const isApproved = decision === 'approved'
    const year = 2026
    const month = 5
    const monthLabel = `${year}-${String(month).padStart(2, '0')}`
    const subject = isApproved
        ? `[COMPASS HR] Timesheet ${monthLabel} zaakceptowany`
        : `[COMPASS HR] Timesheet ${monthLabel} odrzucony`
    const accent = isApproved ? '#22c55e' : '#f59e0b'
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>Jan Testowy</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Twój timesheet za <strong>${monthLabel}</strong> został
            <strong>${isApproved ? 'zaakceptowany' : 'odrzucony'}</strong>.
        </p>
        ${!isApproved ? `<p style="color: #d1d5db; font-size: 14px;"><strong>Komentarz:</strong> Brakuje godzin za 3 dni — uzupełnij i złóż ponownie.</p>` : ''}
        ${isApproved ? `<p style="color: #d1d5db; font-size: 14px;">PDF dostępny do pobrania w sekcji <strong>Timesheet</strong>.</p>` : ''}
    `
    return {
        subject,
        html: wrapHrEmail({ tag: 'Decyzja timesheet', heading: subject, bodyHtml, accent }),
    }
}

function previewRoleChange(kind: 'added' | 'removed'): PreviewResult {
    const isAdded = kind === 'added'
    const subject = isAdded
        ? `[COMPASS] Nadano Ci rolę administratora`
        : `[COMPASS] Odebrano Ci rolę administratora`
    const heading = isAdded ? 'Zostałeś administratorem' : 'Twoja rola administratora wygasła'
    const body = isAdded
        ? 'Otrzymałeś rolę administratora. Możesz teraz zarządzać konsultantami, zatwierdzać urlopy i timesheety.'
        : 'Twoja rola administratora została odebrana. Wracasz do roli pracownika wewnętrznego.'
    const accent = isAdded ? '#22d3ee' : '#f59e0b'
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px; line-height: 1.6;">Cześć <strong>Jan Testowy</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px; line-height: 1.6;">${body}</p>
    `
    return { subject, html: wrapHrEmail({ tag: 'Zmiana roli', heading, bodyHtml, accent }) }
}

function previewBroadcast(): PreviewResult {
    const title = 'Zmiany w polityce urlopowej — od 1 lipca'
    const senderName = 'Anna Kowalska'
    const content = `Od 1 lipca 2026 wprowadzamy nową procedurę wnioskowania o urlop:\n\n1. Wnioski składamy minimum 14 dni przed planowanym terminem.\n2. Krytyczne projekty wymagają zgody PM-a przed wnioskiem.\n3. Urlopy >5 dni wymagają zgody dyrektora.\n\nPełna polityka w sekcji Dokumenty → Polityki HR.`

    const html = wrapHrEmail({
        tag: 'Ogłoszenie',
        heading: title,
        accent: '#fbbf24',
        bodyHtml: `
            <div style="color: #d1d5db; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${content}</div>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">Nadawca: <strong>${senderName}</strong></p>
        `,
    })
    return { subject: `[COMPASS] ${title}`, html }
}

type ReminderPhase = 'mon-nudge' | 'wed-warning' | 'warning' | 'final'

function previewTimesheetReminder(phase: ReminderPhase): PreviewResult {
    const monthLabel = '2026-05'
    const recipientName = 'Jan Testowy'

    const variants: Record<ReminderPhase, { subject: string; body: string; tag: string; accent: string }> = {
        'mon-nudge': {
            subject: `[COMPASS HR] Czas zacząć timesheet ${monthLabel}`,
            body: `
                <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
                <p style="color: #d1d5db; font-size: 14px;">
                    Zaczynamy nowy tydzień — to dobry moment żeby uzupełnić wpisy w timesheecie za <strong>${monthLabel}</strong>.
                    Im wcześniej, tym łatwiej zapamiętać godziny.
                </p>
            `,
            tag: 'Łagodne przypomnienie',
            accent: '#3b82f6',
        },
        'wed-warning': {
            subject: `[COMPASS HR] Timesheet ${monthLabel} — środa, czas akcji`,
            body: `
                <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
                <p style="color: #d1d5db; font-size: 14px;">
                    Środa już za nami — wniosek o timesheet za <strong>${monthLabel}</strong> czeka. Warto wypełnić dziś.
                </p>
            `,
            tag: 'Termin za 3 dni',
            accent: '#f59e0b',
        },
        warning: {
            subject: `[COMPASS HR] Przypomnienie: timesheet ${monthLabel}`,
            body: `
                <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
                <p style="color: #d1d5db; font-size: 14px;">
                    Przypominamy o złożeniu timesheetu za <strong>${monthLabel}</strong>.
                    Wypełnij wpisy w sekcji <strong>Timesheet</strong> i kliknij „Złóż timesheet"
                    najpóźniej do 5. dnia następnego miesiąca.
                </p>
            `,
            tag: 'Przypomnienie',
            accent: '#f59e0b',
        },
        final: {
            subject: `[COMPASS HR] OSTATNIA SZANSA: timesheet ${monthLabel}`,
            body: `
                <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
                <p style="color: #d1d5db; font-size: 14px;">
                    <strong style="color: #ef4444;">Ostatnia szansa</strong> na złożenie timesheetu za
                    <strong>${monthLabel}</strong>. Bez zaakceptowanego timesheetu naliczenie wynagrodzenia
                    za ten miesiąc nie nastąpi.
                </p>
            `,
            tag: 'OSTATNIA SZANSA',
            accent: '#ef4444',
        },
    }

    const v = variants[phase]
    return {
        subject: v.subject,
        html: wrapHrEmail({ tag: v.tag, heading: v.subject, bodyHtml: v.body, accent: v.accent }),
    }
}
