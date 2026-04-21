'use client'

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Mail, Save, Loader2 } from "lucide-react"
import { useState, useEffect } from "react"
import { getSystemSetting, updateSystemSetting } from "@/lib/actions/settings"

export default function NotificationsSettingsPage() {
    const [email, setEmail] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

    useEffect(() => {
        loadSettings()
    }, [])

    const loadSettings = async () => {
        try {
            const notificationEmail = await getSystemSetting('notification_email')
            if (notificationEmail) {
                setEmail(notificationEmail)
            }
        } catch (error) {
            console.error('Failed to load settings:', error)
            setMessage({ type: 'error', text: 'Nie udało się załadować ustawień' })
        } finally {
            setLoading(false)
        }
    }

    const handleSave = async () => {
        if (!email || !email.includes('@')) {
            setMessage({ type: 'error', text: 'Podaj poprawny adres email' })
            return
        }

        setSaving(true)
        setMessage(null)

        try {
            await updateSystemSetting('notification_email', email)
            setMessage({ type: 'success', text: 'Ustawienia zapisane pomyślnie' })
        } catch (error) {
            console.error('Failed to save settings:', error)
            setMessage({ type: 'error', text: 'Nie udało się zapisać ustawień' })
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-6 p-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Powiadomienia Email</h1>
                <p className="text-muted-foreground mt-2">
                    Skonfiguruj adres email, na który będą wysyłane powiadomienia o zgłoszeniach sprzętu i benefitów.
                </p>
            </div>

            <Card className="bg-white/5 border-white/10">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Mail className="w-5 h-5 text-primary" />
                        Adres Email dla Zgłoszeń
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="notification-email">Email Odbiorcy</Label>
                        <Input
                            id="notification-email"
                            type="email"
                            placeholder="biurko2015@gmail.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="bg-black/30 border-white/10"
                        />
                        <p className="text-xs text-muted-foreground">
                            Na ten adres będą wysyłane powiadomienia o nowych zgłoszeniach sprzętowych i deklaracjach benefitowych.
                        </p>
                    </div>

                    {message && (
                        <div className={`p-3 rounded-lg border ${message.type === 'success'
                                ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                : 'bg-red-500/10 border-red-500/30 text-red-400'
                            }`}>
                            {message.text}
                        </div>
                    )}

                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full sm:w-auto"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Zapisywanie...
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4 mr-2" />
                                Zapisz Ustawienia
                            </>
                        )}
                    </Button>

                    <div className="mt-6 p-4 rounded-lg bg-primary/5 border border-primary/10">
                        <p className="text-xs text-blue-300 font-medium mb-2">ℹ️ Informacja</p>
                        <p className="text-xs text-gray-400 leading-relaxed">
                            Powiadomienia email są wysyłane automatycznie po każdym nowym zgłoszeniu.
                            Upewnij się, że adres email jest poprawny i aktywny.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
