'use client'

import { useState, useTransition } from 'react'
import { Trophy, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { setLeaderboardOptOut } from '@/lib/actions/loyalty'
import { toast } from 'sonner'

interface LeaderboardOptOutProps {
    initialOptOut: boolean
}

export function LeaderboardOptOut({ initialOptOut }: LeaderboardOptOutProps) {
    const [optOut, setOptOut] = useState(initialOptOut)
    const [isPending, startTransition] = useTransition()

    const handleToggle = () => {
        const next = !optOut
        startTransition(async () => {
            const result = await setLeaderboardOptOut(next)
            if (result.success) {
                setOptOut(next)
                toast.success(next ? 'Ukryto Cię w rankingu' : 'Pokazujemy Cię w rankingu')
            } else {
                toast.error(result.error ?? 'Nie udało się zaktualizować ustawienia')
            }
        })
    }

    return (
        <Card className="bg-white/5 border-white/10">
            <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <Trophy className="w-4 h-4 text-amber-400" />
                            <h3 className="font-semibold">Dynaminds League — widoczność w rankingu</h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Domyślnie Twoje imię i punkty są widoczne w globalnym rankingu na <code>/league/leaderboard</code>.
                            Możesz ukryć tożsamość — pozycja zostanie zachowana, ale wyświetlimy "Anonim".
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleToggle}
                        disabled={isPending}
                        role="switch"
                        aria-checked={!optOut}
                        aria-label={`Widoczność w rankingu Dynaminds League: ${optOut ? 'ukryta' : 'widoczna'}`}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 ${
                            !optOut ? 'bg-primary' : 'bg-white/20'
                        }`}
                    >
                        <span
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                                !optOut ? 'translate-x-5' : 'translate-x-0'
                            }`}
                        />
                        {isPending && (
                            <Loader2 className="absolute inset-0 m-auto w-3 h-3 animate-spin text-foreground" />
                        )}
                    </button>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                    Status: <strong>{optOut ? 'Ukryty (Anonim)' : 'Widoczny'}</strong>
                </p>
            </CardContent>
        </Card>
    )
}
