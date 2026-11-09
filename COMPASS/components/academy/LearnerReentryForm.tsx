'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const UNAVAILABLE = 'Nie możemy teraz wysłać linku. Napisz do organizatora szkolenia.'

export function LearnerReentryForm() {
    const [email, setEmail] = useState('')
    const [pending, setPending] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    async function submit(event: FormEvent) {
        event.preventDefault()
        setPending(true)
        setMessage(null)
        setError(null)
        try {
            const response = await fetch('/api/akademia/wejscie/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            })
            const body = await response.json().catch(() => ({})) as { message?: string }
            if (response.ok && body.message) setMessage(body.message)
            else setError(UNAVAILABLE)
        } catch {
            setError(UNAVAILABLE)
        } finally {
            setPending(false)
        }
    }

    return (
        <form onSubmit={submit} className="space-y-3">
            <div className="space-y-2">
                <label htmlFor="learner-email" className="text-sm font-medium">Adres e-mail</label>
                <Input id="learner-email" type="email" required autoComplete="email" maxLength={320} value={email} onChange={event => setEmail(event.target.value)} disabled={pending} />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>{pending ? 'Proszę czekać…' : 'Wyślij link'}</Button>
            {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </form>
    )
}
