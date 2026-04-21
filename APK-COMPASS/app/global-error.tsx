'use client'

import { useEffect } from 'react'

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('[GlobalError]', error)
        window.location.href = '/login'
    }, [error])

    return (
        <html lang="pl">
            <body style={{ margin: 0, fontFamily: 'system-ui', background: '#1D121B', color: '#F3EEF2', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                <p style={{ margin: 0 }}>Przekierowuję do logowania…</p>
            </body>
        </html>
    )
}
