'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { applyToProject } from '@/lib/actions/incubator'

interface ApplyFormProps {
    projectId: string
    projectSlug: string
}

export function ApplyForm({ projectId, projectSlug }: ApplyFormProps) {
    const router = useRouter()
    const [motivation, setMotivation] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const canSubmit = motivation.trim().length >= 30 && !isPending

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)
        startTransition(async () => {
            const res = await applyToProject(projectId, motivation)
            if (!res.success) { setError(res.error); return }
            router.push(`/incubator/projects/${projectSlug}`)
        })
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">{error}</div>}

            <Card className="bg-white/5 border-white/10">
                <CardContent className="p-5 space-y-4">
                    <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Motywacja *</label>
                        <Textarea
                            value={motivation}
                            onChange={(e) => setMotivation(e.target.value)}
                            rows={10}
                            placeholder="Czemu właśnie Ty? Twoje doświadczenie, motywacja, dostępność, wynagrodzenie/equity preferencje..."
                            disabled={isPending}
                            required minLength={30}
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">Min 30 znaków. Markdown obsługiwany.</p>
                    </div>
                </CardContent>
            </Card>

            <div className="flex justify-end">
                <Button type="submit" disabled={!canSubmit} className="gap-2">
                    {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Wyślij aplikację
                </Button>
            </div>
        </form>
    )
}
