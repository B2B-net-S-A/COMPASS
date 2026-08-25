'use server'

// Phase 41c — widoczność i ratunek dla przekierowań poczty.
//
// Phase 41 zakłada w skrzynkach reguły, które nie wygasają same, i powierza ich
// zamykanie cronowi. Weryfikacja 2026-07-27 pokazała, że crony tej instancji nie
// wykonują się wcale (heartbeat FORWARD_RECONCILE_RUN nie zostawił ani jednego
// wiersza przez pięć poranków; inbox-ingest i tc-sync stoją od maja i czerwca).
// Skutek: dwie reguły przeżyły swoje urlopy o kilka dni i nikt tego nie widział,
// dopóki zastępcy nie zgłosili, że dostają cudzą pocztę.
//
// Ten moduł usuwa oba braki: pokazuje stan faktyczny skrzynek (a nie to, co baza
// sądzi o skrzynkach) i pozwala odpalić uzgodnienie z aplikacji, bez harmonogramu.

import { logAudit } from '@/lib/actions/audit'
import { requireAdminAction } from '@/lib/auth/internal-guard'
import { logger } from '@/lib/logger'
import { deleteForwardRule, listCompassForwardRules } from '@/lib/mailbox/graph-inbox-rules'
import { reconcileForwardRules } from '@/lib/oof/forward-rules'
import { shouldForwardBeActive } from '@/lib/oof/forward-window'
import { HR_ROLES } from '@/lib/oof/reconcile'
import { createServiceClient } from '@/lib/supabase/admin'
import { activeRoster } from '@/lib/hr/employment-window'
import { warsawDate } from '@/lib/oof/oof-dates'

/** Ten sam limit co w uzgodnieniu — skan nie może rosnąć w nieskończoność. */
const MAX_MAILBOXES = 100

export type ForwardRuleHealth =
    /** Reguła należy do trwającego urlopu ze zgodą — tak ma być. */
    | 'ok'
    /** Reguła przeżyła swój urlop albo zgodę wycofano — do usunięcia. */
    | 'orphan'
    /** Urlop trwa i ma zgodę, ale reguły w skrzynce nie ma — poczta nie idzie dalej. */
    | 'missing'

export interface ForwardRuleView {
    /** NULL dla reguły, której nazwy nie umiemy powiązać z wnioskiem. */
    leaveId: string | null
    /** NULL w wierszu 'missing' — reguły fizycznie nie ma. */
    ruleId: string | null
    /** Skrzynka, z której wychodzi kopia poczty. */
    mailbox: string
    employeeName: string | null
    substituteName: string | null
    startDate: string | null
    endDate: string | null
    health: ForwardRuleHealth
    /** Czemu wiersz jest problemem — gotowe do pokazania, po polsku. */
    reason: string | null
}

export interface ForwardRulesOverview {
    rules: ForwardRuleView[]
    scannedMailboxes: number
    /** Skrzynki, których nie dało się odczytać — ich stan pozostaje nieznany. */
    unreadableMailboxes: string[]
    /**
     * True, gdy Graph nie jest skonfigurowany (dev/local). UI mówi wtedy wprost,
     * że pustka nie znaczy "czysto".
     */
    graphUnavailable: boolean
}

interface LeaveJoin {
    id: string
    user_id: string
    start_date: string
    end_date: string
    status: string
    substitute_id: string | null
    outlook_forward_rule_id: string | null
    forward_mail_enabled: boolean
}

/**
 * Szybki podgląd z samej bazy — bez dotykania Graph.
 *
 * Renderowane od razu przy wejściu na stronę, więc musi być tanie: skan skrzynek
 * (listActiveForwardRules) trwa kilkanaście sekund i nie ma prawa blokować widoku.
 * Pokazuje wszystko, o czym baza wie, że przekierowuje — czyli i te reguły, które
 * przeżyły swój urlop. Nie pokazuje reguł, o których baza zapomniała; od tego jest
 * pełny skan uruchamiany przyciskiem.
 */
