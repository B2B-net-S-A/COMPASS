import { logCompat } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { sendExitInterviewReminder, sendOnboardingReminderToManager } from '@/lib/email'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'
import {
    isWeeklyReminderDay,
    isWithinReminderWindow,
    shiftIsoDate,
    warsawToday,
} from '@/lib/notifications/reminder-cadence'

export const dynamic = 'force-dynamic'

/**
 * Phase 22 — Lifecycle reminders cron.
 *
 * Runs daily (e.g. 10:00 UTC). Sends:
 *   1. Manager reminder for overdue onboarding tasks where responsible_role IN ('manager','buddy')
 *      and due_date < today and not completed.
 *   2. Exit interview reminder to employees with scheduled exit_interview and
 *      termination_date < today + 3 days and still status='scheduled'.
 *
 * Auth: Bearer $CRON_SECRET.
 *
 * Coolify schedule: `0 10 * * *`
 *
 * Audyt 2026-08 — obie sekcje przypominały CODZIENNIE I BEZ KOŃCA:
 *   • exit-reminder brał każdy wywiad `scheduled` z terminem <= dziś+3 bez dolnej
 *     granicy, więc ankieta zaplanowana na 19.05 generowała maila każdego dnia od
 *     maja — a jeden z trzech adresatów miał już `employment_status='exited'`,
 *     czyli od Phase 43 nie potrafi się nawet zalogować, żeby ją wypełnić;
 *   • manager-reminder wysyłał listę zaległych zadań (na prodzie 20 sztuk) co dobę.
 * Teraz: przebieg wysyłkowy raz w tygodniu (poniedziałek warszawski), termin musi
 * mieścić się w oknie wokół daty, a zarchiwizowani wypadają. Sprawy nie znikają —
 * zostają w kolejce lifecycle w UI, przestają tylko dobijać się mailem.
 */

