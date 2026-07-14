'use client'

import { Button } from '@/components/ui/button'
import { SuccessErrorState } from '@/components/internal/success/SuccessStates'

export default function ConsultantSuccessError({ error: _error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <div className="space-y-4">
            <SuccessErrorState />
            <Button onClick={reset}>Spróbuj ponownie</Button>
        </div>
    )
}
