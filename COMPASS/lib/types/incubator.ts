// Phase 5 (2026-05-04): Inkubator types

export type PitchStatus = 'draft' | 'submitted' | 'under_review' | 'in_negotiation' | 'accepted' | 'rejected'
export type ProjectStatus = 'open' | 'in_progress' | 'completed' | 'cancelled'
export type ApplicationStatus = 'submitted' | 'shortlisted' | 'accepted' | 'rejected'

export interface IncubatorPitch {
    id: string
    submitter_id: string
    title: string
    description_md: string
    attachment_urls: string[]
    equity_ask: string | null
    investment_ask_pln: number | null
    status: PitchStatus
    nda_accepted_at: string
    reviewer_id: string | null
    review_notes_md: string | null
    created_at: string
    updated_at: string
}

export interface IncubatorPitchListItem extends IncubatorPitch {
    submitter_name: string | null
    reviewer_name: string | null
}

export interface CreatePitchInput {
    title: string
    description_md: string
    attachment_urls?: string[]
    equity_ask?: string
    investment_ask_pln?: number
    nda_accepted_at: string
}

export interface IncubatorProject {
    id: string
    owner_id: string
    title: string
    slug: string
    description_md: string
    tech_stack: string[]
    compensation_model: string | null
    status: ProjectStatus
    opens_at: string | null
    closes_at: string | null
    created_at: string
    updated_at: string
}

export interface IncubatorProjectListItem extends IncubatorProject {
    application_count: number
    user_application_status: ApplicationStatus | null
}

export interface CreateProjectInput {
    title: string
    description_md: string
    tech_stack?: string[]
    compensation_model?: string
}

export interface IncubatorApplication {
    id: string
    project_id: string
    applicant_id: string
    motivation_md: string
    status: ApplicationStatus
    created_at: string
    updated_at: string
}

export interface IncubatorApplicationWithMeta extends IncubatorApplication {
    applicant_name: string | null
    project_title: string
    project_slug: string
}

// Audyt 2026-08 (B1): ten sam kształt był zdefiniowany niezależnie w trzech
// plikach typów. Kanoniczna definicja mieszka teraz w lib/actions/action-result.ts
// razem z `runAction` i `ExpectedError`; ten alias zostaje, żeby nie przepisywać
// całych modułów naraz. Nowy kod importuje bezpośrednio stamtąd.
export type IncubatorActionResult<T> = import('@/lib/actions/action-result').ActionResult<T>

export const PITCH_STATUS_LABEL: Record<PitchStatus, string> = {
    draft: 'Wersja robocza',
    submitted: 'Złożone',
    under_review: 'W trakcie analizy',
    in_negotiation: 'Negocjacje',
    accepted: 'Zaakceptowane',
    rejected: 'Odrzucone',
}

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
    open: 'Otwarte',
    in_progress: 'W trakcie',
    completed: 'Zakończone',
    cancelled: 'Anulowane',
}

export const APPLICATION_STATUS_LABEL: Record<ApplicationStatus, string> = {
    submitted: 'Złożona',
    shortlisted: 'Wstępnie zaakceptowana',
    accepted: 'Zaakceptowana',
    rejected: 'Odrzucona',
}

export const NDA_TEXT = `Akceptując niniejsze postanowienia, oświadczam, że pomysł / projekt / koncepcja, którą zamierzam zgłosić w Inkubatorze B2Bnetwork, stanowi moją własność intelektualną lub mam do niego prawa.

B2Bnetwork zobowiązuje się do zachowania poufności otrzymanych informacji oraz nieprzekazywania ich osobom trzecim bez mojej zgody. Zgłoszenie pomysłu nie powoduje przeniesienia praw autorskich ani jakiegokolwiek innego prawa do pomysłu na B2Bnetwork.

Otrzymanie zgłoszenia nie stanowi zobowiązania B2Bnetwork do jego oceny w określonym terminie, ani do podjęcia jakichkolwiek działań w jego sprawie. Wszelkie warunki ewentualnej współpracy zostaną ustalone w odrębnej umowie.

Niniejsze oświadczenie nie zastępuje formalnej umowy o zachowaniu poufności (NDA), która może zostać zawarta przez strony w toku dalszych negocjacji.`
