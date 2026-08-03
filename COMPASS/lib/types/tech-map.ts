// Phase 46 — Mapa technologiczna: shared types, enums, PL labels, slug helper.
// Pure module (no I/O) — safe to import from client + server + tests.

// ─── Enums ──────────────────────────────────────────────────────────────────

/** Rotacyjny blok wywiadu. Blok A jest zawsze — nie jest wartością enuma. */
export type InterviewBlock = 'B' | 'C' | 'D'

export type InterviewCardStatus = 'ok' | 'odmowa' | 'brak_czasu' | 'niechetny'

export type HiringSource = 'widzial' | 'slyszal' | 'plotka'

export type TechCategory = 'jezyk' | 'chmura' | 'dane' | 'devops' | 'security' | 'inne'

export type InitiativeKind = 'migracja' | 'nowy_system' | 'ai' | 'regulacje' | 'inne'

export type InitiativePriority = 'wysoki' | 'normalny'

export type BlockAssignmentSource = 'auto' | 'manual'

// ─── PL labels ──────────────────────────────────────────────────────────────

export const INTERVIEW_CARD_STATUS_PL: Record<InterviewCardStatus, string> = {
    ok: 'OK',
    odmowa: 'Odmowa',
    brak_czasu: 'Brak czasu',
    niechetny: 'Niechętny',
}

/** Tailwind badge classes per status karty (wzorzec CONVERSATION_STATUS_BADGE). */
export const INTERVIEW_CARD_STATUS_BADGE: Record<InterviewCardStatus, string> = {
    ok: 'bg-green-100 text-green-800 border-green-200',
    odmowa: 'bg-red-100 text-red-800 border-red-200',
    brak_czasu: 'bg-amber-100 text-amber-800 border-amber-200',
    niechetny: 'bg-orange-100 text-orange-800 border-orange-200',
}

export const HIRING_SOURCE_PL: Record<HiringSource, string> = {
    widzial: 'Widział',
    slyszal: 'Słyszał',
    plotka: 'Plotka',
}

export const TECH_CATEGORY_PL: Record<TechCategory, string> = {
    jezyk: 'Język / framework',
    chmura: 'Chmura',
    dane: 'Dane',
    devops: 'DevOps',
    security: 'Security',
    inne: 'Inne',
}

export const INITIATIVE_KIND_PL: Record<InitiativeKind, string> = {
    migracja: 'Migracja',
    nowy_system: 'Nowy system',
    ai: 'AI',
    regulacje: 'Regulacje',
    inne: 'Inne',
}

export const INITIATIVE_PRIORITY_PL: Record<InitiativePriority, string> = {
    wysoki: 'Wysoki',
    normalny: 'Normalny',
}

export const INTERVIEW_BLOCKS: InterviewBlock[] = ['B', 'C', 'D']

/** Co pokrywa dany blok — używane w UI (przed rozmową + formularz). */
export const INTERVIEW_BLOCK_PL: Record<InterviewBlock, string> = {
    B: 'Technologie i zespół',
    C: 'Inicjatywy / projekty',
    D: 'Inne firmy (dostawcy)',
}

export const INTERVIEW_CARD_STATUSES: InterviewCardStatus[] = Object.keys(
    INTERVIEW_CARD_STATUS_PL,
) as InterviewCardStatus[]
export const HIRING_SOURCES: HiringSource[] = Object.keys(HIRING_SOURCE_PL) as HiringSource[]
export const TECH_CATEGORIES: TechCategory[] = Object.keys(TECH_CATEGORY_PL) as TechCategory[]
export const INITIATIVE_KINDS: InitiativeKind[] = Object.keys(INITIATIVE_KIND_PL) as InitiativeKind[]
export const INITIATIVE_PRIORITIES: InitiativePriority[] = Object.keys(
    INITIATIVE_PRIORITY_PL,
) as InitiativePriority[]

// ─── Slug (stabilny klucz technologii pod sync z NEXUS) ─────────────────────

/**
 * Kebab-case slug z nazwy technologii. Generowany RAZ przy utworzeniu pozycji;
 * rename słownika NIE zmienia sluga (kotwica pod integracje).
 * Znaki specjalne branżowych nazw mają jawne mapowania ('#' → '-sharp',
 * '+' → '-plus'), żeby "C#"/"C++" nie kolidowały z "C".
 */
export function generateTechSlug(name: string): string {
    const slug = name
        .trim()
        .toLowerCase()
        .replace(/#/g, '-sharp')
        .replace(/\+/g, '-plus')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ł/g, 'l')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-{2,}/g, '-')
    return slug
}

