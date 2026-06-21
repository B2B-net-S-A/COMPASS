import { logger, logCompat } from '@/lib/logger'
import { sendEmail, type SendResult } from '@/lib/email/sender'

// Phase 17b PR-E — Provider-agnostic email send.
//
// `getResend()` is kept as a backwards-compatible shim so all 14 templates
// below stay unchanged. Under the hood it routes through lib/email/sender.ts
// which picks the active provider (Microsoft Graph vs Resend) at runtime via
// MAIL_PROVIDER env var. Default fallback = Resend if Azure creds are not set.
//
// The shim returns the same `{ data, error }` shape as Resend SDK so existing
// `if (error) { ... }` handlers keep working without any change.
function getResend(): {
    emails: {
        send: (args: {
            from: string
            to: string
            subject: string
            html: string
            /**
             * When true, Graph saves to Sent Items in the sender mailbox.
             * Set for compliance-relevant templates (leave decision, timesheet
             * decision, role change, broadcast). Default false. Resend ignores
             * this flag (it always archives in Resend dashboard).
             */
            saveToSentItems?: boolean
        }) => Promise<{ data: { id?: string } | null; error: { message: string } | null }>
    }
} {
    return {
        emails: {
            send: async (args) => {
                const result: SendResult = await sendEmail({
                    to: args.to,
                    subject: args.subject,
                    html: args.html,
                    from: args.from, // honor explicit per-call from (legacy templates pass it)
                    saveToSentItems: args.saveToSentItems,
                })
                if (!result.success) {
                    return {
                        data: null,
                        error: { message: result.error ?? 'send_failed' },
                    }
                }
                return {
                    data: { id: result.messageId },
                    error: null,
                }
            },
        },
    }
}

interface EquipmentRequestEmailData {
    userName: string
    userEmail: string
    itemName: string
    category: string
    details: string
    requestId: string
}

interface BenefitDeclarationEmailData {
    userName: string
    userEmail: string
    benefitType: 'medical' | 'sport'
    variantName: string
    declarationId: string
}

/**
 * Send email notification for equipment request
 */
export async function sendEquipmentRequestEmail(
    recipientEmail: string,
    data: EquipmentRequestEmailData
) {
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Nowe zgłoszenie sprzętowe do rozpatrzenia:</p>
        <ul style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
            <li><strong>Użytkownik:</strong> ${data.userName} (${data.userEmail})</li>
            <li><strong>Typ:</strong> ${data.itemName}</li>
            <li><strong>Kategoria:</strong> ${data.category}</li>
            <li><strong>ID zgłoszenia:</strong> ${data.requestId}</li>
        </ul>
        <p style="color: #d1d5db; font-size: 14px; margin-bottom: 8px;"><strong>Szczegóły:</strong></p>
        <div style="color: #d1d5db; font-size: 13px; line-height: 1.6; white-space: pre-wrap; background: #0f1320; border: 1px solid #232a3b; border-radius: 8px; padding: 14px;">${data.details}</div>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject: `[SPRZĘT] Nowe zgłoszenie od ${data.userName}`,
            html: wrapHrEmail({ tag: 'Zgłoszenie sprzętowe', heading: `Nowe zgłoszenie od ${data.userName}`, bodyHtml, accent: '#3b82f6' }),
        })

        if (error) {
            logger.error({ event: 'email.equipment_request.resend_failed', error })
            throw new Error(`Failed to send email: ${error.message}`)
        }

        return { success: true }
    } catch (err) {
        logger.error({ event: 'email.equipment_request.send_failed', error: err })
        // Don't throw - we don't want to fail the request if email fails
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
}

/**
 * Send email notification for benefit declaration
 */
export async function sendBenefitDeclarationEmail(
    recipientEmail: string,
    data: BenefitDeclarationEmailData
) {
    const benefitTypeLabel = data.benefitType === 'medical' ? 'Pakiet Medyczny (PZU)' : 'Pakiet Sportowy (FitProfit)'

    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Nowa deklaracja benefitowa do rozpatrzenia:</p>
        <ul style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
            <li><strong>Użytkownik:</strong> ${data.userName} (${data.userEmail})</li>
            <li><strong>Typ benefitu:</strong> ${benefitTypeLabel}</li>
            <li><strong>Wybrany wariant:</strong> ${data.variantName}</li>
            <li><strong>ID deklaracji:</strong> ${data.declarationId}</li>
        </ul>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject: `[BENEFITY] Nowa deklaracja od ${data.userName}`,
            html: wrapHrEmail({ tag: 'Deklaracja benefitu', heading: `Nowa deklaracja od ${data.userName}`, bodyHtml, accent: '#3b82f6' }),
        })

        if (error) {
            logger.error({ event: 'email.benefit_declaration.resend_failed', error })
            throw new Error(`Failed to send email: ${error.message}`)
        }

        return { success: true }
    } catch (err) {
        logger.error({ event: 'email.benefit_declaration.send_failed', error: err })
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
}

/**
 * Send email about a Centrala role change (grant or revoke).
 */
