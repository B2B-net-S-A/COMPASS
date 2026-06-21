'use client'

import { useEffect } from 'react'
import { logger } from '@/lib/logger'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        logger.error({ event: 'admin_error_boundary', error, digest: error.digest })
    }, [error])

    return (
        <div className="p-10 text-foreground bg-destructive/10 border border-destructive rounded-lg m-4">
            <h2 className="text-2xl font-bold mb-4">Coś poszło nie tak w panelu administracji!</h2>
            <div className="bg-muted p-4 rounded mb-4 font-mono text-sm break-all">
                {error.message}
            </div>
            <button
                onClick={() => reset()}
                className="px-4 py-2 bg-destructive hover:bg-destructive/90 rounded text-destructive-foreground"
            >
                Spróbuj ponownie
            </button>
        </div>
    )
}
