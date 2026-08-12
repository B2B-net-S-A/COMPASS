import { logCompat, logger } from '@/lib/logger'
import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { sendTimesheetReminder } from '@/lib/email'
import { postToTeamsAlert } from '@/lib/teams/webhook'
import { withCronAuth } from '@/lib/api/with-auth'
import { logAudit } from '@/lib/actions/audit'
import { warsawDate } from '@/lib/oof/oof-dates'
import {
    closedMonthFor,
    isWithinReminderWindow,
    periodLabel,
    submissionDeadlineIso,
    TIMESHEET_DEADLINE_DAY,
    type TimesheetPeriod,
} from '@/lib/hr/timesheet-reminder-window'

export const dynamic = 'force-dynamic'

/**
 * Phase 52 — JEDNO przypomnienie o timesheecie na osobę na miesiąc.
 *
 * Wcześniej trasa robiła to, co kazał jej parametr `?phase=`, a wołały ją trzy
 * harmonogramy: zadania Coolify `timesheet-mon-nudge` (`0 9 * * 1`) i
 * `timesheet-wed-warning` (`0 9 * * 3`) oraz cron GH Actions 25-go. Wszystkie za
 * miesiąc BIEŻĄCY, więc zalegający dostawał ~8 maili miesięcznie, a treść kłamała:
 * 12.08 przyszło „timesheet 2026-08, termin za 3 dni", choć termin to 5.09.
 *
 * Teraz o wysyłce decyduje trasa, nie wołający:
 *   - okres = miesiąc ZAMKNIĘTY (poprzedni), nigdy trwający,
 *   - okno = 1.–5. dzień miesiąca (do dnia terminu włącznie); poza nim nie leci nic,
 *     więc stare zadanie z `?phase=...` jest nieszkodliwym no-opem,
 *   - dedup = `timesheet_reminder_log` z UNIQUE (user_id, year, month): rezerwacja
 *     wstawką ON CONFLICT DO NOTHING idzie PRZED wysyłką, więc pięć przebiegów w oknie
 *     (albo dwa schedulery naraz) dają dokładnie jednego maila na osobę.
 *
 * Wołanie:
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        "https://compass.dynaminds.pl/api/cron/timesheet-reminder"
 *
 * Parametry (tylko ręczne uruchomienie): `?force=1` pomija okno, `?year=&month=`
 * wskazują inny okres. Dedupu nie pomija NIC — od tego jest osobny okres.
 *
 * Ślad w bazie: audit_logs `TIMESHEET_REMINDER_RUN` — czytelny bez CRON_SECRET dowód,
 * że jedyny w miesiącu przebieg faktycznie się wykonał.
 */
