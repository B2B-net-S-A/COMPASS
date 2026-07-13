'use client'

import { useState, useTransition } from 'react'
import { CalendarDays, Copy, Link2Off, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import {
    createOrRotateCalendarFeedToken,
    revokeCalendarFeedToken,
} from '@/lib/actions/calendar-feed'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export function CalendarFeedSettings({ initialActive }: { initialActive: boolean }) {
    const [active, setActive] = useState(initialActive)
    const [newUrl, setNewUrl] = useState<string | null>(null)
    const [pending, startTransition] = useTransition()

    const rotate = () => startTransition(async () => {
        try {
            const result = await createOrRotateCalendarFeedToken()
            setNewUrl(result.url)
            setActive(true)
            toast.success('Utworzono nowy link. Poprzedni link już nie działa.')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Nie udało się utworzyć linku.')
        }
    })

    const revoke = () => startTransition(async () => {
        try {
            await revokeCalendarFeedToken()
            setNewUrl(null)
            setActive(false)
            toast.success('Link kalendarza został unieważniony.')
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Nie udało się unieważnić linku.')
        }
    })

    const copy = async () => {
        if (!newUrl) return
        await navigator.clipboard.writeText(newUrl)
        toast.success('Link skopiowany.')
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    Prywatny kalendarz ICS
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                    Link daje dostęp do Twoich wpisów kalendarza. Jest pokazany tylko raz.
                    Rotacja natychmiast wyłącza poprzedni link.
                </p>
                {newUrl && (
                    <div className="flex gap-2">
                        <Input value={newUrl} readOnly aria-label="Nowy link kalendarza ICS" />
                        <Button type="button" variant="outline" size="icon" onClick={copy}>
                            <Copy className="h-4 w-4" />
                            <span className="sr-only">Kopiuj link</span>
                        </Button>
                    </div>
                )}
                <div className="flex flex-wrap gap-2">
                    <Button type="button" onClick={rotate} disabled={pending}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {active ? 'Wygeneruj nowy link' : 'Utwórz link'}
                    </Button>
                    {active && (
                        <Button type="button" variant="destructive" onClick={revoke} disabled={pending}>
                            <Link2Off className="mr-2 h-4 w-4" />
                            Unieważnij link
                        </Button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
