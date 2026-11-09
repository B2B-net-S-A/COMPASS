// Rejestr przełączników Akademii (B0.4). Każdy kanał, który mógłby coś wysłać albo
// zmienić dane poza aplikacją, stoi za zmienną RUNTIME w vaulcie Coolify.
//
// Włącza wyłącznie dosłowna wartość `true`: literówka, `1` albo pusta wartość zostawiają
// kanał wyłączony. Aplikacja tylko odczytuje stan. Zmiana to vault i restart, nigdy
// przycisk, bo jedno kliknięcie nie może niczego wypuścić.
//
// Plik jest czysty (bez `server-only`), jak `lib/hr/moved-to-nexus.ts`. Komponent kliencki
// nie może pytać o przełącznik sam, bo `process.env` w przeglądarce jest pusty; stan
// dostaje propsem od serwera.

export const ACADEMY_SWITCHES = [
    'ACADEMY_MAIL_ENABLED',
    'ACADEMY_MAIL_SENDER_ENABLED',
    'ACADEMY_PASS_ENABLED',
    'ACADEMY_LEARNER_SYNC_ENABLED',
    'ACADEMY_TEAMS_ENABLED',
    'ACADEMY_GRAPH_RECORDINGS_ENABLED',
    'ACADEMY_AI_DRAFTS_ENABLED',
    'ACADEMY_PUBLIC_VERIFY_ENABLED',
    'ACADEMY_RETRIEVAL_ENABLED',
    'ACADEMY_MATERIAL_CLEANUP_ENABLED',
] as const
export type AcademySwitch = (typeof ACADEMY_SWITCHES)[number]

export const ACADEMY_SWITCH_LABELS: Readonly<Record<AcademySwitch, string>> = {
    ACADEMY_MAIL_ENABLED: 'Poczta Akademii',
    ACADEMY_MAIL_SENDER_ENABLED: 'Osobna skrzynka nadawcza Akademii',
    ACADEMY_PASS_ENABLED: 'Przepustka konta nauki',
    ACADEMY_LEARNER_SYNC_ENABLED: 'Automat tożsamości kont nauki',
    ACADEMY_TEAMS_ENABLED: 'Spotkania Teams z uczestnikami',
    ACADEMY_GRAPH_RECORDINGS_ENABLED: 'Pobieranie nagrań z Microsoft Graph',
    ACADEMY_AI_DRAFTS_ENABLED: 'Szkice pytań z AI',
    ACADEMY_PUBLIC_VERIFY_ENABLED: 'Publiczna weryfikacja certyfikatu',
    ACADEMY_RETRIEVAL_ENABLED: 'Powtórki po szkoleniu',
    ACADEMY_MATERIAL_CLEANUP_ENABLED: 'Usuwanie porzuconych materiałów',
}

export function isAcademySwitchOn(name: AcademySwitch, env: NodeJS.ProcessEnv = process.env): boolean {
    return env[name] === 'true'
}

export function academySwitchStates(env: NodeJS.ProcessEnv = process.env): ReadonlyArray<{ name: AcademySwitch; label: string; enabled: boolean }> {
    return ACADEMY_SWITCHES.map(name => ({ name, label: ACADEMY_SWITCH_LABELS[name], enabled: isAcademySwitchOn(name, env) }))
}
