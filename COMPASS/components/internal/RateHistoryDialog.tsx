'use client'

// Phase 27c — Rate history timeline dialog.

import { useEffect, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { toast } from '@/lib/toast'
import { listUserRateHistory } from '@/lib/actions/internal-rates'
import type { UserRateWithUser } from '@/lib/types/rates'

interface Props {
    userId: string
    userName: string
    onOpenChange: (open: boolean) => void
}

export function RateHistoryDialog({ userId, userName, onOpenChange }: Props) {
    const [rates, setRates] = useState<UserRateWithUser[]>([])
    const [loading, setLoading] = useState<boolean>(true)

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        listUserRateHistory(userId)
            .then((data) => {
                if (!cancelled) setRates(data)
            })
            .catch((err) => {
                if (!cancelled) toast.error(err instanceof Error ? err.message : 'Błąd historii')
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [userId])

    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Historia stawek</DialogTitle>
                    <DialogDescription className="text-xs">{userName}</DialogDescription>
                </DialogHeader>
                {loading ? (
                    <div className="py-8 flex items-center justify-center">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                ) : rates.length === 0 ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                        Brak historii stawek.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {rates.map((r) => {
                            const isActive = r.effective_to == null
                            return (
                                <div
                                    key={r.id}
                                    className={`rounded-lg border p-3 ${
                                        isActive
                                            ? 'border-green-500/30 bg-green-500/5'
                                            : 'border-white/10 bg-white/5'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <span className="font-mono font-semibold">
                                            {Number(r.hourly_rate).toFixed(2)} {r.currency}/h
                                        </span>
                                        {isActive && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded border border-green-500/30 bg-green-500/10 text-green-300">
                                                Aktywna
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        {r.effective_from} →{' '}
                                        {r.effective_to ?? 'do odwołania'}
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                        Ustawił: {r.set_by_full_name ?? r.set_by_email ?? '—'}
                                    </div>
                                    {r.reason && (
                                        <div className="mt-1 text-xs italic text-muted-foreground">
                                            {r.reason}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