/** Do ilu dni PO terminie jeszcze przypominamy mailem o zaległym zadaniu. */
const OVERDUE_TASK_GRACE_DAYS = 30
/** Okno przypomnienia o exit interview: od 3 dni przed do 14 dni po terminie. */
const EXIT_REMINDER_WINDOW = { daysBefore: 3, daysAfter: 14 }
// Phase 22 tables not yet in generated types — cast admin to any for now.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GET = withCronAuth(withCronHeartbeat('LIFECYCLE_REMINDERS_RUN', async (_request, { admin: adminTyped }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = adminTyped as any
    const now = new Date()
    const todayIso = warsawToday(now)
    const in3DaysIso = shiftIsoDate(todayIso, EXIT_REMINDER_WINDOW.daysBefore)

    let managerRemindersSent = 0
    let exitRemindersSent = 0
    const errors: string[] = []

    // Kadencja tygodniowa. Jedynym kanałem jest e-mail, więc w bazie nie zostaje
    // nic, po czym dałoby się dedupować per adresat — dzień tygodnia jest
    // bezstanowy i przewidywalny, a migracji z kolumną stempla w tym audycie nie
    // aplikujemy, więc kod nie może od niej zależeć w chwili wdrożenia.
    if (!isWeeklyReminderDay(now)) {
        return NextResponse.json({
            ok: true,
            skipped: 'poza dniem tygodniowego przypomnienia',
            manager_reminders_sent: 0,
            exit_reminders_sent: 0,
            errors: [],
        })
    }

    // ─── 1. Manager reminders for overdue onboarding tasks ────────────────
    const { data: overdueTasks, error: tasksErr } = await admin
        .from('onboarding_tasks')
        .select(`
            id, title, due_date, responsible_role,
            progress:onboarding_progress!progress_id!inner(
                id, user_id,
                user:profiles!user_id(full_name, email, manager_id)
            )
        `)
        .is('completed_at', null)
        .lt('due_date', todayIso)
        // Zadanie przeterminowane o pół roku to nie przypomnienie, tylko szum —
        // po tym oknie sprawa zostaje wyłącznie w kolejce lifecycle w UI.
        .gte('due_date', shiftIsoDate(todayIso, -OVERDUE_TASK_GRACE_DAYS))
        .in('responsible_role', ['manager', 'buddy'])
        .is('progress.cancelled_at', null)
        .is('progress.completed_at', null)

    if (tasksErr) {
        errors.push(`tasks: ${tasksErr.message}`)
    } else {
        // Group by manager
        const tasksByManager = new Map<string, { managerId: string; employeeName: string; progressId: string; tasks: Array<{ title: string; dueDate: string }> }>()
        for (const t of (overdueTasks ?? []) as Array<{
            title: string
            due_date: string
            progress: {
                id: string
                user: { full_name: string | null; email: string | null; manager_id: string | null } | null
            } | null
        }>) {
            const managerId = t.progress?.user?.manager_id
            if (!managerId) continue
            const empName = t.progress?.user?.full_name ?? t.progress?.user?.email ?? 'pracownik'
            const key = `${managerId}:${t.progress?.id ?? ''}`
            const existing = tasksByManager.get(key)
            if (existing) {
                existing.tasks.push({ title: t.title, dueDate: t.due_date })
            } else if (t.progress?.id) {
                tasksByManager.set(key, {
                    managerId,
                    employeeName: empName,
                    progressId: t.progress.id,
                    tasks: [{ title: t.title, dueDate: t.due_date }],
                })
            }
        }

        for (const group of Array.from(tasksByManager.values())) {
            const { data: manager } = await admin
                .from('profiles')
                .select('email, full_name, employment_status')
                .eq('id', group.managerId)
                .single()
            if (!manager?.email) continue
            // Zarchiwizowany manager nie ma już dostępu do aplikacji (Phase 43) —
            // mail z linkiem do zadań byłby ślepym zaułkiem.
            if (manager.employment_status === 'exited') continue
            try {
                const result = await sendOnboardingReminderToManager(
                    manager.email,
                    manager.full_name ?? manager.email,
                    group.employeeName,
                    group.tasks,
                    group.progressId,
                )
                if (result.success) managerRemindersSent++
                else errors.push(`manager-reminder ${group.managerId}: wysyłka nieudana`)
            } catch (e: unknown) {
                errors.push(`manager-reminder ${group.managerId}: ${e instanceof Error ? e.message : 'unknown'}`)
                logCompat.error('manager-reminder error:', e)
            }
        }
    }

    // ─── 2. Exit interview reminders ──────────────────────────────────────
    const { data: pendingInterviews, error: exitErr } = await admin
        .from('exit_interviews')
        .select(`
            id, scheduled_for, user_id,
            user:profiles!user_id(email, full_name, termination_date, employment_status)
        `)
        .eq('status', 'scheduled')
        .lte('scheduled_for', in3DaysIso)
        // Dolna granica: przypominamy przez okno po terminie, nie w nieskończoność.
        // Bez niej wywiad z maja mailował codziennie przez kwartał.
        .gte('scheduled_for', shiftIsoDate(todayIso, -EXIT_REMINDER_WINDOW.daysAfter))
        .not('user_id', 'is', null)

    if (exitErr) {
        errors.push(`exit-interviews: ${exitErr.message}`)
    } else {
        for (const row of (pendingInterviews ?? []) as Array<{
            id: string
            scheduled_for: string | null
            user_id: string | null
            user: {
                email: string | null
                full_name: string | null
                termination_date: string | null
                employment_status: string | null
            } | null
        }>) {
            const email = row.user?.email
            if (!email) continue
            // Zarchiwizowany pracownik nie zaloguje się, żeby wypełnić ankietę
            // (Phase 43) — mail byłby prośbą o coś niewykonalnego.
            if (row.user?.employment_status === 'exited') continue
            // Zapytanie ma już obie granice, ale filtr powtarzamy w kodzie: to on
            // jest czytelnym miejscem reguły, gdyby zapytanie kiedyś się zmieniło.
            if (!isWithinReminderWindow(row.scheduled_for, todayIso, EXIT_REMINDER_WINDOW)) continue
            const terminationDate = row.user?.termination_date ?? row.scheduled_for ?? 'wkrótce'
            try {
                const result = await sendExitInterviewReminder(
                    email,
                    row.user?.full_name ?? email,
                    terminationDate,
                )
                if (result.success) exitRemindersSent++
                else errors.push(`exit-reminder ${row.id}: wysyłka nieudana`)
            } catch (e: unknown) {
                errors.push(`exit-reminder ${row.id}: ${e instanceof Error ? e.message : 'unknown'}`)
                logCompat.error('exit-reminder error:', e)
            }
        }
    }

    // Audyt 2026-09-22 (INT-11) — błędy (zapytań i wysyłek `{success:false}`) muszą
    // dawać `ok: false`; HTTP 500, gdy nic nie wyszło, a coś padło.
    const ok = errors.length === 0
    const sent = managerRemindersSent + exitRemindersSent
    return NextResponse.json(
        {
            ok,
            manager_reminders_sent: managerRemindersSent,
            exit_reminders_sent: exitRemindersSent,
            failed: errors.length,
            errors: errors.slice(0, 10),
        },
        { status: !ok && sent === 0 ? 500 : 200 },
    )
}))
