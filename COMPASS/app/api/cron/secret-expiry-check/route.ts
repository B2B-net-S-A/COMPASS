import * as Sentry from '@sentry/nextjs'
import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/sender'
import { logger } from '@/lib/logger'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'

export const dynamic = 'force-dynamic'

// Threshold in days — alert this many days before secret expires.
const ALERT_THRESHOLD_DAYS = 30

interface AlertSummary {
    ok: boolean
    expiresAt: string | null
    daysLeft: number | null
    alertSent: boolean
    recipients: number
    error?: string
}

/**
 * Daily cron: checks AZURE_CLIENT_SECRET_EXPIRES_AT env (ISO date, e.g.
 * `2028-05-09`) and emits alerts when the secret is within
 * ALERT_THRESHOLD_DAYS of expiry.
 *
 * Without this alert, the Microsoft Graph secret silently expires → all
 * outbound email stops at the next deploy. The check is cheap (read env +
 * one date diff), so we run it daily.
 *
 * Coolify cron suggestion: `0 8 * * *` (08:00 UTC, weekday-agnostic).
 *
 * Auth: Bearer CRON_SECRET (same pattern as other crons).
 */
export const GET = withCronAuth(withCronHeartbeat('SECRET_EXPIRY_CHECK_RUN', async () => {
    const expiresAtRaw = process.env.AZURE_CLIENT_SECRET_EXPIRES_AT?.trim()

    if (!expiresAtRaw) {
        const summary: AlertSummary = {
            ok: false,
            expiresAt: null,
            daysLeft: null,
            alertSent: false,
            recipients: 0,
            error: 'AZURE_CLIENT_SECRET_EXPIRES_AT env not set',
        }
        logger.error({
            event: 'cron.secret_expiry.env_missing',
            msg: 'AZURE_CLIENT_SECRET_EXPIRES_AT not configured — cannot check Azure secret expiry',
        })
        // Audyt 2026-08: to była najcichsza z możliwych awarii — jedyny strażnik
        // sekretu Graph (bez niego przestaje działać CAŁA poczta wychodząca)
        // zwracał 200 i szedł spać. Zadanie, które nie potrafi wykonać swojej
        // jedynej pracy, musi krzyczeć kodem odpowiedzi i wpisem w Sentry;
        // heartbeat sam z siebie pokaże tylko, że przebieg „się odbył".
        Sentry.captureMessage('azure_secret_expiry_not_configured', {
            level: 'error',
            tags: { kind: 'cron_secret_expiry' },
        })
        return NextResponse.json(summary, { status: 500 })
    }

    const expiresAt = new Date(expiresAtRaw)
    if (Number.isNaN(expiresAt.getTime())) {
        const summary: AlertSummary = {
            ok: false,
            expiresAt: expiresAtRaw,
            daysLeft: null,
            alertSent: false,
            recipients: 0,
            error: `Invalid ISO date: ${expiresAtRaw}`,
        }
        logger.error({
            event: 'cron.secret_expiry.invalid_date',
            value: expiresAtRaw,
        })
        // Jak wyżej: zła data znaczy, że alarm nigdy nie zadziała.
        Sentry.captureMessage('azure_secret_expiry_invalid_date', {
            level: 'error',
            tags: { kind: 'cron_secret_expiry' },
            extra: { value: expiresAtRaw },
        })
        return NextResponse.json(summary, { status: 500 })
    }

    const now = new Date()
    const msPerDay = 24 * 60 * 60 * 1000
    const daysLeft = Math.floor((expiresAt.getTime() - now.getTime()) / msPerDay)

    // Within threshold? Time to alert.
    const shouldAlert = daysLeft <= ALERT_THRESHOLD_DAYS

    if (!shouldAlert) {
        logger.info({
            event: 'cron.secret_expiry.ok',
            daysLeft,
            expiresAt: expiresAt.toISOString(),
        })
        return NextResponse.json({
            ok: true,
            expiresAt: expiresAt.toISOString(),
            daysLeft,
            alertSent: false,
            recipients: 0,
        } satisfies AlertSummary)
    }

    // Send alert: log + Sentry + email to super admins
    const sev = daysLeft <= 7 ? 'critical' : daysLeft <= 14 ? 'high' : 'warning'

    logger.error({
        event: 'cron.secret_expiry.alert',
        severity: sev,
        daysLeft,
        expiresAt: expiresAt.toISOString(),
    })

    Sentry.captureMessage(
        `Azure client secret expires in ${daysLeft} days`,
        {
            level: daysLeft <= 7 ? 'error' : 'warning',
            tags: { severity: sev, kind: 'azure_secret_expiry' },
            extra: { expiresAt: expiresAt.toISOString(), daysLeft },
        },
    )

    const recipients = parseSuperAdmins()
    let sentCount = 0
    for (const to of recipients) {
        const result = await sendEmail({
            to,
            subject: `[Compass] Azure client secret wygasa za ${daysLeft} dni`,
            saveToSentItems: true,
            html: renderExpiryEmail({ daysLeft, expiresAt: expiresAt.toISOString(), severity: sev }),
        })
        if (result.success) sentCount++
    }

    return NextResponse.json({
        ok: true,
        expiresAt: expiresAt.toISOString(),
        daysLeft,
        alertSent: true,
        recipients: sentCount,
    } satisfies AlertSummary)
}))

