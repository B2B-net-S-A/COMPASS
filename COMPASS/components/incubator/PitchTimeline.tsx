'use client'

import { Check, Clock, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PitchStatus } from '@/lib/types/incubator'

const STAGES: PitchStatus[] = ['submitted', 'under_review', 'in_negotiation', 'accepted']
const STAGE_LABEL: Record<PitchStatus, string> = {
    draft: 'Wersja robocza',
    submitted: 'Złożone',
    under_review: 'Analiza',
    in_negotiation: 'Negocjacje',
    accepted: 'Zaakceptowane',
    rejected: 'Odrzucone',
}

export function PitchTimeline({ status }: { status: PitchStatus }) {
    if (status === 'rejected') {
        return (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                <X className="w-4 h-4" /> Odrzucone
            </div>
        )
    }

    const currentIdx = STAGES.indexOf(status)

    return (
        <div className="flex items-center gap-1 flex-wrap">
            {STAGES.map((stage, idx) => {
                const completed = idx < currentIdx
                const current = idx === currentIdx
                return (
                    <div key={stage} className="flex items-center gap-1">
                        <div
                            className={cn(
                                'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs border',
                                completed && 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                                current && 'bg-primary/15 border-primary text-primary font-semibold',
                                !completed && !current && 'bg-white/5 border-white/10 text-muted-foreground',
                            )}
                        >
                            {completed ? <Check className="w-3 h-3" /> : current ? <Clock className="w-3 h-3" /> : null}
                            <span>{STAGE_LABEL[stage]}</span>
                        </div>
                        {idx < STAGES.length - 1 && <div className="w-3 h-px bg-white/10" />}
                    </div>
                )
            })}
        </div>
    )
}