export async function listForwardRulesFromDb(): Promise<ForwardRuleView[]> {
    await requireAdminAction()
    const admin = createServiceClient()
    const now = new Date()

    const { data: leavesRaw } = await admin
        .from('leave_requests')
        .select(
            'id, user_id, start_date, end_date, status, substitute_id, outlook_forward_rule_id, forward_mail_enabled',
        )
        .not('outlook_forward_rule_id', 'is', null)

    const leaves = (leavesRaw ?? []) as LeaveJoin[]
    if (leaves.length === 0) return []

    const ids = Array.from(
        new Set(leaves.flatMap((l) => [l.user_id, l.substitute_id].filter(Boolean) as string[])),
    )
    const { data: peopleRaw } = await admin
        .from('profiles')
        .select('id, email, full_name')
        .in('id', ids)
    const people = new Map(
        ((peopleRaw ?? []) as Array<{ id: string; email: string | null; full_name: string | null }>)
            .map((p) => [p.id, p]),
    )

    const rows: ForwardRuleView[] = leaves.map((leave) => {
        const owner = people.get(leave.user_id)
        const legit = shouldForwardBeActive(
            {
                status: leave.status,
                substituteId: leave.substitute_id,
                startDate: leave.start_date,
                endDate: leave.end_date,
                forwardMailEnabled: leave.forward_mail_enabled,
            },
            now,
        )
        return {
            leaveId: leave.id,
            ruleId: leave.outlook_forward_rule_id,
            mailbox: owner?.email ?? '(brak adresu)',
            employeeName: owner?.full_name ?? owner?.email ?? null,
            substituteName: leave.substitute_id
                ? (people.get(leave.substitute_id)?.full_name ?? null)
                : null,
            startDate: leave.start_date,
            endDate: leave.end_date,
            health: legit ? 'ok' : 'orphan',
            reason: legit ? null : describeOrphan(leave, now),
        }
    })

    const order: Record<ForwardRuleHealth, number> = { orphan: 0, missing: 1, ok: 2 }
    return rows.sort((a, b) => order[a.health] - order[b.health] || a.mailbox.localeCompare(b.mailbox))
}

/**
 * Zestaw reguł faktycznie obecnych w skrzynkach z tym, czego oczekuje baza.
 *
 * Skanuje skrzynki, a nie wiersze — bo cała klasa awarii, przed którą to chroni,
 * polega właśnie na tym, że baza NIE wie o regule (zgubione ID, przywrócony backup,
 * nieudany zapis). Wiersz 'missing' idzie w drugą stronę: urlop, który powinien
 * przekierowywać, ale nie przekierowuje.
 */
export async function listActiveForwardRules(): Promise<ForwardRulesOverview> {
    await requireAdminAction()
    const admin = createServiceClient()
    const now = new Date()

    const { data: rosterRaw, error: rosterErr } = await admin
        .from('profiles')
        .select('id, email, full_name, employment_status')
        .in('role', [...HR_ROLES])
    if (rosterErr) throw new Error(`Nie udało się pobrać listy pracowników: ${rosterErr.message}`)

    const roster = activeRoster(
        (rosterRaw ?? []) as Array<{
            id: string
            email: string | null
            full_name: string | null
            employment_status: string | null
        }>,
    ).filter((u) => u.email)

    const nameById = new Map(roster.map((u) => [u.id, u.full_name ?? u.email]))

    // Wnioski, które mogą mieć cokolwiek wspólnego z przekierowaniem: albo baza
    // pamięta regułę, albo urlop ma zgodę i zastępcę.
    const { data: leavesRaw } = await admin
        .from('leave_requests')
        .select(
            'id, user_id, start_date, end_date, status, substitute_id, outlook_forward_rule_id, forward_mail_enabled',
        )
        .or('outlook_forward_rule_id.not.is.null,forward_mail_enabled.eq.true')

    const leaves = (leavesRaw ?? []) as LeaveJoin[]
    const leaveById = new Map(leaves.map((l) => [l.id, l]))

    const rules: ForwardRuleView[] = []
    const unreadableMailboxes: string[] = []
    let scannedMailboxes = 0
    let anyMailboxRead = false

    for (const u of roster.slice(0, MAX_MAILBOXES)) {
        const mailbox = u.email as string
        const found = await listCompassForwardRules(mailbox)
        if (found === null) {
            unreadableMailboxes.push(mailbox)
            continue
        }
        anyMailboxRead = true
        scannedMailboxes++

        for (const rule of found) {
            const leave = leaveById.get(rule.leaveId)
            const legit =
                leave &&
                shouldForwardBeActive(
                    {
                        status: leave.status,
                        substituteId: leave.substitute_id,
                        startDate: leave.start_date,
                        endDate: leave.end_date,
                        forwardMailEnabled: leave.forward_mail_enabled,
                    },
                    now,
                )

            rules.push({
                leaveId: leave?.id ?? null,
                ruleId: rule.id,
                mailbox,
                employeeName: u.full_name ?? mailbox,
                substituteName: leave?.substitute_id
                    ? (nameById.get(leave.substitute_id) ?? null)
                    : null,
                startDate: leave?.start_date ?? null,
                endDate: leave?.end_date ?? null,
                health: legit ? 'ok' : 'orphan',
                reason: legit ? null : describeOrphan(leave, now),
            })
        }
    }

    // Druga strona lustra: urlop chce przekierowania, a reguły nie widać.
    // Liczona tylko dla skrzynek, które faktycznie odczytaliśmy — inaczej każda
    // nieczytelna skrzynka udawałaby brak reguły.
    const readMailboxes = new Set(
        roster
            .slice(0, MAX_MAILBOXES)
            .map((u) => u.email as string)
            .filter((m) => !unreadableMailboxes.includes(m)),
    )
    const seenRuleLeaveIds = new Set(rules.map((r) => r.leaveId).filter(Boolean) as string[])

    for (const leave of leaves) {
        if (seenRuleLeaveIds.has(leave.id)) continue
        const owner = roster.find((u) => u.id === leave.user_id)
        if (!owner?.email || !readMailboxes.has(owner.email)) continue
        if (
            !shouldForwardBeActive(
                {
                    status: leave.status,
                    substituteId: leave.substitute_id,
                    startDate: leave.start_date,
                    endDate: leave.end_date,
                    forwardMailEnabled: leave.forward_mail_enabled,
                },
                now,
            )
        ) {
            continue
        }
        rules.push({
            leaveId: leave.id,
            ruleId: null,
            mailbox: owner.email,
            employeeName: owner.full_name ?? owner.email,
            substituteName: leave.substitute_id
                ? (nameById.get(leave.substitute_id) ?? null)
                : null,
            startDate: leave.start_date,
            endDate: leave.end_date,
            health: 'missing',
            reason: 'Urlop trwa i ma zgodę, ale w skrzynce nie ma reguły — poczta nie jest przekazywana.',
        })
    }

    // Problemy na wierzch: sieroty, potem braki, potem zdrowe.
    const order: Record<ForwardRuleHealth, number> = { orphan: 0, missing: 1, ok: 2 }
    rules.sort((a, b) => order[a.health] - order[b.health] || a.mailbox.localeCompare(b.mailbox))

    return {
        rules,
        scannedMailboxes,
        unreadableMailboxes,
        graphUnavailable: !anyMailboxRead && roster.length > 0,
    }
}

