'use client'

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { createNotification } from "@/lib/actions/notifications"
import type { NotificationType, NotificationPriority } from "@/lib/types"
import { createClient } from "@/lib/supabase/client"
import { toast } from "sonner"
import { toastSuccess } from "@/lib/toast-success"
import { useState, useEffect } from "react"
import { Bell, CheckCircle2, AlertTriangle, Info } from "lucide-react"

export default function TestNotificationsPage() {
    const [userId, setUserId] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        const getUser = async () => {
            const supabase = createClient()
            const { data: { user } } = await supabase.auth.getUser()
            setUserId(user?.id || null)
        }
        getUser()
    }, [])

    const sendNotification = async (type: 'info' | 'success' | 'warning' | 'error') => {
        if (!userId) {
            toast.error("Brak zalogowanego użytkownika")
            return
        }

        setLoading(true)
        try {
            const params: {
                userId: string
                type: NotificationType
                titlePl: string
                titleEn: string
                bodyPl: string
                bodyEn: string
                priority: NotificationPriority
            } = {
                userId,
                type: 'system_announcement',
                titlePl: 'Testowe powiadomienie',
                titleEn: 'Test notification',
                bodyPl: 'To jest testowe powiadomienie z panelu administracyjnego.',
                bodyEn: 'This is a test notification from admin panel.',
                priority: 'normal'
            }

            switch (type) {
                case 'success':
                    params.type = 'payment_received'
                    params.titlePl = 'Otrzymano płatność'
                    params.bodyPl = 'Faktura VAT/2026/02/01 została opłacona.'
                    params.priority = 'high'
                    break
                case 'warning':
                    params.type = 'contract_ending'
                    params.titlePl = 'Kończący się kontrakt'
                    params.bodyPl = 'Twój kontrakt wygasa za 14 dni. Skontaktuj się z opiekunem.'
                    params.priority = 'urgent'
                    break
                case 'error':
                    params.type = 'health_score_low'
                    params.titlePl = 'Spadek Health Score'
                    params.bodyPl = 'Twój wskaźnik zdrowia projektu spadł poniżej 70%.'
                    params.priority = 'urgent'
                    break
            }

            const result = await createNotification(params)

            if (result.success) {
                toastSuccess("Powiadomienie wysłane!")
            } else {
                toast.error(`Błąd: ${result.error}`)
            }
        } catch (error) {
            toast.error("Wystąpił błąd podczas wysyłania")
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="container mx-auto py-10 max-w-2xl">
            <Card className="bg-zinc-950 border-white/10 text-white">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bell className="w-6 h-6 text-foreground" />
                        Test Systemu Powiadomień
                    </CardTitle>
                    <CardDescription>
                        Użyj poniższych przycisków, aby wygenerować powiadomienia różnego typu i sprawdzić działanie dzwoneczka.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Button
                            onClick={() => sendNotification('info')}
                            disabled={loading || !userId}
                            variant="outline"
                            className="h-24 flex flex-col gap-2 border-white/10 hover:bg-white/5"
                        >
                            <Info className="w-6 h-6 text-foreground" />
                            <span>Zwykłe info</span>
                        </Button>

                        <Button
                            onClick={() => sendNotification('success')}
                            disabled={loading || !userId}
                            variant="outline"
                            className="h-24 flex flex-col gap-2 border-white/10 hover:bg-white/5"
                        >
                            <CheckCircle2 className="w-6 h-6 text-green-400" />
                            <span>Sukces (Płatność)</span>
                        </Button>

                        <Button
                            onClick={() => sendNotification('warning')}
                            disabled={loading || !userId}
                            variant="outline"
                            className="h-24 flex flex-col gap-2 border-white/10 hover:bg-white/5"
                        >
                            <AlertTriangle className="w-6 h-6 text-orange-400" />
                            <span>Ostrzeżenie (Kontrakt)</span>
                        </Button>

                        <Button
                            onClick={() => sendNotification('error')}
                            disabled={loading || !userId}
                            variant="outline"
                            className="h-24 flex flex-col gap-2 border-white/10 hover:bg-white/5"
                        >
                            <AlertTriangle className="w-6 h-6 text-red-400" />
                            <span>Alarm (Health Score)</span>
                        </Button>
                    </div>

                    <div className="p-4 bg-white/5 rounded-lg text-sm text-muted-foreground mt-4">
                        <p><strong>Jak testować:</strong></p>
                        <ol className="list-decimal list-inside space-y-1 mt-2">
                            <li>Kliknij dowolny przycisk powyżej via ten panel.</li>
                            <li>Obserwuj ikonę dzwoneczka w prawym górnym rogu.</li>
                            <li>Powinna pojawić się czerwona kropka z licznikiem.</li>
                            <li>Kliknij w dzwoneczek, aby zobaczyć listę.</li>
                            <li>Kliknij w powiadomienie, aby oznaczyć jako przeczytane.</li>
                        </ol>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
