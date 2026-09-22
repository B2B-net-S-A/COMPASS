'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { approveCourse, rejectCourse, reviewLegacyCourse } from '@/lib/actions/courses-admin'

interface AdminReviewActionsProps {
    versionId: string
    submissionId?: string | null
    courseId: string
    title: string
    legacyReview?: boolean
    canReview?: boolean
}

export function AdminReviewActions({ courseId, versionId, submissionId, title, legacyReview = false, canReview = true }: AdminReviewActionsProps) {
    const router = useRouter()
    const [showReject, setShowReject] = useState(false)
    const [reason, setReason] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const [confirm, ConfirmUI] = useConfirm()

    const handleApprove = async () => {
        const ok = await confirm({
            description: `Zatwierdzić "${title}" do publikacji?`,
        })
        if (!ok) return
        setError(null)
        setSuccess(null)
        startTransition(async () => {
            const res = legacyReview ? await reviewLegacyCourse(courseId, versionId, true) : await approveCourse(courseId, versionId, submissionId)
            if (!res.success) {
                setError(res.error)
                return
            }
            setSuccess(
                res.data.firstPublishBonus
                    ? 'Zatwierdzone ✓ — autor otrzymał bonus +100 pkt za pierwszą publikację!'
                    : 'Zatwierdzone ✓',
            )
            setTimeout(() => router.push('/admin/learning'), 2000)
        })
    }

    const handleReject = () => {
        if (reason.trim().length < 5) {
            setError('Powód odrzucenia musi mieć co najmniej 5 znaków')
            return
        }
        setError(null)
        setSuccess(null)
        startTransition(async () => {
            const res = legacyReview ? await reviewLegacyCourse(courseId, versionId, false, reason.trim()) : await rejectCourse(courseId, reason.trim(), versionId, submissionId)
            if (!res.success) {
                setError(res.error)
                return
            }
            setSuccess(legacyReview ? 'Nowe zapisy pozostają wstrzymane. Zapisano powód decyzji.' : 'Wersja zwrócona do poprawy.')
            setTimeout(() => router.push('/admin/learning'), 1500)
        })
    }

    return (
        <Card className="bg-gradient-to-r from-burgundy/10 to-primary/10 border-primary/30">
            <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Decyzja moderatora</h3>
                </div>

                {!canReview && <p className="text-sm text-warning">Akceptację musi przeprowadzić administrator, który nie jest autorem ani współautorem tej wersji.</p>}
                {error && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                        {error}
                    </div>
                )}
                {success && (
                    <div className="p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-success flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> {success}
                    </div>
                )}

                {!showReject && (
                    <div className="flex gap-2">
                        <Button onClick={handleApprove} disabled={isPending || !canReview} className="gap-2 bg-success hover:bg-success/90">
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            {legacyReview ? 'Zatwierdź i otwórz zapisy' : 'Zatwierdź i opublikuj'}
                        </Button>
                        <Button onClick={() => setShowReject(true)} variant="outline" disabled={isPending || !canReview} className="gap-2">
                            <X className="w-4 h-4" /> Odrzuć
                        </Button>
                    </div>
                )}

                {showReject && (
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                                Powód odrzucenia (widoczny w panelu autora)
                            </label>
                            <Textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={3}
                                placeholder="np. Pytanie 3 jest niejednoznaczne — popraw treść i wyślij ponownie."
                                disabled={isPending || !canReview}
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={handleReject} disabled={isPending || !canReview || reason.trim().length < 5} variant="destructive" className="gap-2">
                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                Wyślij odrzucenie
                            </Button>
                            <Button onClick={() => setShowReject(false)} variant="outline" disabled={isPending || !canReview}>
                                Anuluj
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
            <ConfirmUI />
        </Card>
    )
}
