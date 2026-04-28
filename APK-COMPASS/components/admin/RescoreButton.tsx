'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { triggerAIScoringForCandidate } from '@/lib/actions/candidates'

interface RescoreButtonProps {
    candidateId: string
    candidateName: string
}

/**
 * Admin button — re-runs AI scoring (Stage 2) for a candidate.
 * Calls existing server action triggerAIScoringForCandidate which:
 *   - Fetches embedding from candidates table
 *   - Queries match_projects RPC for top 50 candidates
 *   - For each project NOT yet in match_results, calls Claude batchScore
 *   - Upserts new scores to match_results table
 *
 * Visible only on the admin candidate detail page.
 */
export function RescoreButton({ candidateId, candidateName }: RescoreButtonProps) {
    const [isPending, startTransition] = useTransition()
    const [lastScored, setLastScored] = useState<number | null>(null)
    const router = useRouter()

    const handleClick = () => {
        startTransition(async () => {
            const toastId = toast.loading(`Przeliczam dopasowania dla ${candidateName}...`)
            try {
                const result = await triggerAIScoringForCandidate(candidateId)
                setLastScored(result.scored)
                if (result.scored === 0) {
                    toast.info('Wszystkie projekty są już ocenione (brak nowych do przeliczenia).', { id: toastId })
                } else {
                    toast.success(`Przeliczono dopasowania dla ${result.scored} ${result.scored === 1 ? 'projektu' : 'projektów'}.`, { id: toastId })
                    router.refresh()
                }
            } catch (e: unknown) {
                const msg = e instanceof Error ? e.message : 'Nieznany błąd'
                toast.error(`Błąd przeliczania: ${msg}`, { id: toastId })
            }
        })
    }

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleClick}
            disabled={isPending}
            className="bg-background/50 backdrop-blur-sm border-white/10 text-white hover:border-foreground/40"
            data-testid="rescore-button"
        >
            {isPending ? (
                <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Przeliczam...
                </>
            ) : (
                <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Przelicz dopasowania
                </>
            )}
            {lastScored !== null && !isPending && (
                <span className="ml-2 text-xs text-muted-foreground">({lastScored})</span>
            )}
        </Button>
    )
}
