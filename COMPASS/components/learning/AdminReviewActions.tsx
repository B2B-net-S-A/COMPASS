'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { approveCourse, rejectCourse } from '@/lib/actions/courses-admin'

interface AdminReviewActionsProps {
    courseId: string
    title: string
}

export function AdminReviewActions({ courseId, title }: AdminReviewActionsProps) {
    const router = useRouter()
    const [showReject, setShowReject] = useState(false)
    const [reason, setReason] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const handleApprove = () => {
        if (!window.confirm(`Zatwierdzić "${title}" do publikacji?`)) return
        setError(null)
        setSuccess(null)
        startTransition(async () => {
            const res = await approveCourse(courseId)
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
            const res = await rejectCourse(courseId, reason.trim())
            if (!res.success) {
                setError(res.error)
                return
            }
            setSuccess('Odrzucone ✓ — autor otrzymał notyfikację')
            setTimeout(() => router.push('/admin/learning'), 1500)
        })
    }

    return (
        <Card className="bg-gradient-to-r from-burgundy/10 to-primary/10 border-primary/30">
            <CardContent className="p-5 space-y-3">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold">Decyzja moderatora</h3>
                </div>

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
                        <Button onClick={handleApprove} disabled={isPending} className="gap-2 bg-success hover:bg-success/90">
                            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Zatwierdź i opublikuj
                        </Button>
                        <Button onClick={() => setShowReject(true)} variant="outline" disabled={isPending} className="gap-2">
                            <X className="w-4 h-4" /> Odrzuć
                        </Button>
                    </div>
                )}

                {showReject && (
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                                Powód odrzucenia (autor zobaczy to w notyfikacji)
                            </label>
                            <Textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                rows={3}
                                placeholder="np. Pytanie 3 jest niejednoznaczne — popraw treść i wyślij ponownie."
                                disabled={isPending}
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button onClick={handleReject} disabled={isPending || reason.trim().length < 5} variant="destructive" className="gap-2">
                                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                Wyślij odrzucenie
                            </Button>
                            <Button onClick={() => setShowReject(false)} variant="outline" disabled={isPending}>
                                Anuluj
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