export async function sendRoleChangeEmail(
    recipientEmail: string,
    recipientName: string,
    roleLabel: string,
    action: 'added' | 'removed'
) {
    const isAdded = action === 'added'
    const subject = isAdded
        ? `[COMPASS] Nowa rola: ${roleLabel} w Centrali`
        : `[COMPASS] Zmiana roli — usunięcie z Centrali`

    const heading = isAdded
        ? `Otrzymałeś nową rolę w Centrali`
        : `Twoja rola w Centrali została odebrana`

    const body = isAdded
        ? `Zostałeś dodany do Centrali B2B.net jako <strong>${roleLabel}</strong>.<br/><br/>Aby aktywować nowe uprawnienia, <strong>wyloguj się i zaloguj ponownie</strong> do aplikacji COMPASS.`
        : `Twoja rola w Centrali została odebrana. Po ponownym zalogowaniu powrócisz do roli Konsultanta.<br/><br/>Jeśli uważasz, że to błąd, skontaktuj się z administratorem systemu.`

    const accentColor = isAdded ? '#22d3ee' : '#f59e0b'
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px; line-height: 1.6;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px; line-height: 1.6;">${body}</p>
    `

    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            saveToSentItems: true, // compliance: role change audit trail
            html: wrapHrEmail({ tag: 'Zmiana roli', heading, bodyHtml, accent: accentColor }),
        })

        if (error) {
            logger.error({ event: 'email.role_change.resend_failed', error })
            throw new Error(`Failed to send role-change email: ${error.message}`)
        }

        return { success: true }
    } catch (err) {
        logger.error({ event: 'email.role_change.send_failed', error: err })
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
}

/**
 * Send broadcast announcement email to a single user
 */
export async function sendBroadcastEmail(
    recipientEmail: string,
    senderName: string,
    title: string,
    content: string
) {
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject: `[COMPASS] ${title}`,
            saveToSentItems: true, // compliance: broadcast/announcement audit trail
            html: wrapHrEmail({
                tag: 'Ogłoszenie',
                heading: title,
                accent: '#fbbf24',
                bodyHtml: `
                    <div style="color: #d1d5db; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${content}</div>
                    <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">Nadawca: <strong>${senderName}</strong></p>
                `,
            }),
        })

        if (error) {
            logger.error({ event: 'email.broadcast.resend_failed', error })
            throw new Error(`Failed to send broadcast email: ${error.message}`)
        }

        return { success: true }
    } catch (err) {
        logger.error({ event: 'email.broadcast.send_failed', error: err })
        return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
    }
}

// ─── Phase 11: HR Internal email templates ──────────────────────────────────

export const HR_LEAVE_TYPE_LABEL: Record<string, string> = {
    vacation: 'Urlop wypoczynkowy',
    on_demand: 'Urlop na żądanie',
    occasional: 'Urlop okolicznościowy',
    childcare: 'Opieka nad dzieckiem (art. 188)',
    care_leave: 'Urlop opiekuńczy',
    force_majeure: 'Siła wyższa',
    sick_leave: 'L4 / chorobowe',
    maternity: 'Urlop macierzyński',
    paternity: 'Urlop ojcowski',
    parental_leave: 'Urlop rodzicielski',
    childrearing: 'Urlop wychowawczy',
    unpaid_leave: 'Urlop bezpłatny',
    blood_donation: 'Krwiodawstwo',
    training: 'Urlop szkoleniowy',
    holiday_in_lieu: 'Odbiór dnia za święto',
    other: 'Inne',
}

/**
 * Central email chrome shared by every COMPASS notification.
 *
 * Table-based + inline styles so it renders consistently in Outlook (the
 * primary client — mail ships via Microsoft Graph to b2bnetwork.pl mailboxes),
 * Apple Mail, Gmail and mobile. Gradients / rounded corners are progressive
 * enhancement layered on top of solid `bgcolor` fallbacks, so Outlook still
 * looks clean. The theme is dark on purpose — every caller's `bodyHtml` uses
 * light text colours (#d1d5db), so the background must stay dark.
 *
 * `heading` is usually the raw email subject, which carries a noisy
 * "[COMPASS …]" prefix that duplicates the eyebrow `tag`; we strip that prefix
 * so the card title reads cleanly.
 */
export function wrapHrEmail(opts: { tag: string; heading: string; bodyHtml: string; accent?: string }): string {
    const accent = opts.accent ?? '#22d3ee'
    const heading = opts.heading.replace(/^\s*\[[^\]]*]\s*/, '').trim() || opts.heading
    const preheader = heading.replace(/<[^>]*>/g, '')
    const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`
    return `<!doctype html>
<html lang="pl" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark light" />
<meta name="supported-color-schemes" content="dark light" />
<title>COMPASS</title>
<style>
  body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; }
  a { color: #38bdf8; }
  .cp-body ul { margin: 16px 0; padding-left: 20px; }
  .cp-body li { margin: 5px 0; }
  .cp-body p { margin: 14px 0; }
  @media only screen and (max-width: 620px) {
    .cp-shell { width: 100% !important; }
    .cp-pad { padding-left: 22px !important; padding-right: 22px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#0b0d13;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#0b0d13;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" class="cp-shell" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:600px;background-color:#151a26;border-radius:16px;overflow:hidden;border:1px solid #232a3b;">
        <tr><td style="height:4px;line-height:4px;font-size:0;background-color:${accent};">&nbsp;</td></tr>
        <tr>
          <td class="cp-pad" style="background-color:#0e2a3f;background-image:linear-gradient(135deg,#0e4d6e 0%,#141a2c 100%);padding:22px 32px;">
            <img src="https://compass.dynaminds.pl/email-logo.png" height="40" alt="COMPASS" style="display:block;height:40px;width:auto;border:0;outline:none;text-decoration:none;font-family:${font};font-size:22px;font-weight:900;letter-spacing:3px;color:#ffffff;" />
          </td>
        </tr>
        <tr>
          <td class="cp-body cp-pad" style="padding:30px 32px 8px 32px;font-family:${font};color:#d1d5db;font-size:14px;line-height:1.6;">
            <p style="margin:0 0 10px 0;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${accent};">${opts.tag}</p>
            <h1 style="margin:0 0 4px 0;font-size:21px;line-height:1.35;font-weight:700;color:#ffffff;">${heading}</h1>
            ${opts.bodyHtml}
          </td>
        </tr>
        <tr>
          <td class="cp-pad" style="padding:20px 32px 28px 32px;border-top:1px solid #232a3b;font-family:${font};">
            <p style="margin:0 0 4px 0;font-size:12px;color:#9ca3af;"><span style="color:#22d3ee;font-weight:700;">COMPASS</span></p>
            <p style="margin:0;font-size:11px;color:#6b7280;line-height:1.5;">Wiadomość wygenerowana automatycznie — prosimy nie odpowiadać na ten adres.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`
}

export async function sendLeaveRequestSubmitted(
    recipientEmails: string[],
    requesterName: string,
    leaveType: string,
    startDate: string,
    endDate: string,
    note: string | null,
    substituteName: string | null = null,
): Promise<{ success: boolean }> {
    if (recipientEmails.length === 0) return { success: true }
    const typeLabel = HR_LEAVE_TYPE_LABEL[leaveType] ?? leaveType
    const subject = `[COMPASS HR] Nowy wniosek urlopowy — ${requesterName}`
    const substituteLine = substituteName
        ? `<li><strong>Zastępca:</strong> ${substituteName} — zastępuje ${requesterName} na czas nieobecności</li>`
        : `<li><strong>Zastępca:</strong> <span style="color: #9ca3af;">nie wskazano</span></li>`
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">${requesterName} złożył wniosek urlopowy do akceptacji:</p>
        <ul style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
            <li><strong>Typ:</strong> ${typeLabel}</li>
            <li><strong>Od:</strong> ${startDate}</li>
            <li><strong>Do:</strong> ${endDate}</li>
            ${substituteLine}
            ${note ? `<li><strong>Notatka:</strong> ${note}</li>` : ''}
        </ul>
        <p style="color: #d1d5db; font-size: 14px;">Zaakceptuj/odrzuć w panelu administracyjnym.</p>
    `
    const html = wrapHrEmail({ tag: 'Nowy wniosek urlopowy', heading: subject, bodyHtml })

    try {
        for (const to of recipientEmails) {
            const { error } = await getResend().emails.send({
                from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
                to,
                subject,
                html,
            })
            if (error) logCompat.error('Resend leave-submitted error:', error)
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Leave-submitted email failed:', err)
        return { success: false }
    }
}

/**
 * Phase 25 — notify substitute that they were assigned + leave got approved.
 * Includes the leave dates, employee name/email, and a link to the calendar
 * (so substitute knows from when to start covering).
 */
export async function sendSubstituteAssigned(
    substituteEmail: string,
    substituteName: string,
    employeeName: string,
    employeeEmail: string,
    startDate: string,
    endDate: string,
): Promise<{ success: boolean }> {
    const subject = `[COMPASS HR] Jesteś zastępcą — ${employeeName} (${startDate} – ${endDate})`
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć ${substituteName},</p>
        <p style="color: #d1d5db; font-size: 14px;">
            <strong>${employeeName}</strong> (${employeeEmail}) wybrał Cię jako zastępcę
            podczas swojego urlopu.
        </p>
        <ul style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
            <li><strong>Od:</strong> ${startDate}</li>
            <li><strong>Do:</strong> ${endDate}</li>
        </ul>
        <p style="color: #d1d5db; font-size: 14px;">
            Outlook auto-reply pracownika kieruje pilne sprawy do Ciebie.
            Wniosek został zaakceptowany, możesz spodziewać się pierwszych zapytań od jutra
            (lub od daty rozpoczęcia urlopu).
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 16px;">
            Jeśli to pomyłka — skontaktuj się z ${employeeName} lub adminem.
        </p>
    `
    const html = wrapHrEmail({ tag: 'Zastępstwo', heading: subject, bodyHtml })

    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: substituteEmail,
            subject,
            html,
            saveToSentItems: true,
        })
        if (error) {
            logCompat.error('Resend substitute-assigned error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Substitute-assigned email failed:', err)
        return { success: false }
    }
}