// ─── Row interfaces (1:1 z DB, snake_case) ──────────────────────────────────

export interface TechnologyRow {
    id: string
    name: string
    slug: string
    aliases: string[]
    category: TechCategory
    is_verified: boolean
    created_by: string | null
    created_at: string
    updated_at: string
}

export interface VendorRow {
    id: string
    name: string
    is_verified: boolean
    created_by: string | null
    created_at: string
    updated_at: string
}

export interface ClientAreaRow {
    id: string
    client_id: string
    name: string
    created_by: string | null
    created_at: string
}

export interface TechInterviewCardRow {
    id: string
    contractor_id: string
    placement_id: string | null
    tcm_id: string | null
    client_id: string
    client_area_id: string | null
    interview_date: string
    block: InterviewBlock
    status: InterviewCardStatus | null
    is_draft: boolean
    finalized_at: string | null
    satisfaction: number | null
    satisfaction_comment: string | null
    project_end_month: number | null
    project_end_year: number | null
    project_end_unknown: boolean
    hiring: boolean | null
    hiring_roles: string[]
    hiring_source: HiringSource | null
    memorable_quote: string | null
    tech_old_new: string | null
    team_size: number | null
    team_externals: number | null
    vendors_note: string | null
    project_end_alerted_at: string | null
    demand_alerted_at: string | null
    created_by: string | null
    created_at: string
    updated_at: string
}

export interface CardInitiativeRow {
    id: string
    card_id: string
    name: string
    kind: InitiativeKind
    priority: InitiativePriority
}

export interface TechBlockAssignmentRow {
    id: string
    contractor_id: string
    period_year: number
    period_quarter: number
    block: InterviewBlock
    source: BlockAssignmentSource
    assigned_by: string | null
    created_at: string
    updated_at: string
}

// ─── View models ────────────────────────────────────────────────────────────

export interface CardListItem {
    id: string
    contractorId: string
    contractorName: string
    clientId: string
    clientName: string
    areaName: string | null
    interviewDate: string
    block: InterviewBlock
    status: InterviewCardStatus | null
    isDraft: boolean
    tcmId: string | null
    tcmName: string | null
    hiring: boolean | null
    satisfaction: number | null
}

export interface InitiativeInput {
    name: string
    kind: InitiativeKind
    priority: InitiativePriority
}

/** Wspólny kształt zapisu karty (draft i finalizacja walidują ten sam input). */
export interface CardInput {
    contractorId: string
    clientId: string
    clientAreaId: string | null
    interviewDate: string
    block: InterviewBlock
    status: InterviewCardStatus | null
    satisfaction: number | null
    satisfactionComment: string | null
    projectEndMonth: number | null
    projectEndYear: number | null
    projectEndUnknown: boolean
    hiring: boolean | null
    hiringRoles: string[]
    hiringSource: HiringSource | null
    memorableQuote: string | null
    techOldNew: string | null
    teamSize: number | null
    teamExternals: number | null
    vendorsNote: string | null
    technologyIds: string[]
    vendorIds: string[]
    initiatives: InitiativeInput[]
}

export interface CardDetail {
    card: TechInterviewCardRow
    contractorName: string
    clientName: string
    areaName: string | null
    tcmName: string | null
    technologies: Array<{ id: string; name: string }>
    vendors: Array<{ id: string; name: string }>
    initiatives: CardInitiativeRow[]
}

/** Wpis wspólnej osi czasu „co już wiemy" (karty + log rozmów opieki). */
export interface BriefTimelineEntry {
    kind: 'card' | 'conversation'
    id: string
    date: string
    /** Karta: 'B'/'C'/'D'; rozmowa: kategoria z logu opieki. */
    label: string
    summary: string
    status: string | null
}

export interface PreInterviewBrief {
    contractor: {
        id: string
        fullName: string
        currentClient: string | null
        currentPosition: string | null
        ownerTcmName: string | null
    }
    plannedBlock: {
        block: InterviewBlock
        /** 'assigned' = wiersz w tech_block_assignments; 'computed' = wyliczony czysto (bez zapisu). */
        basis: 'assigned' | 'computed'
        source: BlockAssignmentSource | null
    }
    /** Prefill klienta: dopasowanie current_client → clients (albo null gdy brak). */
    matchedClientId: string | null
    matchedClientName: string | null
    latestCardByBlock: Record<InterviewBlock, { id: string; interviewDate: string; isDraft: boolean } | null>
    timeline: BriefTimelineEntry[]
    /** Dni od ostatniej sfinalizowanej karty (null = nigdy). */
    daysSinceLastCard: number | null
}
