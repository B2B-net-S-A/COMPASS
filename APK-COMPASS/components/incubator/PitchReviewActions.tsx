'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { changePitchStatus } from '@/lib/actions/incubator'
import type { PitchStatus } from '@/lib/types/incubator'
import { PITCH_STATUS_LABEL } from '@/lib/types/incubator'

interface PitchReviewActionsProps {
    pitchId: string
    currentStatus: PitchStatus
    initialNotes: string
}

const TARGET_STATUSES: PitchStatus[] = ['under_review', 'in_negotiation', 'accepted', 'rejected']

export function PitchReviewActions({ pitchId, currentStatus, initialNotes }: PitchReviewActionsProps) {
    const router = useRouter()
    const [notes, setNotes] = useState(initialNotes)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const handle = (newStatus: PitchStatus) => {
        setError(null)
        startTransition(async () => {
            const res = await changePitchStatus(pitchId, newStatus, notes)
            if (!res.success) { setError(res.error); return }
            router.refresh()
        })
    }

    return (
        <Card className="bg-white/5 border-white/10">
            <CardContent className="p-5 space-y-3">
                <h3 className="font-semibold">Akcje recenzenta</h3>

                {error && <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">{error}</div>}

                <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Notatka recenzenta</label>
                    <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={4}
                        placeholder="Komentarz widoczny dla submitera"
                        disabled={isPending}
                    />
                </div>

                <div className="flex flex-wrap gap-2">
                    {TARGET_STATUSES.filter((s) => s !== currentStatus).map((s) => (
                        <Button
                            key={s}
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() => handle(s)}
                        >
                            {isPending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                            → {PITCH_STATUS_LABEL[s]}
                        </Button>
                    ))}
                </div>
            </CardContent>
        </Card>
    )
}
