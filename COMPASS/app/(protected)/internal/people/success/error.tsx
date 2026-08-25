'use client'

import { useEffect } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import { SuccessErrorState } from '@/components/internal/success/SuccessStates'
import { logger } from '@/lib/logger'

export default function ConsultantSuccessError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Audyt 2026-08: ta granica połykała błąd bez śladu — ani logu, ani Sentry.
        // Użytkownik widział „coś poszło nie tak", a my nie widzieliśmy niczego.
        logger.error({ event: 'consultant_success_error_boundary', error, digest: error.digest })
        Sentry.captureException(error, { tags: { boundary: 'react' } })
    }, [error])

    return (
        <div className="space-y-4">
            <SuccessErrorState />
            <Button onClick={reset}>Spróbuj ponownie</Button>
        </div>
    )
}
