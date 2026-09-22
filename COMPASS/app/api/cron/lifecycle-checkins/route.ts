import { logCompat } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { sendOnboardingDayCheckin } from '@/lib/email'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'

export const dynamic = 'force-dynamic'

/**
 * Phase 22 — Onboarding check-in reminder cron.
 *
 * Runs daily (e.g. 09:00 UTC). For each onboarding_progress with started_at
 * matching day-1 / day-7 / day-30 anniversary and no checkin_dayN_at filled,
 * sends a reminder email + creates an entry in lifecycle_events (optional —
 * here we just send email; record will be inserted when user submits the form).
 *
 * Auth: Bearer $CRON_SECRET (see withCronAuth).
 *
 * Coolify schedule: `0 9 * * *`
 *   curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://compass.dynaminds.pl/api/cron/lifecycle-checkins"
 */
// Phase 22 tables not yet in generated types — cast admin to any for now.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GET = withCronAuth(withCronHeartbeat('LIFECYCLE_CHECKINS_RUN', async (_request, { admin: adminTyped }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = adminTyped as any
    const now = new Date()
    const day1Cut = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString()
    const day7Cut = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const day30Cut = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const day1Floor = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString()
    const day7Floor = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString()
    const day30Floor = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString()

    const dayWindows: Array<{ day: 1 | 7 | 30; from: string; to: string; field: string }> = [
        { day: 1, from: day1Floor, to: day1Cut, field: 'checkin_day1_at' },
        { day: 7, from: day7Floor, to: day7Cut, field: 'checkin_day7_at' },
        { day: 30, from: day30Floor, to: day30Cut, field: 'checkin_day30_at' },
    ]

    let scanned = 0
    let attempted = 0
    let emailed = 0
    const errors: string[] = []

    for (const w of dayWindows) {
        const { data: progressRows, error } = await admin
            .from('onboarding_progress')
            .select(`id, user_id, started_at, ${w.field}, user:profiles!user_id(email, full_name, is_external, employment_status)`)
            .gte('started_at', w.from)
            .lt('started_at', w.to)
            .is('completed_at', null)
            // Audyt 2026-09-22 (HF-15) — anulowany onboarding ma `completed_at IS NULL`,
            // więc bez tego filtra dostawał prośby o check-in zamkniętego procesu.
            .is('cancelled_at', null)
            .is(w.field, null)

        if (error) {
            errors.push(`day=${w.day}: ${error.message}`)
            continue
        }
        scanned += progressRows?.length ?? 0

        for (const row of (progressRows ?? []) as Array<{
            id: string
            user_id: string
            user: {
                email: string | null
                full_name: string | null
                is_external: boolean | null
                employment_status: string | null
            } | null
        }>) {
            const email = row.user?.email
            if (!email) continue
            // HF-15 — check-in wymaga zalogowania: pracownik zewnętrzny nie ma konta,
            // a zarchiwizowany (Phase 43) nie może się już zalogować.
            if (row.user?.is_external) continue
            if (row.user?.employment_status === 'exited') continue
            attempted++
            try {
                const result = await sendOnboardingDayCheckin(
                    email,
                    row.user?.full_name ?? email,
                    row.id,
                    w.day,
                )
                // INT-11 — sender zwraca `{success:false}` zamiast rzucać; to też porażka.
                if (result.success) emailed++
                else errors.push(`day=${w.day} user=${row.user_id}: wysyłka nieudana`)
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'unknown'
                errors.push(`day=${w.day} user=${row.user_id}: ${msg}`)
                logCompat.error('lifecycle-checkins email error:', e)
            }
        }
    }

    // INT-11 — błąd zapytania albo nieudana wysyłka nie może raportować `ok: true`.
    // HTTP 500, gdy nic nie wyszło, a coś padło — heartbeat/scheduler widzą porażkę.
    const ok = errors.length === 0
    return NextResponse.json(
        { ok, scanned, attempted, emailed, failed: errors.length, errors: errors.slice(0, 10) },
        { status: !ok && emailed === 0 ? 500 : 200 },
    )
}))
