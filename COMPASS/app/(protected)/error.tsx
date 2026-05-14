'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'
import { logger } from '@/lib/logger'

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        logger.error({ event: 'protected_error_boundary', error, digest: error.digest })
    }, [error])

    return (
        <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-2 text-center">
                <div className="rounded-full bg-destructive/10 p-4">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <h2 className="text-2xl font-bold tracking-tight">Coś poszło nie tak!</h2>
                <p className="text-muted-foreground">
                    Wystąpił błąd podczas ładowania tej strony. Spróbuj odświeżyć.
                </p>
                {process.env.NODE_ENV === 'development' && (
                    <div className="mt-4 p-4 bg-slate-950 rounded-lg border border-red-500/20 text-left w-full max-w-lg overflow-auto">
                        <code className="text-xs text-red-400 font-mono break-all">
                            {error.message}
                        </code>
                    </div>
                )}
            </div>
            <Button onClick={() => reset()} variant="default">
                Spróbuj ponownie
            </Button>
        </div>
    )
}
