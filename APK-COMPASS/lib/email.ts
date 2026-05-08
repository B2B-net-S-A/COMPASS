import { Resend } from 'resend'
import { logger } from '@/lib/logger'

let _resend: Resend | null = null
function getResend(): Resend {
    if (!_resend) {
        _resend = new Resend(process.env.RESEND_API_KEY)
    }
    return _resend
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
    try {
        const { error } = await getResend().emails.send({
            from: 'ComPass System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject: `[SPRZĘT] Nowe zgłoszenie od ${data.userName}`,
            html: `
                <h2>Nowe zgłoszenie sprzętowe</h2>
                <p><strong>Użytkownik:</strong> ${data.userName} (${data.userEmail})</p>
                <p><strong>Typ:</strong> ${data.itemName}</p>
                <p><strong>Kategoria:</strong> ${data.category}</p>
                <p><strong>ID zgłoszenia:</strong> ${data.requestId}</p>
                <hr />
                <h3>Szczegóły:</h3>
                <pre>${data.details}</pre>
                <hr />
                <p><em>Wiadomość wygenerowana automatycznie przez system ComPass</em></p>
            `,
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

    try {
        const { error } = await getResend().emails.send({
            from: 'ComPass System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject: `[BENEFITY] Nowa deklaracja od ${data.userName}`,
            html: `
                <h2>Nowa deklaracja benefitowa</h2>
                <p><strong>Użytkownik:</strong> ${data.userName} (${data.userEmail})</p>
                <p><strong>Typ benefitu:</strong> ${benefitTypeLabel}</p>
                <p><strong>Wybrany wariant:</strong> ${data.variantName}</p>
                <p><strong>ID deklaracji:</strong> ${data.declarationId}</p>
                <hr />
                <p><em>Wiadomość wygenerowana automatycznie przez system ComPass</em></p>
            `,
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
        ? `Zostałeś dodany do Centrali B2B.net jako <strong>${roleLabel}</strong>.<br/><br/>Aby aktywować nowe uprawnienia, <strong>wyloguj się i zaloguj ponownie</strong> do aplikacji ComPass.`
        : `Twoja rola w Centrali została odebrana. Po ponownym zalogowaniu powrócisz do roli Konsultanta.<br/><br/>Jeśli uważasz, że to błąd, skontaktuj się z administratorem systemu.`

    const accentColor = isAdded ? '#3A8DFF' : '#f59e0b'

    try {
        const { error } = await getResend().emails.send({
            from: 'ComPass System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #0e4d6e, #1a1a2e); padding: 24px 32px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <h1 style="color: #22d3ee; font-size: 20px; margin: 0;">ComPass</h1>
                    </div>
                    <div style="padding: 32px;">
                        <div style="background: rgba(58, 141, 255, 0.08); border: 1px solid ${accentColor}33; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                            <p style="color: ${accentColor}; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0; font-weight: bold;">Zmiana roli</p>
                            <h2 style="color: #ffffff; font-size: 18px; margin: 0;">${heading}</h2>
                        </div>
                        <p style="color: #d1d5db; font-size: 14px; line-height: 1.6;">Cześć <strong>${recipientName}</strong>,</p>
                        <p style="color: #d1d5db; font-size: 14px; line-height: 1.6;">${body}</p>
                        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 24px 0;" />
                        <p style="color: #6b7280; font-size: 11px; margin-top: 16px;">
                            Wiadomość wygenerowana automatycznie przez system ComPass.
                        </p>
                    </div>
                </div>
            `,
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
            from: 'ComPass System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject: `[COMPASS] ${title}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #0e4d6e, #1a1a2e); padding: 24px 32px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <h1 style="color: #22d3ee; font-size: 20px; margin: 0;">ComPass</h1>
                    </div>
                    <div style="padding: 32px;">
                        <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                            <p style="color: #fbbf24; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0; font-weight: bold;">Ogłoszenie</p>
                            <h2 style="color: #ffffff; font-size: 18px; margin: 0;">${title}</h2>
                        </div>
                        <div style="color: #d1d5db; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${content}</div>
                        <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 24px 0;" />
                        <p style="color: #6b7280; font-size: 12px; margin: 0;">Nadawca: <strong>${senderName}</strong></p>
                        <p style="color: #6b7280; font-size: 11px; margin-top: 16px;">
                            Wiadomość wygenerowana automatycznie przez system ComPass.
                        </p>
                    </div>
                </div>
            `,
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

const HR_LEAVE_TYPE_LABEL: Record<string, string> = {
    vacation: 'Urlop wypoczynkowy',
    sick_leave: 'L4 / chorobowe',
    parental_leave: 'Opieka rodzicielska',
    unpaid_leave: 'Urlop bezpłatny',
    training: 'Szkolenie',
    other: 'Inne',
}

function wrapHrEmail(opts: { tag: string; heading: string; bodyHtml: string; accent?: string }): string {
    const accent = opts.accent ?? '#3A8DFF'
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #0e4d6e, #1a1a2e); padding: 24px 32px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <h1 style="color: #22d3ee; font-size: 20px; margin: 0;">ComPass</h1>
            </div>
            <div style="padding: 32px;">
                <div style="background: rgba(58, 141, 255, 0.08); border: 1px solid ${accent}33; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                    <p style="color: ${accent}; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0; font-weight: bold;">${opts.tag}</p>
                    <h2 style="color: #ffffff; font-size: 18px; margin: 0;">${opts.heading}</h2>
                </div>
                ${opts.bodyHtml}
                <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 24px 0;" />
                <p style="color: #6b7280; font-size: 11px; margin-top: 16px;">
                    Wiadomość wygenerowana automatycznie przez system ComPass.
                </p>
            </div>
        </div>
    `
}

export async function sendLeaveRequestSubmitted(
    recipientEmails: string[],
    requesterName: string,
    leaveType: string,
    startDate: string,
    endDate: string,
    note: string | null,
): Promise<{ success: boolean }> {
    if (recipientEmails.length === 0) return { success: true }
    const typeLabel = HR_LEAVE_TYPE_LABEL[leaveType] ?? leaveType
    const subject = `[COMPASS HR] Nowy wniosek urlopowy — ${requesterName}`
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">${requesterName} złożył wniosek urlopowy do akceptacji:</p>
        <ul style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
            <li><strong>Typ:</strong> ${typeLabel}</li>
            <li><strong>Od:</strong> ${startDate}</li>
            <li><strong>Do:</strong> ${endDate}</li>
            ${note ? `<li><strong>Notatka:</strong> ${note}</li>` : ''}
        </ul>
        <p style="color: #d1d5db; font-size: 14px;">Zaakceptuj/odrzuć w panelu administracyjnym.</p>
    `
    const html = wrapHrEmail({ tag: 'Nowy wniosek urlopowy', heading: subject, bodyHtml })

    try {
        for (const to of recipientEmails) {
            const { error } = await getResend().emails.send({
                from: 'ComPass System <noreply@compass.b2bnetwork.pl>',
                to,
                subject,
                html,
            })
            if (error) console.error('Resend leave-submitted error:', error)
        }
        return { success: true }
    } catch (err) {
        console.error('Leave-submitted email failed:', err)
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
            from: 'ComPass System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            html: wrapHrEmail({ tag: 'Decyzja urlopowa', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            console.error('Resend leave-decision error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        console.error('Leave-decision email failed:', err)
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
                from: 'ComPass System <noreply@compass.b2bnetwork.pl>',
                to,
                subject,
                html,
            })
            if (error) console.error('Resend timesheet-submitted error:', error)
        }
        return { success: true }
    } catch (err) {
        console.error('Timesheet-submitted email failed:', err)
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
            from: 'ComPass System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            html: wrapHrEmail({ tag: 'Decyzja timesheet', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            console.error('Resend timesheet-decision error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        console.error('Timesheet-decision email failed:', err)
        return { success: false }
    }
}

export async function sendTimesheetReminder(
    recipientEmail: string,
    recipientName: string,
    year: number,
    month: number,
): Promise<{ success: boolean }> {
    const subject = `[COMPASS HR] Przypomnienie: timesheet ${year}-${String(month).padStart(2, '0')}`
    const bodyHtml = `
        <p style="color: #d1d5db; font-size: 14px;">Cześć <strong>${recipientName}</strong>,</p>
        <p style="color: #d1d5db; font-size: 14px;">
            Przypominamy o złożeniu timesheetu za <strong>${year}-${String(month).padStart(2, '0')}</strong>.
            Wypełnij wpisy w sekcji <strong>Timesheet</strong> i kliknij „Złóż timesheet".
        </p>
    `
    try {
        const { error } = await getResend().emails.send({
            from: 'ComPass System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            html: wrapHrEmail({
                tag: 'Przypomnienie',
                heading: subject,
                bodyHtml,
                accent: '#f59e0b',
            }),
        })
        if (error) {
            console.error('Resend timesheet-reminder error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        console.error('Timesheet-reminder email failed:', err)
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
            from: 'ComPass System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            html: wrapHrEmail({ tag: 'Auto-zamknięcie sesji', heading: subject, bodyHtml, accent: '#f59e0b' }),
        })
        if (error) {
            console.error('Resend clock-auto-stop error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        console.error('Clock auto-stop email failed:', err)
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
            from: 'ComPass System <noreply@compass.b2bnetwork.pl>',
            to: recipientEmail,
            subject,
            html: wrapHrEmail({ tag: 'Decyzja: korekta godzin', heading: subject, bodyHtml, accent }),
        })
        if (error) {
            console.error('Resend correction-decision error:', error)
            return { success: false }
        }
        return { success: true }
    } catch (err) {
        console.error('Correction-decision email failed:', err)
        return { success: false }
    }
}