function describeOrphan(leave: LeaveJoin | undefined, now: Date): string {
    if (!leave) return 'Reguła nie pasuje do żadnego wniosku w bazie.'
    // Audyt 2026-08 — data musi być liczona w strefie warszawskiej, tak jak liczy ją
    // shouldForwardBeActive, które rozstrzyga, czy reguła to sierota. Przy `toISOString()`
    // wieczorami (po 22:00 latem) opis mijał się z werdyktem o jedną dobę.
    const today = warsawDate(now)
    if (!leave.forward_mail_enabled) return 'Przekierowanie zostało wyłączone, reguła nadal działa.'
    if (leave.status !== 'approved') return `Wniosek ma status "${leave.status}".`
    if (leave.end_date < today) return `Urlop skończył się ${leave.end_date}.`
    if (leave.start_date > today) return `Urlop zaczyna się dopiero ${leave.start_date}.`
    return 'Reguła nie odpowiada aktywnemu urlopowi.'
}

/**
 * Usuń konkretną regułę ze skrzynki — ratunek, gdy uzgodnienie nie daje rady
 * (np. reguła bez powiązania z wnioskiem, której żaden przebieg nie przypisze).
 */
export async function removeForwardRule(input: {
    mailbox: string
    ruleId: string
    leaveId?: string | null
}): Promise<{ removed: boolean; error?: string }> {
    const ctx = await requireAdminAction()
    const admin = createServiceClient()

    const res = await deleteForwardRule({ userEmail: input.mailbox, ruleId: input.ruleId })
    if (!res.success) {
        return { removed: false, error: res.error ?? 'Outlook odrzucił usunięcie reguły.' }
    }
    if (res.skipped) {
        return { removed: false, error: 'Brak konfiguracji Graph — nic nie usunięto.' }
    }

    // Wyczyść wskaźnik, żeby kolejny przebieg nie próbował kasować nieistniejącej reguły.
    await admin
        .from('leave_requests')
        .update({ outlook_forward_rule_id: null } as never)
        .eq('outlook_forward_rule_id', input.ruleId)

    await logAudit(ctx.userId, 'LEAVE_FORWARD_ORPHAN_REMOVED', {
        leave_id: input.leaveId ?? null,
        mailbox: input.mailbox,
        rule_id: input.ruleId,
        via: 'admin_panel',
    })
    return { removed: true }
}

/**
 * Odpal uzgodnienie ręcznie, z aplikacji.
 *
 * Ta sama funkcja, którą wywołuje cron — tyle że tu wywołuje ją człowiek, więc
 * działa niezależnie od tego, czy harmonogram żyje.
 */
export async function runForwardReconcileNow(): Promise<{
    opened: number
    closed: number
    orphansRemoved: number
    errors: string[]
}> {
    const ctx = await requireAdminAction()
    const admin = createServiceClient()

    const stats = await reconcileForwardRules(admin as never)
    await logAudit(ctx.userId, 'FORWARD_RECONCILE_RUN', {
        phase: 'done',
        via: 'manual',
        opened: stats.opened,
        closed: stats.closed,
        orphansRemoved: stats.orphansRemoved,
        errorCount: stats.errors.length,
    })
    logger.info({ event: 'forward_rules.manual_run', ...stats })

    return {
        opened: stats.opened,
        closed: stats.closed,
        orphansRemoved: stats.orphansRemoved,
        errors: stats.errors.slice(0, 15),
    }
}
