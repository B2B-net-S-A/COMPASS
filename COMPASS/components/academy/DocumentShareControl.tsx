'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { setCertificateShare } from '@/lib/actions/academy-document-share'

export function DocumentShareControl({ completionId, origin, initialEnabled, initialCode }: { completionId: string; origin: string; initialEnabled: boolean; initialCode: string | null }) {
    const [enabled, setEnabled] = useState(initialEnabled)
    const [code, setCode] = useState(initialCode)
    const [error, setError] = useState<string | null>(null)
    const [pending, start] = useTransition()
    const toggle = () => start(async () => {
        setError(null)
        const result = await setCertificateShare(completionId, !enabled).catch(() => null)
        if (!result?.success) { setError(result?.error ?? 'Nie udało się zapisać. Spróbuj ponownie.'); return }
        setEnabled(result.data.enabled)
        setCode(result.data.code)
    })
    const link = enabled && code ? `${origin}/v/${code}` : null
    return <div className="space-y-2 rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Link weryfikacji</h2>
        <p className="text-sm text-muted-foreground">Osoba z linkiem zobaczy Twoje imię i nazwisko, szkolenie, datę i ważność. Nie zobaczy wyniku testu. Możesz go wyłączyć w każdej chwili.</p>
        {link && <p className="break-all rounded-lg bg-muted p-2 text-sm">{link}</p>}
        <Button type="button" variant="outline" disabled={pending} onClick={toggle}>{enabled ? 'Wyłącz link' : 'Włącz link weryfikacji'}</Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
}
