/**
 * Audyt 2026-08 (C5) — jedno miejsce prawdy o schemacie `um_legal_documents`.
 *
 * Rozjazd, który to zamyka: kod ZASILAJĄCY tabelę
 * (`app/api/migrate-compliance/route.ts`) zakładał schemat `slug` + `content_html`
 * + `visibility`, a produkcja ma `document_type` + `content` + `effective_date`,
 * z CHECK-iem na cztery wartości i UNIQUE(document_type, version). Upsert po
 * nieistniejącej kolumnie `slug` kończył się błędem PostgREST 42703, którego
 * trasa nie podnosiła — zwracała `success: true` z awarią schowaną w
 * `results[].error`. Seed „przechodził" i nic nie wgrywał.
 *
 * Czytelnik (`lib/actions/compliance.ts`) miał już własną, prywatną kopię tej
 * mapy. Dwie kopie tej samej wiedzy po dwóch stronach rozjazdu to dokładnie ten
 * stan, w którym seed jest „zielony", a treść nigdy nie dociera — dlatego mapa
 * mieszka teraz w jednym module, którego używają oba końce.
 *
 * Zwykły moduł (bez 'use server'): to stałe, nie endpoint.
 */

/**
 * Wartości dopuszczone przez `um_legal_documents_document_type_check` na produkcji
 * (zweryfikowane odczytem `pg_get_constraintdef`, 2026-08-25).
 *
 * Ta lista jest KRÓTSZA niż zbiór slugów, które aplikacja serwuje — i tak ma
 * zostać, dopóki nikt świadomie nie poszerzy CHECK-a migracją. Dokumenty poza
 * listą (`help`, `security`, `data-retention`, …) są serwowane z pakietu:
 * `lib/constants/fallback-docs.ts`.
 */
export const LEGAL_DOCUMENT_TYPES = [
    'privacy_policy',
    'terms_of_service',
    'gdpr_consent',
    'other',
] as const

export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number]

/**
 * Slug ze ścieżki (`/privacy-policy`, `/terms`, `/docs/[slug]`) → `document_type`.
 *
 * Zawiera też wartości spoza CHECK-a — czytelnik używa ich do próby odczytu
 * (nietrafiony `.eq()` po prostu nic nie zwraca), a `documentTypeForSlug()`
 * odsiewa je przy zapisie.
 */
export const SLUG_TO_DOCUMENT_TYPE: Record<string, string> = {
    'privacy-policy': 'privacy_policy',
    terms: 'terms_of_service',
    help: 'help_center',
    'ai-notice': 'ai_notice',
    security: 'security',
    cooperation: 'cooperation',
    'electronic-signature': 'electronic_signature',
    'access-management': 'access_management',
    'incident-response': 'incident_response',
    'data-retention': 'data_retention',
}

/**
 * Zwraca `document_type` nadający się DO ZAPISU, albo `null`, gdy CHECK go nie
 * dopuszcza. Wywołujący ma wtedy pominąć dokument — próba zapisu skończyłaby się
 * naruszeniem ograniczenia (23514), czyli kolejnym cicho połkniętym błędem seeda.
 */
export function documentTypeForSlug(slug: string): LegalDocumentType | null {
    const mapped = SLUG_TO_DOCUMENT_TYPE[slug] ?? slug
    return (LEGAL_DOCUMENT_TYPES as readonly string[]).includes(mapped)
        ? (mapped as LegalDocumentType)
        : null
}
