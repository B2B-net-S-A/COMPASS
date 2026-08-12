// Phase 48 — Monitoring prawny: typy domenowe + etykiety PL.
//
// Moduł NICZEGO nie pobiera z internetu — czyta wyłącznie dwie tabele, które
// zasila zewnętrzny pipeline AI (zadanie cykliczne, dni robocze ~7:30). Wartości
// źródeł/tematów/severity/statusów są pilnowane przez CHECK-i w bazie; te unie
// muszą się z nimi zgadzać (patrz migracja 20260810121224_legal_monitoring_tables).

export const LEGAL_MONITOR_SOURCES = [
    'GIP',
    'EUREKA',
    'SN',
    'NSA_WSA',
    'ZUS',
    'SEJM_RCL',
    'TK',
    // Phase 50b — pozycje, których pierwotnym źródłem jest omówienie, a nie
    // rejestr urzędowy (prawo.pl, porozmawiajmyopodatkach.pl, newsletter
    // Andersen, estonskicit.com). Gdy pipeline dociera do samego orzeczenia,
    // nadal używa kodu rejestru, a prasę podaje w `source_label`.
    'PRASA',
] as const
export type LegalMonitorSource = (typeof LEGAL_MONITOR_SOURCES)[number]

export const LEGAL_MONITOR_TOPICS = [
    'pip_b2b',
    'cit_estonski',
    'zus_samozatrudnienie',
    'legislacja',
    'tk_pip',
] as const
export type LegalMonitorTopic = (typeof LEGAL_MONITOR_TOPICS)[number]

export const LEGAL_MONITOR_SEVERITIES = ['red', 'yellow', 'green'] as const
export type LegalMonitorSeverity = (typeof LEGAL_MONITOR_SEVERITIES)[number]

export const LEGAL_MONITOR_STATUSES = ['new', 'reviewed', 'action_required', 'dismissed'] as const
export type LegalMonitorStatus = (typeof LEGAL_MONITOR_STATUSES)[number]

/**
 * Statusy, które może nadać przeglądający. `new` ustawia wyłącznie pipeline przy
 * dopisaniu wpisu — moduł nie cofa pozycji do skrzynki (workflow ze specyfikacji:
 * new → reviewed | action_required | dismissed).
 */
export const LEGAL_MONITOR_REVIEW_STATUSES = ['reviewed', 'action_required', 'dismissed'] as const
export type LegalMonitorReviewStatus = (typeof LEGAL_MONITOR_REVIEW_STATUSES)[number]

export type LegalMonitorRunStatus = 'ok' | 'partial' | 'failed'
/** Wartości w `legal_monitor_runs.sources_checked`. */
export type LegalMonitorSourceHealth = 'ok' | 'fail' | 'empty'

export const REVIEW_NOTE_MAX = 2000

export interface LegalMonitorItemRow {
    id: string
    source: LegalMonitorSource
    /** Czytelna nazwa źródła od pipeline'u, np. „WSA w Łodzi". */
    source_label: string
    topic: LegalMonitorTopic
    severity: LegalMonitorSeverity
    /** Data dokumentu źródłowego; null dla pozycji „statusowych". */
    published_at: string | null
    /** Sygnatura / numer, np. „I SA/Łd 598/25". */
    reference: string | null
    title: string
    url: string | null
    summary: string
    why_it_matters: string
    status: LegalMonitorStatus
    reviewed_by: string | null
    reviewed_at: string | null
    review_note: string | null
    created_at: string
    /** Phase 50 — termin reakcji (sensowny przy status=action_required). */
    due_date: string | null
    /** Phase 50 — kto ma zareagować; null = przypomnienie idzie do odbiorców alertów. */
    assigned_to: string | null
    /** Phase 50 — stempel alertu o czerwonym wpisie; null = jeszcze nie alertowano. */
    alerted_at: string | null
    /**
     * Phase 52 — kiedy wpis przypięto na górę skrzynki; null = nieprzypięty.
     * Pinezka jest wspólna dla zespołu i ortogonalna do statusu (przegląd jej nie
     * zdejmuje) — patrz nota w migracji phase52_legal_monitor_pin.
     */
    pinned_at: string | null
    /** Phase 52 — kto przypiął; null, gdy nieprzypięty albo konto usunięte. */
    pinned_by: string | null
    /** Dołączane przez server action (split query po profiles — bez embed-by-FK). */
    reviewed_by_name: string | null
    assigned_to_name: string | null
    pinned_by_name: string | null
}

