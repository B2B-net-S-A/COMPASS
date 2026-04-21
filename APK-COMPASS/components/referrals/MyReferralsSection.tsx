'use client'

import { useEffect, useState, useTransition } from 'react'
import { getMyReferrals, withdrawReferral } from '@/lib/actions/referrals'
import { ProjectReferral } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
    Clock,
    ExternalLink,
    User,
    AlertCircle,
    RotateCcw,
    Loader2
} from 'lucide-react'
import { toast } from 'sonner'
import { toastSuccess } from '@/lib/toast-success'
import { useConfirm } from '@/components/shared/ConfirmDialog'

export function MyReferralsSection() {
    const [referrals, setReferrals] = useState<ProjectReferral[]>([])
    const [loading, setLoading] = useState(true)
    const [isPending, startTransition] = useTransition()
    const [confirm, ConfirmUI] = useConfirm()

    const fetchReferrals = async () => {
        try {
            const data = await getMyReferrals()
            setReferrals(data)
        } catch (err) {
            console.error('Failed to load referrals:', err)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchReferrals()
    }, [])

    const handleWithdraw = async (id: string) => {
        const ok = await confirm({
            title: 'Wycofaj rekomendację',
            description: 'Czy na pewno chcesz wycofać tę rekomendację?',
            confirmLabel: 'Wycofaj',
            variant: 'destructive',
        })
        if (!ok) return

        startTransition(async () => {
            try {
                await withdrawReferral(id)
                toastSuccess('Rekomendacja została wycofana.')
                fetchReferrals()
            } catch (err: any) {
                toast.error(err.message || 'Błąd podczas wycofywania.')
            }
        })
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'new': return <Badge variant="secondary" className="bg-primary/10 text-slate-200 border-primary/20">Nowy</Badge>
            case 'in_review': return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-400 border-yellow-500/20">W weryfikacji</Badge>
            case 'accepted': return <Badge variant="secondary" className="bg-green-500/10 text-green-400 border-green-500/20">Zaakceptowany</Badge>
            case 'rejected': return <Badge variant="secondary" className="bg-red-500/10 text-red-400 border-red-500/20">Odrzucony</Badge>
            case 'hired': return <Badge variant="secondary" className="bg-primary text-white">Zatrudniony!</Badge>
            case 'withdrawn': return <Badge variant="outline" className="text-slate-600 border-slate-700">Wycofany</Badge>
            default: return <Badge variant="outline">{status}</Badge>
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 text-slate-200 animate-spin" />
            </div>
        )
    }

    return (
        <Card className="bg-slate-900 border-white/10 overflow-hidden">
            <CardHeader className="border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <User className="w-5 h-5 text-slate-200" /> Moje rekomendacje
                    </CardTitle>
                    <Badge variant="outline" className="border-white/10 text-slate-600">
                        {referrals.length} zgłoszeń
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                {referrals.length === 0 ? (
                    <div className="p-12 text-center">
                        <AlertCircle className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                        <p className="text-slate-600">Nie wysłałeś jeszcze żadnych rekomendacji.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-white/5">
                        {referrals.map((ref) => (
                            <div key={ref.id} className="p-4 hover:bg-white/[0.02] transition-colors group">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-semibold text-white">
                                                {ref.referral_type === 'self_referral' ? 'Zgłoszenie własne' : ref.candidate_name}
                                            </span>
                                            {getStatusBadge(ref.status)}
                                        </div>
                                        <div className="text-xs text-slate-600 flex items-center gap-2">
                                            <ExternalLink className="w-3 h-3" />
                                            {ref.project?.title || 'Projekt usunięty'}
                                        </div>
                                        <div className="text-[10px] text-slate-600 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(ref.created_at).toLocaleDateString()}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {(ref.status === 'new' || ref.status === 'in_review') && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                disabled={isPending}
                                                onClick={() => handleWithdraw(ref.id)}
                                                className="h-8 text-[10px] text-red-500 hover:text-red-400 hover:bg-red-500/10"
                                            >
                                                {isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RotateCcw className="w-3 h-3 mr-1" />}
                                                Wycofaj
                                            </Button>
                                        )}
                                        {ref.status === 'rejected' && ref.rejection_reason && (
                                            <div className="text-[10px] text-red-400 italic max-w-[200px] text-right">
                                                Powód: {ref.rejection_reason}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>

            <ConfirmUI />
        </Card>
    )
}