function parseSuperAdmins(): string[] {
    const raw = process.env.SUPER_ADMIN_EMAILS ?? ''
    return raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
}

function renderExpiryEmail(opts: {
    daysLeft: number
    expiresAt: string
    severity: string
}): string {
    const { daysLeft, expiresAt, severity } = opts
    const sevColor = severity === 'critical' ? '#dc2626' : severity === 'high' ? '#f59e0b' : '#3b82f6'

    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; border-radius: 12px; overflow: hidden;">
            <div style="background: linear-gradient(135deg, #0e4d6e, #1a1a2e); padding: 24px 32px; border-bottom: 1px solid rgba(255,255,255,0.1);">
                <h1 style="color: #22d3ee; font-size: 20px; margin: 0;">COMPASS — Azure secret expiry alert</h1>
            </div>
            <div style="padding: 32px;">
                <div style="background: ${sevColor}22; border: 1px solid ${sevColor}; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                    <p style="color: ${sevColor}; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px 0; font-weight: bold;">${severity}</p>
                    <h2 style="color: #ffffff; font-size: 18px; margin: 0;">Azure client secret wygasa za <strong>${daysLeft}</strong> dni</h2>
                </div>
                <p style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
                    Sekret <code>compass-email-graph</code> w Azure App Registration
                    <strong>17f9ff8c-ac4e-414d-890e-a823722b4c35</strong> wygasa <strong>${expiresAt}</strong>.
                </p>
                <p style="color: #d1d5db; font-size: 14px; line-height: 1.6;">
                    Po expire <strong>cały Microsoft Graph stack przestaje działać</strong>:
                    emaile (sendMail), Calendar API, People API.
                </p>
                <h3 style="color: #ffffff; font-size: 14px; margin-top: 24px;">Co zrobić:</h3>
                <ol style="color: #d1d5db; font-size: 14px; line-height: 1.8;">
                    <li>Azure Portal → Microsoft Entra ID → App registrations → Compass → Certificates &amp; secrets</li>
                    <li>+ New client secret → expiry 24 months → skopiuj <strong>Value</strong></li>
                    <li>Coolify: zaktualizuj <code>AZURE_CLIENT_SECRET</code> + <code>AZURE_CLIENT_SECRET_EXPIRES_AT</code></li>
                    <li>Redeploy → smoke test (timesheet-reminder cron)</li>
                </ol>
                <hr style="border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 24px 0;" />
                <p style="color: #6b7280; font-size: 11px;">
                    Wiadomość wygenerowana automatycznie przez cron <code>/api/cron/secret-expiry-check</code>.
                </p>
            </div>
        </div>
    `
}