/**
 * H2.3: notify adminów że user anulował zatwierdzony future urlop.
 */
export async function sendLeaveCancelledByUser(
    recipientEmails: string[],
    requesterName: string,
    leaveType: string,
    startDate: string,
    endDate: string,
): Promise<{ success: boolean }> {
    if (recipientEmails.length === 0) return { success: true }
    const typeLabel = HR_LEAVE_TYPE_LABEL[leaveType] ?? leaveType
    const subject = `[COMPASS HR] Anulowano zatwierdzony urlop — ${requesterName}`
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">
            Pracownik <strong>${requesterName}</strong> anulował zatwierdzony urlop:
        </p>
        <ul style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
            <li><strong>Typ:</strong> ${typeLabel}</li>
            <li><strong>Od:</strong> ${startDate}</li>
            <li><strong>Do:</strong> ${endDate}</li>
        </ul>
        <p style="color: #d1d5db; font-size: 14px;">
            Saldo urlopu zostało automatycznie odzyskane. Sprawdź jeśli kolega z zespołu ma teraz konflikt z planem urlopów.
        </p>
    `
    const html = wrapHrEmail({
        tag: 'Anulacja urlopu',
        heading: subject,
        bodyHtml,
        accent: '#f59e0b',
    })
    try {
        for (const to of recipientEmails) {
            const { error } = await getResend().emails.send({
                from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
                to,
                subject,
                html,
            })
            if (error) logCompat.error('Resend leave-cancelled error:', error)
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Leave-cancelled email failed:', err)
        return { success: false }
    }
}

export async function sendLeaveDecision(
    recipientEmail: string,
    recipientName: string,
    decision: 'approved' | 'rejected',
    leaveType: string,
    startDate: string,
    endDate: string,
    decisionNote?: string | null,
): Promise<{ success: boolean }> {
    const typeLabel = HR_LEAVE_TYPE_LABEL[leaveType] ?? leaveType
    const isApproved = decision === 'approved'
    const subject = isApproved
        ? `[COMPASS HR] Wniosek urlopowy zaakceptowany`
        : `[COMPASS HR] Wniosek urlopowy odrzucony`
    const accent = isApproved ? '#22c55e' : '#f59e0b'
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">Twój wniosek urlopowy został <strong>${isApproved ? 'zaakceptowany' : 'odrzucony'}</strong>:</p>
        <ul style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
            <li><strong>Typ:</strong> ${typeLabel}</li>
            <li><strong>Od:</strong> ${startDate}</li>
            <li><strong>Do:</strong> ${endDate}</li>
            ${decisionNote ? `<li><strong>Komentarz admina:</strong> ${decisionNote}</li>` : ''}
        </ul>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            saveToSentItems: true, // compliance: leave approve/reject audit trail
            html: wrapHrEmail({ tag: 'Decyzja urlopowa', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            logCompat.error('Resend leave-decision error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Leave-decision email failed:', err)
        return { success: false }
    }
}

// Phase 25b — Manager/admin wpisał urlop w imieniu pracownika.
// `isPastLeave=true` → wstecznie wpisany urlop, OOF i wydarzenie Outlook
// nie były ustawione (już po fakcie). `isPastLeave=false` → ongoing/future,
// system ustawił OOF i Outlook event automatycznie.
export async function sendLeaveCreatedOnBehalf(
    recipientEmail: string,
    recipientName: string,
    actorName: string,
    leaveType: string,
    startDate: string,
    endDate: string,
    note?: string | null,
    isPastLeave: boolean = false,
): Promise<{ success: boolean }> {
    const typeLabel = HR_LEAVE_TYPE_LABEL[leaveType] ?? leaveType
    const subject = `[COMPASS HR] ${actorName} wpisał za Ciebie urlop`
    const accent = '#3b82f6'
    const sideEffectsNote = isPastLeave
        ? `<p style="color: #d1d5db; font-size: 14px;">
              Urlop dotyczy okresu, który już minął — nie ustawiamy Out of Office ani powiadomień zastępcy.
              Wpis trafia do Twojej historii i przelicza obecności w tych dniach.
           </p>`
        : `<p style="color: #d1d5db; font-size: 14px;">
              System automatycznie ustawił Out of Office w Twoim Outlooku oraz utworzył wydarzenie w kalendarzu na czas urlopu.
           </p>`
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            <strong>${actorName}</strong> wpisał za Ciebie urlop w systemie COMPASS:
        </p>
        <ul style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
            <li><strong>Typ:</strong> ${typeLabel}</li>
            <li><strong>Od:</strong> ${startDate}</li>
            <li><strong>Do:</strong> ${endDate}</li>
            ${note ? `<li><strong>Notatka:</strong> ${note}</li>` : ''}
        </ul>
        ${sideEffectsNote}
        <p style="color: #d1d5db; font-size: 14px;">
            Jeśli to pomyłka — skontaktuj się z osobą, która wpisała urlop, lub z administratorem.
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            saveToSentItems: true, // audit trail: kto wpisał za kogo
            html: wrapHrEmail({ tag: 'Urlop wpisany', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            logCompat.error('Resend leave-on-behalf error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Leave-on-behalf email failed:', err)
        return { success: false }
    }
}

export async function sendTimesheetSubmitted(
    recipientEmails: string[],
    requesterName: string,
    year: number,
    month: number,
): Promise<{ success: boolean }> {
    if (recipientEmails.length === 0) return { success: true }
    const subject = `[COMPASS HR] Timesheet ${year}-${String(month).padStart(2, '0')} — ${requesterName}`
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">
            ${requesterName} złożył timesheet za <strong>${year}-${String(month).padStart(2, '0')}</strong> do akceptacji.
        </p>
        <p style="color: #d1d5db; font-size: 14px;">Zaakceptuj/odrzuć w panelu administracyjnym.</p>
    `
    const html = wrapHrEmail({ tag: 'Timesheet do akceptacji', heading: subject, bodyHtml })
    try {
        for (const to of recipientEmails) {
            const { error } = await getResend().emails.send({
                from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
                to,
                subject,
                html,
            })
            if (error) logCompat.error('Resend timesheet-submitted error:', error)
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Timesheet-submitted email failed:', err)
        return { success: false }
    }
}

export async function sendTimesheetDecision(
    recipientEmail: string,
    recipientName: string,
    decision: 'approved' | 'rejected',
    year: number,
    month: number,
    rejectionNote?: string | null,
): Promise<{ success: boolean }> {
    const isApproved = decision === 'approved'
    const subject = isApproved
        ? `[COMPASS HR] Timesheet ${year}-${String(month).padStart(2, '0')} zaakceptowany`
        : `[COMPASS HR] Timesheet ${year}-${String(month).padStart(2, '0')} odrzucony`
    const accent = isApproved ? '#22c55e' : '#f59e0b'
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Twój timesheet za <strong>${year}-${String(month).padStart(2, '0')}</strong> został
            <strong>${isApproved ? 'zaakceptowany' : 'odrzucony'}</strong>.
        </p>
        ${rejectionNote ? `<p style="color: #d1d5db; font-size: 14px;"><strong>Komentarz:</strong> ${rejectionNote}</p>` : ''}
        ${isApproved ? `<p style="color: #d1d5db; font-size: 14px;">PDF dostępny do pobrania w sekcji <strong>Timesheet</strong>.</p>` : ''}
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            saveToSentItems: true, // compliance: timesheet approve/reject audit trail
            html: wrapHrEmail({ tag: 'Decyzja timesheet', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            logCompat.error('Resend timesheet-decision error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Timesheet-decision email failed:', err)
        return { success: false }
    }
}

// ─── Phase 19 — Invoices (finanse role) ─────────────────────────────────────

export async function sendInvoiceSubmitted(
    recipientEmails: string[],
    requesterName: string,
    invoiceNumber: string,
    periodYear: number,
    periodMonth: number,
): Promise<{ success: boolean }> {
    if (recipientEmails.length === 0) return { success: true }
    const periodLabel = `${periodYear}-${String(periodMonth).padStart(2, '0')}`
    const subject = `[COMPASS] Faktura ${invoiceNumber} (${periodLabel}) — ${requesterName}`
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">
            ${requesterName} wystawił fakturę <strong>${invoiceNumber}</strong> za okres
            <strong>${periodLabel}</strong> do akceptacji.
        </p>
        <p style="color: #d1d5db; font-size: 14px;">Zweryfikuj w panelu Finanse: /internal/admin?tab=invoices</p>
    `
    const html = wrapHrEmail({ tag: 'Faktura do akceptacji', heading: subject, bodyHtml })
    try {
        for (const to of recipientEmails) {
            const { error } = await getResend().emails.send({
                from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
                to,
                subject,
                html,
            })
            if (error) logCompat.error('Resend invoice-submitted error:', error)
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Invoice-submitted email failed:', err)
        return { success: false }
    }
}

export async function sendInvoiceDecision(
    recipientEmail: string,
    recipientName: string,
    decision: 'approved' | 'rejected',
    invoiceNumber: string,
    periodYear: number,
    periodMonth: number,
    rejectionReason?: string | null,
): Promise<{ success: boolean }> {
    const isApproved = decision === 'approved'
    const periodLabel = `${periodYear}-${String(periodMonth).padStart(2, '0')}`
    const subject = isApproved
        ? `[COMPASS] Faktura ${invoiceNumber} (${periodLabel}) zaakceptowana`
        : `[COMPASS] Faktura ${invoiceNumber} (${periodLabel}) odrzucona`
    const accent = isApproved ? '#22c55e' : '#f59e0b'
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Twoja faktura <strong>${invoiceNumber}</strong> za <strong>${periodLabel}</strong> została
            <strong>${isApproved ? 'zaakceptowana' : 'odrzucona'}</strong>.
        </p>
        ${rejectionReason ? `<p style="color: #d1d5db; font-size: 14px;"><strong>Komentarz:</strong> ${rejectionReason}</p>` : ''}
        ${!isApproved ? `<p style="color: #d1d5db; font-size: 14px;">Możesz poprawić i wysłać ponownie w sekcji <strong>Faktury</strong>.</p>` : ''}
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            html: wrapHrEmail({ tag: 'Decyzja faktura', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            logCompat.error('Resend invoice-decision error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Invoice-decision email failed:', err)
        return { success: false }
    }
}

/**
 * A1.5: Email reminderowy dla studenta który zaczął kurs ale ≥3 dni nie zrobił postępu.
 * Wysyłany przez cron `/api/cron/course-inactivity` (max 1×/tydz per enrollment).
 */
export async function sendCourseInactivityReminder(
    recipientEmail: string,
    recipientName: string,
    args: {
        courseTitle: string
        courseSlug: string
        progressPercent: number
        completedLessons: number
        totalLessons: number
        lastAccessDaysAgo: number
        appUrl: string
    },
): Promise<{ success: boolean }> {
    const remaining = args.totalLessons - args.completedLessons
    const subject = `[COMPASS Akademia] Wróć do kursu "${args.courseTitle}"`
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Zaczynałeś świetnie kurs <strong>${args.courseTitle}</strong>, ale od ${args.lastAccessDaysAgo}
            ${args.lastAccessDaysAgo === 1 ? 'dnia nie zaglądałeś' : 'dni nie zaglądasz'}.
        </p>
        <p style="color: #d1d5db; font-size: 14px;">
            Postęp: <strong>${args.progressPercent}%</strong> (${args.completedLessons}/${args.totalLessons} lekcji).
            Zostały tylko <strong>${remaining}</strong> ${remaining === 1 ? 'lekcja' : 'lekcje'} do końca.
        </p>
        <p style="margin-top: 20px;">
            <a href="${args.appUrl}/learning/${args.courseSlug}/lekcja/first"
               style="display: inline-block; padding: 10px 20px; background: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">
                Kontynuuj kurs
            </a>
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS Akademia <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            html: wrapHrEmail({
                tag: 'Akademia',
                heading: 'Wróć do kursu',
                bodyHtml,
                accent: '#3b82f6',
            }),
        })
        if (error) {
            logCompat.error('Resend course-inactivity error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Course-inactivity email failed:', err)
        return { success: false }
    }
}

// Phase 17b R9 (PR-B): added 'mon-nudge' and 'wed-warning' phases for the
// Harvest-style escalation cadence (Mon gentle → Wed warning → Fri/end-of-month final).
export type TimesheetReminderPhase = 'mon-nudge' | 'wed-warning' | 'warning' | 'final'

interface ReminderTemplate {
    subject: string
    body: string
    tag: string
    accent: string
}

function buildReminderTemplate(
    phase: TimesheetReminderPhase,
    monthLabel: string,
    recipientName: string,
): ReminderTemplate {
    if (phase === 'mon-nudge') {
        return {
            subject: `[COMPASS HR] Hej, pamiętaj o timesheet ${monthLabel}`,
            body: `
                <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
                <p style="color: #d1d5db; font-size: 14px;">
                    Krótka notka — w tym miesiącu nie złożyłeś jeszcze timesheetu za
                    <strong>${monthLabel}</strong>. Smart Work Clock przygotował już draft
                    z trackingu, więc wystarczy go przejrzeć i zatwierdzić.
                </p>
                <p style="color: #d1d5db; font-size: 14px;">
                    Bez stresu — pełny termin jest do 5. dnia kolejnego miesiąca.
                </p>
            `,
            tag: 'Hej, pamiętaj',
            accent: '#3b82f6',
        }
    }
    if (phase === 'wed-warning') {
        return {
            subject: `[COMPASS HR] Przypomnienie: timesheet ${monthLabel} (termin za 3 dni)`,
            body: `
                <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
                <p style="color: #d1d5db; font-size: 14px;">
                    Przypominamy: timesheet za <strong>${monthLabel}</strong> ma być złożony
                    do końca tygodnia (5. dnia kolejnego miesiąca). Otwórz <strong>Timesheet</strong>,
                    przejrzyj draft z trackingu i kliknij <em>Złóż</em>.
                </p>
            `,
            tag: 'Termin za 3 dni',
            accent: '#f59e0b',
        }
    }
    if (phase === 'final') {
        return {
            subject: `[COMPASS HR] OSTATNIA SZANSA: timesheet ${monthLabel}`,
            body: `
                <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
                <p style="color: #d1d5db; font-size: 14px;">
                    <strong style="color: #ef4444;">Ostatnia szansa</strong> na złożenie timesheetu za
                    <strong>${monthLabel}</strong>. Bez zaakceptowanego timesheetu naliczenie wynagrodzenia
                    za ten miesiąc nie nastąpi.
                </p>
                <p style="color: #d1d5db; font-size: 14px;">
                    Otwórz <strong>Timesheet → ${monthLabel}</strong>, uzupełnij wpisy i kliknij
                    „Złóż timesheet" jak najszybciej.
                </p>
            `,
            tag: 'OSTATNIA SZANSA',
            accent: '#ef4444',
        }
    }
    // default: warning (legacy 25-of-month reminder)
    return {
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
    }
}

export async function sendTimesheetReminder(
    recipientEmail: string,
    recipientName: string,
    year: number,
    month: number,
    phase: TimesheetReminderPhase = 'warning',
): Promise<{ success: boolean }> {
    const monthLabel = `${year}-${String(month).padStart(2, '0')}`
    const tpl = buildReminderTemplate(phase, monthLabel, recipientName)
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject: tpl.subject,
            html: wrapHrEmail({
                tag: tpl.tag,
                heading: tpl.subject,
                bodyHtml: tpl.body,
                accent: tpl.accent,
            }),
        })
        if (error) {
            logCompat.error('Resend timesheet-reminder error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Timesheet-reminder email failed:', err)
        return { success: false }
    }
}

// ─── Phase 17b R11 (PR-C1): Daily personal summary email (RescueTime style) ──

export interface ClockDailySummary {
    workDate: string
    activeHours: number
    sessionCount: number
    /** First clock-in (local time formatted) */
    firstClockIn: string | null
    /** Last clock-out (local time formatted) */
    lastClockOut: string | null
    /** Peak 60-min window (formatted "10:00-11:00") if found */
    peakWindowLabel: string | null
    /** Number of pauses recorded */
    pauseCount: number
    /** Total minutes spent in explicit pauses */
    pauseMinutes: number
}

export async function sendClockDailySummary(
    recipientEmail: string,
    recipientName: string,
    summary: ClockDailySummary,
): Promise<{ success: boolean }> {
    const subject = `[COMPASS] Twoje wczoraj — ${summary.activeHours.toFixed(2)} h pracy (${summary.workDate})`
    const body = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Krótkie podsumowanie wczorajszego dnia pracy
            (<strong>${summary.workDate}</strong>):
        </p>
        <ul style="color: #d1d5db; font-size: 14px; line-height: 1.8;">
            <li><strong>Czas pracy:</strong> ${summary.activeHours.toFixed(2)} h</li>
            <li><strong>Liczba sesji:</strong> ${summary.sessionCount}</li>
            ${summary.firstClockIn ? `<li><strong>Pierwsze wejście:</strong> ${summary.firstClockIn}</li>` : ''}
            ${summary.lastClockOut ? `<li><strong>Ostatnie wyjście:</strong> ${summary.lastClockOut}</li>` : ''}
            ${summary.peakWindowLabel ? `<li><strong>Szczyt aktywności:</strong> ${summary.peakWindowLabel}</li>` : ''}
            ${summary.pauseCount > 0 ? `<li><strong>Pauzy:</strong> ${summary.pauseCount} (łącznie ${summary.pauseMinutes} min)</li>` : ''}
        </ul>
        <p style="color: #6b7280; font-size: 12px; margin-top: 16px;">
            Te dane są <strong>tylko dla Ciebie</strong> — admin nie widzi szczegółowej
            aktywności, tylko sumę godzin w timesheet. Możesz wyłączyć podsumowanie
            dzienne w ustawieniach (Profil → Preferencje powiadomień).
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            html: wrapHrEmail({
                tag: 'Daily summary',
                heading: subject,
                bodyHtml: body,
                accent: '#3b82f6',
            }),
        })
        if (error) {
            logCompat.error('Resend clock-daily-summary error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Clock-daily-summary email failed:', err)
        return { success: false }
    }
}

// ─── Phase 17: Smart Work Clock email templates ─────────────────────────────

const CLOCK_AUTO_STOP_REASON_LABEL: Record<string, string> = {
    idle_timeout: 'wykryto bezczynność powyżej 60 minut',
    daily_cutoff: 'minęło 16 godzin od rozpoczęcia',
    sleep_detected: 'urządzenie weszło w tryb uśpienia',
    taken_over: 'sesja została przejęta na innym urządzeniu',
    admin_close: 'administrator zamknął sesję',
}

export async function sendClockAutoStopped(
    recipientEmail: string,
    recipientName: string,
    reason: string,
    activeHours: number,
): Promise<{ success: boolean }> {
    const reasonLabel = CLOCK_AUTO_STOP_REASON_LABEL[reason] ?? reason
    const subject = '[COMPASS HR] Sesja pracy zamknięta automatycznie'
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Twoja aktywna sesja pracy została zamknięta automatycznie, ponieważ ${reasonLabel}.
        </p>
        <ul style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
            <li><strong>Zarejestrowany czas pracy:</strong> ${activeHours.toFixed(2)} h</li>
        </ul>
        <p style="color: #d1d5db; font-size: 14px;">
            Sprawdź szczegóły w sekcji <strong>Strefa wewnętrzna → Zegar</strong>.
            Jeśli auto-zamknięcie było błędne, możesz manualnie wpisać brakujące godziny w timesheet
            (zostaną oflagowane jako wymagające akceptacji administratora).
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            html: wrapHrEmail({ tag: 'Auto-zamknięcie sesji', heading: subject, bodyHtml, accent: '#f59e0b' }),
        })
        if (error) {
            logCompat.error('Resend clock-auto-stop error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Clock auto-stop email failed:', err)
        return { success: false }
    }
}

export async function sendCorrectionDecision(
    recipientEmail: string,
    recipientName: string,
    decision: 'approved' | 'rejected',
    workDate: string,
    declaredHours: number,
    trackedHours: number | null,
    note?: string | null,
): Promise<{ success: boolean }> {
    const isApproved = decision === 'approved'
    const subject = isApproved
        ? `[COMPASS HR] Korekta godzin zaakceptowana — ${workDate}`
        : `[COMPASS HR] Korekta godzin odrzucona — ${workDate}`
    const accent = isApproved ? '#22c55e' : '#f59e0b'
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Twoja korekta godzin pracy z dnia <strong>${workDate}</strong> została
            <strong>${isApproved ? 'zaakceptowana' : 'odrzucona'}</strong> przez administratora.
        </p>
        <ul style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
            <li><strong>Zadeklarowane:</strong> ${declaredHours.toFixed(2)} h</li>
            ${trackedHours != null ? `<li><strong>Z trackingu:</strong> ${trackedHours.toFixed(2)} h</li>` : ''}
        </ul>
        ${note ? `<p style="color: #d1d5db; font-size: 14px;"><strong>Komentarz admina:</strong> ${note}</p>` : ''}
        ${!isApproved ? `<p style="color: #d1d5db; font-size: 14px;">Wpis godzin zostanie przywrócony do wartości z trackingu. Możesz złożyć poprawiony timesheet.</p>` : ''}
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            saveToSentItems: true, // compliance: correction approve/reject audit trail
            html: wrapHrEmail({ tag: 'Decyzja: korekta godzin', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            logCompat.error('Resend correction-decision error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Correction-decision email failed:', err)
        return { success: false }
    }
}

// ─── Phase 22: Lifecycle module emails ────────────────────────────────────

const COMPASS_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://compass.dynaminds.pl'

/**
 * Phase 22 — Welcome email after onboarding bootstrap.
 * Sent immediately after start_onboarding_for_user() creates progress + tasks.
 */
export async function sendOnboardingWelcome(
    recipientEmail: string,
    recipientName: string,
    progressId: string,
    roleLabel: string,
): Promise<{ success: boolean }> {
    const subject = `[COMPASS] Witamy w B2B Network — Twój onboarding jest gotowy`
    const link = `${COMPASS_APP_URL}/internal/lifecycle/onboarding/${progressId}`
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Witamy w zespole B2B Network jako <strong>${roleLabel}</strong>! Przygotowaliśmy dla Ciebie checklist onboardingu — zadania pomogą Ci sprawnie wystartować przez najbliższe 30 dni.
        </p>
        <p style="color: #d1d5db; font-size: 14px;">Co dalej:</p>
        <ul style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
            <li>Otwórz swój checklist i zapoznaj się z zadaniami</li>
            <li>Niektóre zadania wymagają wgrania dokumentów (kontrakt, NDA)</li>
            <li>Inne to kursy w Akademii — kliknij linki w checkliście</li>
            <li>Spotkasz się z managerem (intro meeting) i buddy</li>
        </ul>
        <p style="text-align: center; margin: 24px 0;">
            <a href="${link}" style="background: #22d3ee; color: #0a0a0a; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Otwórz checklist onboardingu</a>
        </p>
        <p style="color: #6b7280; font-size: 12px;">Jeśli masz pytania, skontaktuj się z Talent Community Managerem lub swoim managerem.</p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            saveToSentItems: true,
            html: wrapHrEmail({ tag: 'Onboarding', heading: subject, bodyHtml, accent: '#22d3ee' }),
        })
        if (error) {
            logCompat.error('Resend onboarding-welcome error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Onboarding-welcome email failed:', err)
        return { success: false }
    }
}

/**
 * Phase 22 — Day 1 / 7 / 30 check-in mini-survey reminder.
 */
export async function sendOnboardingDayCheckin(
    recipientEmail: string,
    recipientName: string,
    progressId: string,
    day: 1 | 7 | 30,
): Promise<{ success: boolean }> {
    const subject = `[COMPASS] Jak Ci się pracuje? Mini-ankieta po ${day} ${day === 1 ? 'dniu' : 'dniach'}`
    const link = `${COMPASS_APP_URL}/internal/lifecycle/onboarding/${progressId}?checkin=${day}`
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Minął ${day === 1 ? 'pierwszy dzień' : day === 7 ? 'pierwszy tydzień' : 'pierwszy miesiąc'} pracy. Poświęć 30 sekund i powiedz, jak Ci się układa — Twoja opinia pomaga nam ulepszać onboarding.
        </p>
        <p style="text-align: center; margin: 24px 0;">
            <a href="${link}" style="background: #3A8DFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Wypełnij mini-ankietę</a>
        </p>
        <p style="color: #6b7280; font-size: 12px;">Skala 1-5 + opcjonalny komentarz. Bez konsekwencji.</p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            html: wrapHrEmail({ tag: `Check-in dzień ${day}`, heading: subject, bodyHtml }),
        })
        if (error) {
            logCompat.error(`Resend onboarding-checkin-${day} error:`, error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Onboarding-checkin email failed:', err)
        return { success: false }
    }
}

/**
 * Phase 22 — Manager reminder for overdue onboarding tasks of their team members.
 */
export async function sendOnboardingReminderToManager(
    managerEmail: string,
    managerName: string,
    employeeName: string,
    overdueTasks: Array<{ title: string; dueDate: string }>,
    progressId: string,
): Promise<{ success: boolean }> {
    if (overdueTasks.length === 0) return { success: true }
    const subject = `[COMPASS HR] Przeterminowane zadania onboardingu — ${employeeName}`
    const link = `${COMPASS_APP_URL}/internal/lifecycle/onboarding/${progressId}`
    const itemsHtml = overdueTasks
        .map((t) => `<li><strong>${t.title}</strong> (termin: ${t.dueDate})</li>`)
        .join('')
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${managerName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Twój team-member <strong>${employeeName}</strong> ma przeterminowane zadania onboardingu — niektóre są na Twojej liście:
        </p>
        <ul style="color: #d1d5db; font-size: 14px; line-height: 1.6;">${itemsHtml}</ul>
        <p style="text-align: center; margin: 24px 0;">
            <a href="${link}" style="background: #f59e0b; color: #0a0a0a; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Otwórz onboarding</a>
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: managerEmail,
            subject,
            html: wrapHrEmail({ tag: 'Przypomnienie onboarding', heading: subject, bodyHtml, accent: '#f59e0b' }),
        })
        if (error) {
            logCompat.error('Resend onboarding-reminder error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Onboarding-reminder email failed:', err)
        return { success: false }
    }
}

/**
 * Phase 22 — Exit interview invitation (sent when offboarding starts).
 */
export async function sendExitInterviewInvitation(
    recipientEmail: string,
    recipientName: string,
    scheduledFor: string,
    interviewId: string,
): Promise<{ success: boolean }> {
    const subject = `[COMPASS] Exit interview — zapraszamy do wypełnienia ankiety`
    const link = `${COMPASS_APP_URL}/internal/lifecycle/exit/wypelnij`
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Dziękujemy za czas spędzony w B2B Network. Przed Twoim odejściem chcielibyśmy poprosić o wypełnienie krótkiej ankiety exit interview — Twoja szczera opinia pomoże nam stać się lepszą firmą.
        </p>
        <p style="color: #d1d5db; font-size: 14px;">
            Sugerowany termin wypełnienia: <strong>${scheduledFor}</strong>
        </p>
        <p style="color: #d1d5db; font-size: 14px;">
            Możesz wypełnić ankietę z imienia i nazwiska <strong>lub anonimowo</strong> (checkbox na końcu formularza).
        </p>
        <p style="text-align: center; margin: 24px 0;">
            <a href="${link}" style="background: #3A8DFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Wypełnij exit interview</a>
        </p>
        <p style="color: #6b7280; font-size: 11px;">Interview ID: ${interviewId}</p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            saveToSentItems: true,
            html: wrapHrEmail({ tag: 'Exit interview', heading: subject, bodyHtml }),
        })
        if (error) {
            logCompat.error('Resend exit-invitation error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Exit-invitation email failed:', err)
        return { success: false }
    }
}

/**
 * Phase 22 — Exit interview reminder (3 days before termination if still unsubmitted).
 */
export async function sendExitInterviewReminder(
    recipientEmail: string,
    recipientName: string,
    terminationDate: string,
): Promise<{ success: boolean }> {
    const subject = `[COMPASS] Przypomnienie: wypełnij exit interview`
    const link = `${COMPASS_APP_URL}/internal/lifecycle/exit/wypelnij`
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Twoja data zakończenia współpracy: <strong>${terminationDate}</strong>. Nie wypełniłaś/eś jeszcze exit interview — to ostatnia szansa, by podzielić się opinią.
        </p>
        <p style="text-align: center; margin: 24px 0;">
            <a href="${link}" style="background: #f59e0b; color: #0a0a0a; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Wypełnij teraz</a>
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            html: wrapHrEmail({ tag: 'Przypomnienie exit', heading: subject, bodyHtml, accent: '#f59e0b' }),
        })
        if (error) {
            logCompat.error('Resend exit-reminder error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Exit-reminder email failed:', err)
        return { success: false }
    }
}

/**
 * Phase 22 — Offboarding checklist notification to manager.
 */
export async function sendOffboardingChecklistToManager(
    managerEmail: string,
    managerName: string,
    employeeName: string,
    terminationDate: string,
    userId: string,
): Promise<{ success: boolean }> {
    const subject = `[COMPASS HR] Offboarding zespołu — ${employeeName}`
    const link = `${COMPASS_APP_URL}/internal/lifecycle/offboarding/${userId}`
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${managerName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Twój team-member <strong>${employeeName}</strong> wchodzi w proces offboardingu. Data zakończenia: <strong>${terminationDate}</strong>.
        </p>
        <p style="color: #d1d5db; font-size: 14px;">Twoje zadania na liście:</p>
        <ul style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
            <li>Zwrot sprzętu firmowego (laptop, monitor, akcesoria)</li>
            <li>Knowledge transfer — koordynacja przekazywania projektów</li>
            <li>Spotkanie pożegnalne z zespołem</li>
        </ul>
        <p style="text-align: center; margin: 24px 0;">
            <a href="${link}" style="background: #3A8DFF; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Otwórz checklist offboardingu</a>
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: managerEmail,
            subject,
            saveToSentItems: true,
            html: wrapHrEmail({ tag: 'Offboarding', heading: subject, bodyHtml }),
        })
        if (error) {
            logCompat.error('Resend offboarding-checklist error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Offboarding-checklist email failed:', err)
        return { success: false }
    }
}

/**
 * Phase 23 — Email do pracownika gdy manager doda mu nową premię.
 * Pracownik powinien uwzględnić premię w fakturze (Phase 19/20 flow), potem
 * zlinkować przez UI w /internal?tab=bonuses (status → paid).
 */
export async function sendBonusProposed(
    recipientEmail: string,
    recipientName: string,
    proposerName: string,
    amount: number,
    currency: string,
    reason: string,
): Promise<{ success: boolean }> {
    const subject = `[COMPASS] Nowa premia ${amount.toFixed(2)} ${currency} — uwzględnij w fakturze`
    const accent = '#22c55e'
    const reasonEscaped = reason.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            ${proposerName} przyznał Ci premię: <strong>${amount.toFixed(2)} ${currency}</strong>.
        </p>
        <p style="color: #d1d5db; font-size: 14px;"><strong>Powód:</strong> ${reasonEscaped}</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Uwzględnij tę premię w fakturze za bieżący okres (jako osobna pozycja lub osobna faktura),
            a następnie zlinkuj ją w panelu <strong>Moje premie</strong>:
            <a href="https://compass.dynaminds.pl/internal?tab=bonuses" style="color: #93c5fd;">/internal?tab=bonuses</a>.
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            saveToSentItems: true,
            html: wrapHrEmail({ tag: 'Nowa premia', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            logCompat.error('Resend bonus-proposed error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Bonus-proposed email failed:', err)
        return { success: false }
    }
}

/**
 * Phase 23 — Email do pracownika gdy manager (lub admin) anuluje pending premię.
 */
export async function sendBonusCancelled(
    recipientEmail: string,
    recipientName: string,
    proposerName: string,
    amount: number,
    currency: string,
    cancellationReason: string,
): Promise<{ success: boolean }> {
    const subject = `[COMPASS] Premia ${amount.toFixed(2)} ${currency} została anulowana`
    const accent = '#f59e0b'
    const reasonEscaped = cancellationReason.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            ${proposerName} anulował premię w wysokości <strong>${amount.toFixed(2)} ${currency}</strong>.
        </p>
        <p style="color: #d1d5db; font-size: 14px;"><strong>Powód anulowania:</strong> ${reasonEscaped}</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Jeśli masz pytania — skontaktuj się bezpośrednio z osobą, która anulowała premię.
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            saveToSentItems: true,
            html: wrapHrEmail({ tag: 'Premia anulowana', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            logCompat.error('Resend bonus-cancelled error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Bonus-cancelled email failed:', err)
        return { success: false }
    }
}

const BONUS_MONTH_NAMES_PL = [
    'styczeń', 'luty', 'marzec', 'kwiecień', 'maj', 'czerwiec',
    'lipiec', 'sierpień', 'wrzesień', 'październik', 'listopad', 'grudzień',
] as const

function formatBonusPeriodPl(year: number, month: number): string {
    const idx = Math.max(0, Math.min(11, month - 1))
    return `${BONUS_MONTH_NAMES_PL[idx]} ${year}`
}

/**
 * Phase 26 — Email do pracownika gdy manager przypisuje mu premię z auto-akceptem.
 * Bonus jest od razu w stanie terminalnym 'assigned' — bez wymogu linkowania z fakturą.
 */
export async function sendBonusAssigned(
    recipientEmail: string,
    recipientName: string,
    proposerName: string,
    amount: number,
    currency: string,
    periodYear: number,
    periodMonth: number,
    reason: string,
): Promise<{ success: boolean }> {
    const periodLabel = formatBonusPeriodPl(periodYear, periodMonth)
    const subject = `[COMPASS] Premia ${amount.toFixed(2)} ${currency} za ${periodLabel}`
    const accent = '#22c55e'
    const reasonEscaped = reason.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            ${proposerName} przyznał Ci premię w wysokości <strong>${amount.toFixed(2)} ${currency}</strong>
            za okres <strong>${periodLabel}</strong>.
        </p>
        <p style="color: #d1d5db; font-size: 14px;"><strong>Uzasadnienie:</strong> ${reasonEscaped}</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Premia jest już zatwierdzona. Pełną listę swoich premii zobaczysz w panelu:
            <a href="https://compass.dynaminds.pl/internal?tab=bonuses" style="color: #93c5fd;">Moje premie</a>.
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            saveToSentItems: true,
            html: wrapHrEmail({ tag: 'Nowa premia', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            logCompat.error('Resend bonus-assigned error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Bonus-assigned email failed:', err)
        return { success: false }
    }
}

/**
 * Phase 26 — Email do pracownika gdy manager edytuje przypisaną premię
 * (zmiana kwoty lub uzasadnienia).
 */
export async function sendBonusUpdated(
    recipientEmail: string,
    recipientName: string,
    proposerName: string,
    amount: number,
    currency: string,
    periodYear: number,
    periodMonth: number,
    reason: string,
    changesSummary?: string,
): Promise<{ success: boolean }> {
    const periodLabel = formatBonusPeriodPl(periodYear, periodMonth)
    const subject = `[COMPASS] Zaktualizowano premię za ${periodLabel}`
    const accent = '#3b82f6'
    const reasonEscaped = reason.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const changesEscaped = (changesSummary ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const changesBlock = changesEscaped
        ? `<p style="color: #d1d5db; font-size: 14px;"><strong>Zmiany:</strong> ${changesEscaped}</p>`
        : ''
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            ${proposerName} zaktualizował premię za <strong>${periodLabel}</strong>.
            Aktualna kwota: <strong>${amount.toFixed(2)} ${currency}</strong>.
        </p>
        ${changesBlock}
        <p style="color: #d1d5db; font-size: 14px;"><strong>Uzasadnienie:</strong> ${reasonEscaped}</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Zobacz w panelu:
            <a href="https://compass.dynaminds.pl/internal?tab=bonuses" style="color: #93c5fd;">Moje premie</a>.
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            saveToSentItems: true,
            html: wrapHrEmail({ tag: 'Premia zaktualizowana', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            logCompat.error('Resend bonus-updated error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Bonus-updated email failed:', err)
        return { success: false }
    }
}

// ─── Phase 31 — Champions League (premia kwartalna, manualna) ─────────────

const CHAMPIONS_LEAGUE_PLACE_LABELS_PL_EMAIL: Record<1 | 2 | 3, string> = {
    1: '🥇 1. miejsce',
    2: '🥈 2. miejsce',
    3: '🥉 3. miejsce',
}

function formatQuarterLabelPl(year: number, quarter: 1 | 2 | 3 | 4): string {
    return `Q${quarter} ${year}`
}

/**
 * Phase 31 — Email do zwycięzcy Champions League.
 * Accent złoty (#EAB308 — yellow-500) wyróżnia od standardowych premii Phase 26.
 */
export async function sendChampionsLeagueAssigned(
    recipientEmail: string,
    recipientName: string,
    proposerName: string,
    amount: number,
    currency: string,
    periodYear: number,
    periodQuarter: 1 | 2 | 3 | 4,
    placeRank: 1 | 2 | 3,
    reason: string,
): Promise<{ success: boolean }> {
    const quarterLabel = formatQuarterLabelPl(periodYear, periodQuarter)
    const placeLabel = CHAMPIONS_LEAGUE_PLACE_LABELS_PL_EMAIL[placeRank]
    const subject = `[COMPASS] 🏆 Champions League ${quarterLabel} — ${placeLabel}`
    const accent = '#EAB308' // yellow-500 (trofeum/złoto)
    const reasonEscaped = reason.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Gratulacje <strong>${recipientName}</strong>! 🎉</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Zająłeś <strong>${placeLabel}</strong> w Champions League za <strong>${quarterLabel}</strong>.
            Nagroda: <strong style="color: #EAB308; font-size: 16px;">${amount.toFixed(2)} ${currency}</strong>.
        </p>
        <p style="color: #d1d5db; font-size: 14px;"><strong>Uzasadnienie od ${proposerName}:</strong> ${reasonEscaped}</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Premia jest już zatwierdzona — zobaczysz ją w panelu:
            <a href="https://compass.dynaminds.pl/internal?tab=bonuses" style="color: #93c5fd;">Moje premie</a>.
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            saveToSentItems: true,
            html: wrapHrEmail({ tag: 'Champions League', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            logCompat.error('Resend champions-league-assigned error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Champions-league-assigned email failed:', err)
        return { success: false }
    }
}

/**
 * Phase 31 — Email do pracownika gdy admin/manager anuluje premię Champions League.
 * Accent czerwony (#ef4444) sygnalizuje cancellation.
 */
export async function sendChampionsLeagueCancelled(
    recipientEmail: string,
    recipientName: string,
    proposerName: string,
    amount: number,
    currency: string,
    periodYear: number,
    periodQuarter: 1 | 2 | 3 | 4,
    placeRank: 1 | 2 | 3,
    cancellationReason: string,
): Promise<{ success: boolean }> {
    const quarterLabel = formatQuarterLabelPl(periodYear, periodQuarter)
    const placeLabel = CHAMPIONS_LEAGUE_PLACE_LABELS_PL_EMAIL[placeRank]
    const subject = `[COMPASS] Anulowano premię Champions League ${quarterLabel} — ${placeLabel}`
    const accent = '#ef4444'
    const reasonEscaped = cancellationReason.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            ${proposerName} anulował przyznaną Ci premię Champions League za <strong>${quarterLabel}</strong>
            (${placeLabel}, kwota ${amount.toFixed(2)} ${currency}).
        </p>
        <p style="color: #d1d5db; font-size: 14px;"><strong>Powód:</strong> ${reasonEscaped}</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Jeśli masz pytania, skontaktuj się z ${proposerName}.
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            saveToSentItems: true,
            html: wrapHrEmail({ tag: 'Anulowano premię', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            logCompat.error('Resend champions-league-cancelled error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Champions-league-cancelled email failed:', err)
        return { success: false }
    }
}

// ─── Phase 27c — User rate change notifications ───────────────────────────

/**
 * Phase 27c — Email do pracownika gdy finanse/admin zmieni jego stawkę godzinową.
 * Wysłane jednorazowo per INSERT do user_rates. Pracownik widzi nową stawkę + datę
 * wejścia w życie (zawsze 1. dnia przyszłego miesiąca lub później).
 */
export async function sendRateChanged(args: {
    recipientEmail: string
    recipientName: string
    oldRate: number | null
    newRate: number
    currency: string
    effectiveFrom: string // YYYY-MM-DD
    setByName: string
    reason?: string | null
}): Promise<{ success: boolean }> {
    const subject = `[COMPASS] Zmiana stawki godzinowej — od ${args.effectiveFrom}`
    const accent = '#22c55e'
    const reasonEscaped = (args.reason ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const reasonBlock = reasonEscaped
        ? `<p style="color: #d1d5db; font-size: 14px;"><strong>Notatka:</strong> ${reasonEscaped}</p>`
        : ''
    const oldRateLine = args.oldRate != null
        ? `<p style="color: #9ca3af; font-size: 13px;">Poprzednia stawka: ${args.oldRate.toFixed(2)} ${args.currency}/h</p>`
        : '<p style="color: #9ca3af; font-size: 13px;">To Twoja pierwsza zarejestrowana stawka.</p>'
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${args.recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            ${args.setByName} ustawił Twoją stawkę godzinową na <strong>${args.newRate.toFixed(2)} ${args.currency}/h</strong>,
            obowiązującą od <strong>${args.effectiveFrom}</strong>.
        </p>
        ${oldRateLine}
        ${reasonBlock}
        <p style="color: #d1d5db; font-size: 14px;">
            Zobacz swoje rozliczenie miesięczne (godziny × stawka + premie):
            <a href="https://compass.dynaminds.pl/internal/payroll" style="color: #93c5fd;">Payroll</a>.
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: args.recipientEmail,
            subject,
            saveToSentItems: true,
            html: wrapHrEmail({ tag: 'Stawka', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            logCompat.error('Resend rate-changed (employee) error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Rate-changed (employee) email failed:', err)
        return { success: false }
    }
}

/**
 * Phase 27c — Broadcast do finanse + admin gdy ktoś ustawi stawkę pracownikowi.
 * Pomaga finanse synchronizować payroll mimo że zmianę zrobił admin (lub odwrotnie).
 */
export async function sendRateChangedToFinance(args: {
    recipientEmail: string
    targetName: string
    targetEmail: string
    oldRate: number | null
    newRate: number
    currency: string
    effectiveFrom: string
    setByName: string
}): Promise<{ success: boolean }> {
    const subject = `[COMPASS] Zmiana stawki: ${args.targetName} → ${args.newRate.toFixed(2)} ${args.currency}/h`
    const accent = '#3b82f6'
    const oldRateLine = args.oldRate != null
        ? `<p style="color: #d1d5db; font-size: 13px;">Poprzednia stawka: <strong>${args.oldRate.toFixed(2)} ${args.currency}/h</strong></p>`
        : '<p style="color: #d1d5db; font-size: 13px;">Pierwsza zarejestrowana stawka tego pracownika.</p>'
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">
            ${args.setByName} ustawił stawkę dla <strong>${args.targetName}</strong> (${args.targetEmail}).
        </p>
        <p style="color: #d1d5db; font-size: 14px;">
            Nowa stawka: <strong>${args.newRate.toFixed(2)} ${args.currency}/h</strong> od <strong>${args.effectiveFrom}</strong>.
        </p>
        ${oldRateLine}
        <p style="color: #d1d5db; font-size: 14px;">
            Zobacz rozliczenie pracownika:
            <a href="https://compass.dynaminds.pl/internal/admin/rates" style="color: #93c5fd;">Stawki</a>.
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'COMPASS System <noreply@compass.b2bnetwork.pl>',
            to: args.recipientEmail,
            subject,
            saveToSentItems: true,
            html: wrapHrEmail({ tag: 'Stawka — payroll', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            logCompat.error('Resend rate-changed (finance) error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        logCompat.error('Rate-changed (finance) email failed:', err)
        return { success: false }
    }
}
