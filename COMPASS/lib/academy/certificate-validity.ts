/** Ile dni przed końcem ważności przypominamy i pokazujemy ostrzeżenie. */
export const CERTIFICATE_EXPIRY_NOTICE_DAYS = 30

export type CertificateValidityState = 'revoked' | 'unlimited' | 'valid' | 'expiring' | 'expired'

export interface CertificateValidity {
    state: CertificateValidityState
    validUntil: string | null
}

/** Stan dokumentu z zamrożonej migawki. Migawka bez daty to dokument bezterminowy. */
export function certificateValidity(
    snapshot: { valid_until?: string | null } | null | undefined,
    revokedAt: string | null | undefined,
    now: number = Date.now(),
): CertificateValidity {
    const raw = snapshot?.valid_until ?? null
    const until = raw ? Date.parse(raw) : NaN
    const validUntil = Number.isFinite(until) ? raw : null
    if (revokedAt) return { state: 'revoked', validUntil }
    if (validUntil === null) return { state: 'unlimited', validUntil: null }
    if (until <= now) return { state: 'expired', validUntil }
    return { state: until - now <= CERTIFICATE_EXPIRY_NOTICE_DAYS * 86_400_000 ? 'expiring' : 'valid', validUntil }
}

export function formatValidityDate(iso: string): string {
    return new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Warsaw' }).format(new Date(iso))
}

/** Krótki opis stanu do listy administratora i strony statusu. */
export function certificateValidityLabel({ state, validUntil }: CertificateValidity): string {
    if (state === 'revoked') return 'Unieważniony'
    if (state === 'unlimited' || !validUntil) return 'Bezterminowy'
    if (state === 'expired') return `Wygasł ${formatValidityDate(validUntil)}`
    return `Ważny do ${formatValidityDate(validUntil)}`
}
