'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { LEARNER_INFO_ACCEPTANCE } from '@/lib/academy/learner-info'
import { createClient } from '@/lib/supabase/client'

const GENERIC_ERROR = 'Nie udało się wejść. Spróbuj ponownie za chwilę.'

export function LearnerPassForm({ token, version }: { token: string; version: string }) {
    const [pending, setPending] = useState(false)
    const [error, setError] = useState<string | null>(null)

    async function enter() {
        setPending(true)
        setError(null)
        try {
            const response = await fetch(`/api/akademia/wejscie/${encodeURIComponent(token)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accepted: true, version }),
            })
            const body = await response.json().catch(() => ({})) as { tokenHash?: string; error?: string }
            if (!response.ok || !body.tokenHash) {
                setError(body.error ?? GENERIC_ERROR)
                return
            }
            const { error: otpError } = await createClient().auth.verifyOtp({ token_hash: body.tokenHash, type: 'magiclink' })
            if (otpError) {
                setError(GENERIC_ERROR)
                return
            }
            window.location.assign('/learning')
        } catch {
            setError(GENERIC_ERROR)
        } finally {
            setPending(false)
        }
    }

    return (
        <div className="space-y-2">
            <Button type="button" className="w-full" disabled={pending} onClick={enter}>
                {pending ? 'Proszę czekać…' : 'Wchodzę do Akademii'}
            </Button>
            <p className="text-xs text-muted-foreground">{LEARNER_INFO_ACCEPTANCE}</p>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
    )
}
