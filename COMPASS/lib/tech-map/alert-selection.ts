// Phase 46c — czysta logika wyboru odbiorców i kart do alertu.
// Wydzielona z alerts.ts (które ciągnie server-only/use-server), żeby była
// testowalna bez mocków — wzorzec bench-seed (filterBenchSeedCandidates).

/** Klucze system_settings z CSV UUID odbiorców (konfigurowalne przez admina). */
export const DEMAND_RECIPIENTS_KEY = 'tech_map_demand_recipients'
export const PROJECT_END_RECIPIENTS_KEY = 'tech_map_project_end_recipients'

/** Próg alertu końca projektu (dni). */
export const PROJECT_END_ALERT_DAYS = 60

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** CSV UUID → lista; odsiewa puste tokeny, złe formaty i duplikaty. */
export function parseRecipientCsv(value: string | null | undefined): string[] {
    if (!value) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const raw of value.split(',')) {
        const id = raw.trim().toLowerCase()
        if (UUID_RE.test(id) && !seen.has(id)) {
            seen.add(id)
            out.push(id)
        }
    }
    return out
}

/** Ostatni dzień kalendarzowy (year, month) jako ISO YYYY-MM-DD. */
export function projectEndDeadline(year: number, month: number): string {
    // Dzień 0 następnego miesiąca = ostatni dzień tego miesiąca (Date.UTC normalizuje).
    const d = new Date(Date.UTC(year, month, 0))
    return d.toISOString().slice(0, 10)
}

export interface ProjectEndCard {
    id: string
    contractor_id: string
    interview_date: string
    project_end_month: number | null
    project_end_year: number | null
    project_end_alerted_at: string | null
}

export interface ProjectEndAlert {
    cardId: string
    contractorId: string
    deadline: string
}

/**
 * Wybiera karty do alertu końca projektu: PER KONTRAKTOR najnowsza sfinalizowana
 * karta (najświeższa interview_date); alarmuje, gdy jej deadline mieści się
 * w [today, today+withinDays] i nie była jeszcze zaalarmowana.
 *
 * „Tylko najnowsza karta" — starsze karty mogą mieć nieaktualną datę końca;
 * liczy się ostatnia znana. Deadline z przeszłości pomijamy (projekt już się
 * skończył — alert byłby szumem).
 */
export function selectProjectEndAlerts(
    cards: ProjectEndCard[],
    todayISO: string,
    withinDays: number = PROJECT_END_ALERT_DAYS,
): ProjectEndAlert[] {
    const latest = new Map<string, ProjectEndCard>()
    for (const c of cards) {
        const cur = latest.get(c.contractor_id)
        if (!cur || c.interview_date > cur.interview_date) latest.set(c.contractor_id, c)
    }

    const horizon = addDaysISO(todayISO, withinDays)
    const alerts: ProjectEndAlert[] = []
    for (const c of Array.from(latest.values())) {
        if (c.project_end_month === null || c.project_end_year === null) continue
        if (c.project_end_alerted_at !== null) continue
        const deadline = projectEndDeadline(c.project_end_year, c.project_end_month)
        if (deadline >= todayISO && deadline <= horizon) {
            alerts.push({ cardId: c.id, contractorId: c.contractor_id, deadline })
        }
    }
    return alerts
}

function addDaysISO(iso: string, days: number): string {
    const y = Number.parseInt(iso.slice(0, 4), 10)
    const m = Number.parseInt(iso.slice(5, 7), 10)
    const d = Number.parseInt(iso.slice(8, 10), 10)
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}
