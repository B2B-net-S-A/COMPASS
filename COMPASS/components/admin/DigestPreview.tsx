'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, Send, Loader2, FileText } from 'lucide-react'

interface DigestResponse {
    success: boolean
    itemCount?: number
    digest?: Array<{ type: string; title: string; body: string; created_at: string; action_url?: string }>
    html?: string
    error?: string
}

/**
 * Admin-side trigger for the daily email digest endpoint (POST /api/digest).
 * Workflow:
 *   1. Enter user UUID
 *   2. Click "Podgląd" → renders digest content (server returns digest items + HTML)
 *   3. Click "Wyślij" → triggers full send with HTML body (Resend integration)
 *
 * Implementation note: this widget calls the existing /api/digest endpoint
 * (defined in app/api/digest/route.ts). When sendEmail=true, the endpoint
 * additionally returns the generated HTML which we render in a <iframe>
 * for accurate visual preview.
 */
export function DigestPreview() {
    const [userId, setUserId] = useState('')
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<DigestResponse | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [withEmail, setWithEmail] = useState(false)

    const callApi = async (sendEmail: boolean) => {
        if (!userId || userId.length < 30) {
            setError('Podaj poprawny UUID użytkownika (≥30 znaków)')
            return
        }
        setLoading(true)
        setError(null)
        setData(null)
        setWithEmail(sendEmail)
        try {
            const response = await fetch('/api/digest', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, sendEmail }),
            })
            const json = await response.json() as DigestResponse
            if (!response.ok) {
                throw new Error(json.error || `HTTP ${response.status}`)
            }
            setData(json)
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Nieznany błąd'
            setError(msg)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="bg-card border-border">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-primary" />
                    Daily Digest — podgląd i wysyłka
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="digest-user-id">User ID (UUID)</Label>
                    <Input
                        id="digest-user-id"
                        type="text"
                        placeholder="00000000-0000-0000-0000-000000000000"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        className="bg-card border-border font-mono text-sm"
                        data-testid="digest-user-id-input"
                    />
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                    <Button
                        onClick={() => callApi(false)}
                        disabled={loading}
                        variant="outline"
                        className="border-border"
                        data-testid="digest-preview-btn"
                    >
                        {loading && !withEmail ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Pobieram...</> : <><FileText className="w-4 h-4 mr-2" /> Podgląd</>}
                    </Button>
                    <Button
                        onClick={() => callApi(true)}
                        disabled={loading}
                        className="bg-primary hover:bg-primary/90"
                        data-testid="digest-send-btn"
                    >
                        {loading && withEmail ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Wysyłam...</> : <><Send className="w-4 h-4 mr-2" /> Wyślij teraz</>}
                    </Button>
                </div>

                {error && (
                    <div className="p-3 rounded-lg border bg-destructive/10 border-destructive/30 text-destructive text-sm">
                        {error}
                    </div>
                )}

                {data?.success && (
                    <div className="space-y-3">
                        <div className="p-3 rounded-lg bg-success/10 border border-success/30 text-success text-sm">
                            ✓ {data.itemCount === 0 ? 'Brak nowych powiadomień (digest pusty — nic nie zostanie wysłane)' : `Digest zawiera ${data.itemCount} ${data.itemCount === 1 ? 'powiadomienie' : 'powiadomień'}.`}
                            {withEmail && data.html && ' Email wysłany.'}
                        </div>

                        {data.digest && data.digest.length > 0 && (
                            <div className="space-y-2">
                                <Label>Zawartość:</Label>
                                <ul className="space-y-1 text-xs text-muted-foreground bg-card p-3 rounded-lg max-h-60 overflow-y-auto">
                                    {data.digest.map((item, i) => (
                                        <li key={i} className="border-b border-border last:border-0 pb-1">
                                            <span className="font-semibold text-foreground">{item.title}</span> — <span>{item.body}</span>
                                            <span className="text-muted-foreground ml-2">({new Date(item.created_at).toLocaleString('pl-PL')})</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {data.html && (
                            <div className="space-y-2">
                                <Label>Podgląd HTML:</Label>
                                <iframe
                                    srcDoc={data.html}
                                    className="w-full h-96 border border-border rounded-lg bg-white"
                                    title="Digest HTML preview"
                                />
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
