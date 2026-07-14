import 'server-only'

import { sendEmail, type SendResult } from '@/lib/email/sender'

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
}

export function buildConsultantSuccessEmailHtml(options: {
    heading: string
    body: string
    actionUrl?: string
    actionLabel?: string
}): string {
    const heading = escapeHtml(options.heading)
    const body = escapeHtml(options.body)
    const button = options.actionUrl
        ? `<p style="margin:24px 0"><a href="${escapeHtml(options.actionUrl)}" style="background:#2563eb;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">${escapeHtml(options.actionLabel ?? 'Otwórz')}</a></p>`
        : ''
    return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#111827;line-height:1.5"><h2>${heading}</h2><p>${body}</p>${button}<p style="color:#6b7280;font-size:12px">Wiadomość wysłana automatycznie przez COMPASS.</p></body></html>`
}

export async function sendConsultantSuccessEmail(options: {
    to: string
    subject: string
    body: string
    actionUrl?: string
    actionLabel?: string
}): Promise<SendResult> {
    return sendEmail({
        to: options.to,
        subject: options.subject,
        html: buildConsultantSuccessEmailHtml({
            heading: options.subject,
            body: options.body,
            actionUrl: options.actionUrl,
            actionLabel: options.actionLabel,
        }),
        saveToSentItems: false,
    })
}

export const _emailInternals = { escapeHtml }
