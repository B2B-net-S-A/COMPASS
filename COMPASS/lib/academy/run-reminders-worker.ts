import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { isMissingDatabaseObject } from './migration-contract'
import { holdAcademyMail } from './outbound'
import { REMINDER_HORIZON_MS, REMINDER_KIND, reminderBatchId, reminderDedupeKey, runReminderMail, upcomingStages } from './run-reminders'

interface SessionRow { id: string; run_id: string; title: string; starts_at: string; time_zone: string; meeting_mode: string; course_runs: { title: string; status: string; course_id: string; courses: { title: string } | null } | null }
const SESSION_LIMIT = 100

export type ReminderQueueResult = { status: 'done'; held: number; duplicate: number; refused: number } | { status: 'migration_pending' } | { status: 'failed' }

/** Creates held rows only. Runs inside the existing worker and never calls the mail sender. */
export async function holdAcademyRunReminders(client: SupabaseClient, now: Date = new Date()): Promise<ReminderQueueResult> {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '')
    if (!appUrl) { logger.warn({ event: 'academy.reminders.missing_app_url' }); return { status: 'done', held: 0, duplicate: 0, refused: 0 } }
    const { data, error } = await client.from('course_sessions')
        .select('id,run_id,title,starts_at,time_zone,meeting_mode,course_runs!inner(title,status,course_id,courses!inner(title))')
        .eq('status', 'scheduled').eq('course_runs.status', 'published')
        .gt('starts_at', now.toISOString()).lte('starts_at', new Date(now.getTime() + REMINDER_HORIZON_MS).toISOString())
        .order('starts_at').limit(SESSION_LIMIT)
    if (error) return isMissingDatabaseObject(error) ? { status: 'migration_pending' } : { status: 'failed' }
    let held = 0, duplicate = 0, refused = 0
    for (const session of (data ?? []) as unknown as SessionRow[]) {
        const stages = upcomingStages(session.starts_at, now)
        if (!stages.length || !session.course_runs) continue
        const { data: registered, error: registrationError } = await client.from('course_run_registrations').select('user_id,profiles!inner(email)').eq('run_id', session.run_id).eq('status', 'confirmed').limit(1000)
        if (registrationError) return { status: 'failed' }
        const emails = Array.from(new Set(((registered ?? []) as unknown as Array<{ profiles: { email: string | null } | null }>).flatMap(row => row.profiles?.email ? [row.profiles.email.trim().toLowerCase()] : [])))
        if (!emails.length) continue
        const keys = stages.flatMap(stage => emails.map(email => reminderDedupeKey(session.id, stage, email)))
        const existing = new Set<string>()
        for (let start = 0; start < keys.length; start += 60) {
            const found = await client.from('academy_outbox').select('dedupe_key').in('dedupe_key', keys.slice(start, start + 60))
            if (found.error) return isMissingDatabaseObject(found.error) ? { status: 'migration_pending' } : { status: 'failed' }
            for (const row of (found.data ?? []) as Array<{ dedupe_key: string }>) existing.add(row.dedupe_key)
        }
        const startsLabel = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long', timeStyle: 'short', timeZone: session.time_zone }).format(new Date(session.starts_at))
        for (const stage of stages) {
            const mail = runReminderMail({ stage, courseTitle: session.course_runs.courses?.title ?? session.course_runs.title, sessionTitle: session.title, startsLabel, appUrl, runId: session.run_id, sessionId: session.id, hasCalendarFile: session.meeting_mode === 'external_link' })
            for (const email of emails) {
                const dedupeKey = reminderDedupeKey(session.id, stage, email)
                if (existing.has(dedupeKey)) continue
                const outcome = await holdAcademyMail(client, { kind: REMINDER_KIND, recipient: email, ...mail, expiresAt: new Date(session.starts_at).toISOString(), dedupeKey, runId: session.run_id, batchId: reminderBatchId(session.id, stage) })
                if (outcome.status === 'held') held++
                else if (outcome.status === 'duplicate') duplicate++
                else if (outcome.reason === 'migration_pending') return { status: 'migration_pending' }
                else if (outcome.reason === 'write_failed') return { status: 'failed' }
                else refused++
            }
        }
    }
    return { status: 'done', held, duplicate, refused }
}
