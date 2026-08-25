'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/logger'

export default function GlobalError({
    error,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        logger.error({ event: 'global_error', error, digest: error.digest })
        // Audyt 2026-08: przekierowanie na /login zabierało stronę razem z błędem,
        // a do Sentry nie szło NIC — awaria całego drzewa (najcięższy przypadek,
        // bo global-error łapie też błędy w layoucie roota) była dla nas niewidzialna.
        // Nawigujemy dopiero po `flush`, inaczej wyjście ze strony ubija żądanie
        // z eventem. Limit czasu jest krótki, a `.finally` gwarantuje, że
        // niedostępne Sentry nie zatrzyma użytkownika na tym ekranie.
        Sentry.captureException(error, { tags: { boundary: 'global' } })
        Sentry.flush(2000)
            .catch(() => undefined)
            .finally(() => {
                window.location.href = '/login'
            })
    }, [error])

    return (
        <html lang="pl">
            <body style={{ margin: 0, fontFamily: 'system-ui', background: '#1D121B', color: '#F3EEF2', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <p style={{ margin: 0 }}>Przekierowuję do logowania…</p>
            </body>
        </html>
    )
}
