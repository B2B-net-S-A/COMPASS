// Phase 46 — Mapa technologiczna: shared types, enums, PL labels, slug helper.
// Pure module (no I/O) — safe to import from client + server + tests.

// ─── Enums ──────────────────────────────────────────────────────────────────
// Phase 46d: karta wypełniana za jednym zamachem — bez podziału na bloki B/C/D.

export type InterviewCardStatus = 'ok' | 'odmowa' | 'brak_czasu' | 'niechetny'

export type HiringSource = 'widzial' | 'slyszal' | 'plotka'

// „Czy konsultant IT posiada OC zawodowe?" — tri-state jawny. NULL (brak w tym
// typie) = brak odpowiedzi, świadomie różny od jawnego 'nie_wiem'.
export type ProfessionalInsurance = 'tak' | 'nie' | 'nie_wiem'

export type TechCategory = 'jezyk' | 'chmura' | 'dane' | 'devops' | 'security' | 'inne'

export type InitiativeKind = 'migracja' | 'nowy_system' | 'ai' | 'regulacje' | 'inne'

export type InitiativePriority = 'wysoki' | 'normalny'

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

export const PROFESSIONAL_INSURANCE_PL: Record<ProfessionalInsurance, string> = {
    tak: 'Tak',
    nie: 'Nie',
    nie_wiem: 'Nie wiem',
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

export const INTERVIEW_CARD_STATUSES: InterviewCardStatus[] = Object.keys(
    INTERVIEW_CARD_STATUS_PL,
) as InterviewCardStatus[]
export const HIRING_SOURCES: HiringSource[] = Object.keys(HIRING_SOURCE_PL) as HiringSource[]
export const PROFESSIONAL_INSURANCE_OPTIONS: ProfessionalInsurance[] = Object.keys(
    PROFESSIONAL_INSURANCE_PL,
) as ProfessionalInsurance[]
export const TECH_CATEGORIES: TechCategory[] = Object.keys(TECH_CATEGORY_PL) as TechCategory[]
export const INITIATIVE_KINDS: InitiativeKind[] = Object.keys(INITIATIVE_KIND_PL) as InitiativeKind[]
export const INITIATIVE_PRIORITIES: InitiativePriority[] = Object.keys(
    INITIATIVE_PRIORITY_PL,
) as InitiativePriority[]

// „Wielkość zespołu" to wolny tekst/przedział (Phase 46f). Limit MUSI zgadzać się
// z CHECK tech_interview_cards_team_size_len_check (migracja 46g = 80). Egzekwowany
// w walidacji (validateCardBase) i przez maxLength inputu, żeby przekroczenie dało
// przyjazny komunikat, a nie zamaskowany w prod błąd server-action.
export const TEAM_SIZE_MAX = 80

// Tytuł rozmowy (Phase 49) — opcjonalny. Limit MUSI zgadzać się z CHECK
// tech_interview_cards_title_len_check; egzekwowany w validateCardBase i przez
// maxLength inputu (ta sama lekcja co przy „Wielkości zespołu").
export const CARD_TITLE_MAX = 120

/**
 * Tytuł rozmowy do wyświetlenia: własny tytuł TCM albo domyślny
 * „Rozmowa: {konsultant}". Czysty helper — używany przez nagłówek karty,
 * listę kart i formularz (placeholder), żeby default był jeden.
 */
export function cardDisplayTitle(
    title: string | null | undefined,
    contractorName: string,
): string {
    const custom = (title ?? '').trim()
    return custom || defaultCardTitle(contractorName)
}

/** Domyślny tytuł rozmowy, gdy TCM nie nadał własnego. */
export function defaultCardTitle(contractorName: string): string {
    return `Rozmowa: ${contractorName}`
}

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
    /** Własny tytuł rozmowy; NULL = tytuł domyślny (cardDisplayTitle). */
    title: string | null
    interview_date: string
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
    /** „Czy konsultant IT posiada OC zawodowe?": tak/nie/nie_wiem; NULL = brak odpowiedzi. */
    professional_insurance: ProfessionalInsurance | null
    memorable_quote: string | null
    tech_old_new: string | null
    team_size: string | null
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

// ─── View models ────────────────────────────────────────────────────────────

export interface CardListItem {
    id: string
    contractorId: string
    contractorName: string
    /** Surowy tytuł z DB (null = domyślny) — lista woła cardDisplayTitle. */
    title: string | null
    clientId: string
    clientName: string
    areaName: string | null
    interviewDate: string
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
    /** Pusty/whitespace = wróć do tytułu domyślnego. */
    title: string | null
    interviewDate: string
    status: InterviewCardStatus | null
    satisfaction: number | null
    satisfactionComment: string | null
    projectEndMonth: number | null
    projectEndYear: number | null
    projectEndUnknown: boolean
    hiring: boolean | null
    hiringRoles: string[]
    hiringSource: HiringSource | null
    /** „Czy konsultant IT posiada OC zawodowe?" — null = brak odpowiedzi. */
    professionalInsurance: ProfessionalInsurance | null
    memorableQuote: string | null
    techOldNew: string | null
    teamSize: string | null
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
    /** Karta: „Karta"; rozmowa: kategoria z logu opieki. */
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
    /** Prefill klienta: dopasowanie current_client → clients (albo null gdy brak). */
    matchedClientId: string | null
    matchedClientName: string | null
    /** Najnowsza karta konsultanta (null = jeszcze żadnej). */
    latestCard: { id: string; interviewDate: string; isDraft: boolean } | null
    timeline: BriefTimelineEntry[]
    /** Dni od ostatniej sfinalizowanej karty (null = nigdy). */
    daysSinceLastCard: number | null
}
