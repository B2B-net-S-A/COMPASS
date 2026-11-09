// Klauzula informacyjna konta nauki (B1.8). Tekst jest wersjonowany: `info_version` na koncie
// mówi, którą wersję osoba przyjęła, więc zmiana treści wymaga nowego numeru i ponownej zgody.
// Treść robocza do czasu opinii prawnika. Ostateczny tekst jest warunkiem bramki startu.

export const CURRENT_LEARNER_INFO_VERSION = 'robocza-2026-11'
export const LEARNER_INFO_IS_DRAFT = true

export interface LearnerInfoRow {
    label: string
    value: string
}

export const LEARNER_INFO_TITLE = 'Twoje dane w Akademii COMPASS'

export const LEARNER_INFO_ROWS: readonly LearnerInfoRow[] = [
    { label: 'Administrator', value: 'B2B Network S.A.' },
    { label: 'Cel', value: 'dostęp do szkolenia, wynik testu, zaświadczenie' },
    { label: 'Podstawa', value: 'prawnie uzasadniony interes administratora' },
    { label: 'Okres', value: 'czas ważności zaświadczenia' },
]

export const LEARNER_INFO_ACCEPTANCE = 'Naciskając przycisk, potwierdzasz zapoznanie się z informacją o danych i regulaminem. Hasła nie ustawiasz.'

/** Czy konto przyjęło aktualną wersję. Inna wersja albo jej brak wymaga ponownego przyjęcia. */
export function learnerInfoAccepted(account: { info_accepted_at: string | null; info_version: string | null }): boolean {
    return account.info_accepted_at !== null && account.info_version === CURRENT_LEARNER_INFO_VERSION
}
