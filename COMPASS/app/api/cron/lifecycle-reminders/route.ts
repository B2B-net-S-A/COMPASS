import { logCompat } from '@/lib/logger'
import { NextResponse } from 'next/server'
import { sendExitInterviewReminder, sendOnboardingReminderToManager } from '@/lib/email'
import { withCronAuth } from '@/lib/api/with-auth'
import { withCronHeartbeat } from '@/lib/audit/cron-heartbeat'

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
 */
// Phase 22 tables not yet in generated types — cast admin to any for now.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GET = withCronAuth(withCronHeartbeat('LIFECYCLE_REMINDERS_RUN', async (_request, { admin: adminTyped }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = adminTyped as any
    const todayIso = new Date().toISOString().split('T')[0]
    const in3DaysIso = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    let managerRemindersSent = 0
    let exitRemindersSent = 0
    const errors: string[] = []

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
                .select('email, full_name')
                .eq('id', group.managerId)
                .single()
            if (!manager?.email) continue
            try {
                const result = await sendOnboardingReminderToManager(
                    manager.email,
                    manager.full_name ?? manager.email,
                    group.employeeName,
                    group.tasks,
                    group.progressId,
                )
                if (result.success) managerRemindersSent++
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
            user:profiles!user_id(email, full_name, termination_date)
        `)
        .eq('status', 'scheduled')
        .lte('scheduled_for', in3DaysIso)
        .not('user_id', 'is', null)

    if (exitErr) {
        errors.push(`exit-interviews: ${exitErr.message}`)
    } else {
        for (const row of (pendingInterviews ?? []) as Array<{
            id: string
            scheduled_for: string | null
            user_id: string | null
            user: { email: string | null; full_name: string | null; termination_date: string | null } | null
        }>) {
            const email = row.user?.email
            if (!email) continue
            const terminationDate = row.user?.termination_date ?? row.scheduled_for ?? 'wkrótce'
            try {
                const result = await sendExitInterviewReminder(
                    email,
                    row.user?.full_name ?? email,
                    terminationDate,
                )
                if (result.success) exitRemindersSent++
            } catch (e: unknown) {
                errors.push(`exit-reminder ${row.id}: ${e instanceof Error ? e.message : 'unknown'}`)
                logCompat.error('exit-reminder error:', e)
            }
        }
    }

    return NextResponse.json({
        ok: true,
        manager_reminders_sent: managerRemindersSent,
        exit_reminders_sent: exitRemindersSent,
        errors: errors.slice(0, 10),
    })
}))
