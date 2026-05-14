'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { toggleReaction } from '@/lib/actions/news'
import type { ReactionKind } from '@/lib/types/news'
import { REACTION_LABEL } from '@/lib/types/news'

interface ReactionBarProps {
    postId: string
    counts: Record<ReactionKind, number>
    userReaction: ReactionKind | null
}

const KINDS: ReactionKind[] = ['like', 'heart', 'celebrate']

export function ReactionBar({ postId, counts, userReaction }: ReactionBarProps) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    const handleClick = (kind: ReactionKind) => {
        startTransition(async () => {
            await toggleReaction(postId, kind)
            router.refresh()
        })
    }

    return (
        <div className="flex items-center gap-2">
            {KINDS.map((kind) => {
                const count = counts[kind]
                const active = userReaction === kind
                return (
                    <button
                        key={kind}
                        type="button"
                        onClick={() => handleClick(kind)}
                        disabled={isPending}
                        aria-label={`Reakcja ${kind}${active ? ' (aktywna)' : ''}`}
                        aria-pressed={active}
                        className={cn(
                            'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                            active
                                ? 'bg-primary/15 border-primary/40 text-primary'
                                : 'bg-white/5 border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground',
                        )}
                    >
                        <span>{REACTION_LABEL[kind]}</span>
                        {count > 0 && <span className="font-mono tabular-nums">{count}</span>}
                    </button>
                )
            })}
        </div>
    )
}