export const GET = withCronAuth(async (request, { admin }) => {
    const url = new URL(request.url)
    const todayIso = warsawDate(new Date())
    const force = url.searchParams.get('force') === '1'

    if (!force && !isWithinReminderWindow(todayIso)) {
        // Nie błąd — tak wygląda 26 z 31 dni miesiąca, w tym każde odpalenie starego
        // zadania „mon-nudge"/„wed-warning".
        return NextResponse.json({
            ok: true,
            skipped: 'outside_reminder_window',
            today: todayIso,
            window: `1-${TIMESHEET_DEADLINE_DAY}`,
        })
    }

    const period = closedMonthFor(todayIso)
    const override = readPeriodOverride(url, period)
    if ('error' in override) {
        return NextResponse.json({ error: override.error }, { status: 400 })
    }
    const { year: targetYear, month: targetMonth } = override.period
    const monthLabel = periodLabel(override.period)

    const { data: employees, error: employeesErr } = await admin
        .from('profiles')
        .select('id, full_name, email, employment_type')
        .in('role', ['internal', 'admin'])
        // Przypomnienie o timesheecie do byłego pracownika = mail w próżnię.
        // Dziś nie strzelało tylko dlatego, że archiwum trafiło się na B2B
        // (a B2B i tak odpada niżej) — na UoP poszłoby.
        .neq('employment_status', 'exited')
    if (employeesErr) {
        logCompat.error('[timesheet-reminder] employees fetch error:', employeesErr)
        return NextResponse.json({ error: employeesErr.message }, { status: 500 })
    }

    const { data: existing } = await admin
        .from('timesheets')
        .select('user_id, status')
        .eq('year', targetYear)
        .eq('month', targetMonth)
        .in('status', ['submitted', 'approved'])
    const submittedSet = new Set((existing ?? []).map((t: { user_id: string }) => t.user_id))

    // Skip B2B employees (timesheet pakiet UoP only)
    const roster = (employees ?? []).filter(
        (e: { email: string | null; employment_type: string | null }) =>
            !!e.email && e.employment_type !== 'b2b',
    ) as Array<{ id: string; full_name: string | null; email: string }>
    // Liczone na rosterze, nie na całej tabeli `timesheets` — inaczej licznik brałby
    // też timesheety konsultantów i finansów, a operator porównuje go z `pending`.
    const alreadySubmitted = roster.filter((e) => submittedSet.has(e.id)).length
    const pending = roster.filter((e) => !submittedSet.has(e.id))

    // Rezerwacja PRZED wysyłką. `ignoreDuplicates` = ON CONFLICT DO NOTHING, więc
    // `.select()` zwraca wyłącznie wiersze, które naprawdę powstały — czyli osoby,
    // które jeszcze nie dostały przypomnienia za ten okres. To jedyny krok pilnujący
    // „raz na miesiąc"; kolejność rozstrzyga UNIQUE w bazie, nie odczyt w aplikacji.
    let claimed: Array<{ user_id: string }> = []
    if (pending.length > 0) {
        const { data, error: claimErr } = await admin
            .from('timesheet_reminder_log')
            .upsert(
                pending.map((p) => ({ user_id: p.id, year: targetYear, month: targetMonth })),
                { onConflict: 'user_id,year,month', ignoreDuplicates: true },
            )
            .select('user_id')
        if (claimErr) {
            // Bez rezerwacji nie ma gwarancji jednego maila — wolimy nie wysłać nic
            // i spróbować jutro (okno trwa 5 dni), niż zaryzykować powtórkę.
            logCompat.error('[timesheet-reminder] claim error:', claimErr)
            Sentry.captureMessage('timesheet_reminder_claim_failed', {
                level: 'error',
                tags: { kind: 'cron_timesheet_reminder' },
            })
            return NextResponse.json({ error: claimErr.message }, { status: 500 })
        }
        claimed = (data ?? []) as Array<{ user_id: string }>
    }

    const claimedIds = new Set(claimed.map((c) => c.user_id))
    const targets = pending.filter((p) => claimedIds.has(p.id))

    // Alert Teams po rezerwacji, nie przed — inaczej HR dostawałby go co przebieg,
    // nawet gdy wszystkie maile poszły pierwszego dnia okna.
    if (targets.length > 0) {
        postToTeamsAlert({
            title: `Timesheet reminder — ${monthLabel}`,
            text: `${targets.length} ${targets.length === 1 ? 'osoba nie złożyła' : 'osób nie złożyło'} jeszcze timesheetu za ${monthLabel}. Termin: ${submissionDeadlineIso(override.period)}.`,
            themeColor: 'F59E0B',
            facts: [
                { name: 'Miesiąc', value: monthLabel },
                { name: 'Termin', value: submissionDeadlineIso(override.period) },
                { name: 'Zaległych', value: String(targets.length) },
            ],
            actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://compass.dynaminds.pl'}/internal/admin?tab=timesheets`,
        }).catch((e) => logCompat.error('[timesheet-reminder] teams alert failed:', e))
    }

    let sent = 0
    let failed = 0
    for (const emp of targets) {
        const res = await sendTimesheetReminder(
            emp.email,
            emp.full_name ?? emp.email,
            targetYear,
            targetMonth,
        )
        if (res.success) {
            sent += 1
            continue
        }
        failed += 1
        // Zwolnij rezerwację, żeby kolejny przebieg w oknie ponowił próbę. Bez tego
        // nieudana wysyłka oznaczałaby brak przypomnienia przez cały miesiąc.
        const { error: releaseErr } = await admin
            .from('timesheet_reminder_log')
            .delete()
            .eq('user_id', emp.id)
            .eq('year', targetYear)
            .eq('month', targetMonth)
        if (releaseErr) {
            logCompat.error('[timesheet-reminder] claim release failed:', releaseErr)
        }
    }

    await logAudit(null, 'TIMESHEET_REMINDER_RUN', {
        year: targetYear,
        month: targetMonth,
        today: todayIso,
        forced: force,
        pending: pending.length,
        already_reminded: pending.length - targets.length,
        reminders_sent: sent,
        reminders_failed: failed,
    })

    if (failed > 0) {
        Sentry.captureMessage('timesheet_reminder_partial_failure', {
            level: 'warning',
            tags: { kind: 'cron_timesheet_reminder' },
        })
    }

    logger.info({
        event: 'timesheet_reminder.done',
        month: monthLabel,
        sent,
        failed,
    })

    return NextResponse.json({
        ok: failed === 0,
        year: targetYear,
        month: targetMonth,
        deadline: submissionDeadlineIso(override.period),
        // roster = already_submitted + pending; pending = already_reminded + sent + failed
        total_employees: employees?.length ?? 0,
        roster: roster.length,
        already_submitted: alreadySubmitted,
        already_reminded: pending.length - targets.length,
        reminders_sent: sent,
        reminders_failed: failed,
    })
})

/** `?year=&month=` do ręcznego wskazania okresu; bez nich — miesiąc zamknięty. */
function readPeriodOverride(
    url: URL,
    fallback: TimesheetPeriod,
): { period: TimesheetPeriod } | { error: string } {
    const yearParam = url.searchParams.get('year')
    const monthParam = url.searchParams.get('month')
    const year = yearParam ? Number(yearParam) : fallback.year
    const month = monthParam ? Number(monthParam) : fallback.month
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return { error: `Nieprawidłowy rok: ${yearParam}` }
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        return { error: `Nieprawidłowy miesiąc: ${monthParam}` }
    }
    return { period: { year, month } }
}
