/**
 * Compliance constants for the ComPass platform.
 * Update CURRENT_TERMS_VERSION when any legal document changes — this forces re-acceptance.
 */

export const CURRENT_TERMS_VERSION = '1.0'

/** Checkboxes required on the consent screen */
export const CONSENT_REQUIRED_CHECKBOXES = [
  'terms',
  'privacy',
  'data_processing',
  'ai',
] as const

export type ConsentCheckboxKey = (typeof CONSENT_REQUIRED_CHECKBOXES)[number]

/** Documents visible without authentication (login page footer) */
export const PUBLIC_DOCS = ['privacy-policy', 'terms', 'help'] as const

/** Documents visible to authenticated users */
export const AUTH_DOCS = ['security', 'cooperation', 'ai-notice', 'electronic-signature'] as const

/** Documents visible only to administrators */
export const ADMIN_DOCS = ['access-management', 'incident-response', 'data-retention'] as const

/** Labels for consent checkboxes (Polish) */
export const CONSENT_LABELS: Record<ConsentCheckboxKey, { text: string; docSlug?: string }> = {
  terms: {
    text: 'Akceptuję Regulamin platformy ComPass',
    docSlug: 'terms',
  },
  privacy: {
    text: 'Zapoznałem/am się z Polityką prywatności',
    docSlug: 'privacy-policy',
  },
  data_processing: {
    text: 'Wyrażam zgodę na przetwarzanie danych osobowych zgodnie z RODO',
  },
  ai: {
    text: 'Akceptuję korzystanie z narzędzi AI w systemie',
    docSlug: 'ai-notice',
  },
}