export interface LegalMonitorRunRow {
    id: string
    run_at: string
    window_from: string | null
    status: LegalMonitorRunStatus
    items_found: number
    sources_checked: Partial<Record<LegalMonitorSource, LegalMonitorSourceHealth>>
    notes: string | null
}

export const LEGAL_SOURCE_LABELS_PL: Record<LegalMonitorSource, string> = {
    GIP: 'PIP / Główny Inspektorat Pracy',
    EUREKA: 'Interpretacje podatkowe (EUREKA / KIS)',
    SN: 'Sąd Najwyższy',
    NSA_WSA: 'Sądy administracyjne (NSA / WSA)',
    ZUS: 'ZUS',
    SEJM_RCL: 'Sejm / RCL (legislacja)',
    TK: 'Trybunał Konstytucyjny',
    PRASA: 'Prasa i komentarze branżowe',
}

/** Krótka forma do badge'a w wierszu listy — pełna nazwa jest w `source_label`. */
export const LEGAL_SOURCE_SHORT_PL: Record<LegalMonitorSource, string> = {
    GIP: 'PIP/GIP',
    EUREKA: 'Interpretacje',
    SN: 'SN',
    NSA_WSA: 'NSA/WSA',
    ZUS: 'ZUS',
    SEJM_RCL: 'Sejm/RCL',
    TK: 'TK',
    PRASA: 'Prasa',
}

export const LEGAL_TOPIC_LABELS_PL: Record<LegalMonitorTopic, string> = {
    pip_b2b: 'B2B a art. 22 KP (PIP)',
    cit_estonski: 'Estoński CIT',
    zus_samozatrudnienie: 'ZUS / samozatrudnienie',
    legislacja: 'Legislacja',
    tk_pip: 'TK — ustawa o PIP',
}

interface SeverityMeta {
    label: string
    /** Co ten poziom znaczy dla użytkownika (semantyka ze specyfikacji). */
    hint: string
    dot: string
    /** Klasy tokenowe DS — bez hardcodowanych kolorów. */
    className: string
}

export const LEGAL_SEVERITY_META: Record<LegalMonitorSeverity, SeverityMeta> = {
    red: {
        label: 'Może wymagać decyzji',
        hint: 'Dotyczy wprost modelu firmy — do rozstrzygnięcia, czy reagujemy.',
        dot: '🔴',
        className: 'bg-destructive/15 text-destructive border-destructive/30',
    },
    yellow: {
        label: 'Do omówienia',
        hint: 'Kierunkowa wskazówka lub linia orzecznicza — na spotkanie finansowo-prawne.',
        dot: '🟡',
        className: 'bg-warning/15 text-warning border-warning/30',
    },
    green: {
        label: 'Kontekst',
        hint: 'Do wiadomości, bez potrzeby działania.',
        dot: '🟢',
        className: 'bg-success/15 text-success border-success/30',
    },
}

export const LEGAL_STATUS_META: Record<LegalMonitorStatus, { label: string; className: string }> = {
    new: { label: 'Nowe', className: 'bg-primary/15 text-primary border-primary/30' },
    reviewed: { label: 'Przejrzane', className: 'bg-success/15 text-success border-success/30' },
    action_required: {
        label: 'Do reakcji',
        className: 'bg-destructive/15 text-destructive border-destructive/30',
    },
    dismissed: { label: 'Odrzucone', className: 'bg-muted text-muted-foreground border-border' },
}

export const LEGAL_RUN_SOURCE_HEALTH_LABELS_PL: Record<LegalMonitorSourceHealth, string> = {
    ok: 'nowości',
    empty: 'bez nowości',
    fail: 'niedostępne',
}

/** Kolejność pilności: red → yellow → green (zgodna z ORDER BY ze specyfikacji). */
export const SEVERITY_RANK: Record<LegalMonitorSeverity, number> = { red: 0, yellow: 1, green: 2 }

export function isReviewStatus(value: string): value is LegalMonitorReviewStatus {
    return (LEGAL_MONITOR_REVIEW_STATUSES as ReadonlyArray<string>).includes(value)
}
