'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { cancelMyLeaveRequest, type LeaveRequestRow } from '@/lib/actions/internal-leave'

interface Props {
    requests: LeaveRequestRow[]
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
    vacation: 'Urlop wypoczynkowy',
    sick_leave: 'L4',
    parental_leave: 'Opieka rodzicielska',
    unpaid_leave: 'Urlop bezpłatny',
    training: 'Szkolenie',
    other: 'Inne',
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    pending: { label: 'Oczekuje', className: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
    approved: { label: 'Zaakceptowany', className: 'bg-green-500/15 text-green-300 border-green-500/30' },
    rejected: { label: 'Odrzucony', className: 'bg-red-500/15 text-red-300 border-red-500/30' },
    cancelled: { label: 'Anulowany', className: 'bg-gray-500/15 text-gray-300 border-gray-500/30' },
}

export function MyLeaveList({ requests }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [busyId, setBusyId] = useState<string | null>(null)
    const [confirm, ConfirmUI] = useConfirm()

    function fmt(d: string): string {
        return format(parseISO(d), 'd LLL yyyy', { locale: pl })
    }

    async function handleCancel(req: LeaveRequestRow) {
        const ok = await confirm({
            title: 'Anulować wniosek',
            description: `Anulować wniosek ${LEAVE_TYPE_LABEL[req.leave_type]} (${fmt(req.start_date)} – ${fmt(req.end_date)})?`,
            confirmLabel: 'Anuluj wniosek',
            variant: 'destructive',
        })
        if (!ok) return
        setBusyId(req.id)
        startTransition(async () => {
            try {
                await cancelMyLeaveRequest(req.id)
                toastSuccess('Wniosek anulowany')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            } finally {
                setBusyId(null)
            }
        })
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Moje wnioski w {new Date().getFullYear()}</CardTitle>
            </CardHeader>
            <CardContent>
                {requests.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                        Brak wniosków w tym roku.
                    </p>
                ) : (
                    <div className="divide-y divide-border/40">
                        {requests.map((req) => {
                            const status = STATUS_BADGE[req.status]
                            return (
                                <div key={req.id} className="py-3 flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge
                                                variant="outline"
                                                className={status?.className}
                                            >
                                                {status?.label ?? req.status}
                                            </Badge>
                                            <span className="text-sm font-medium">
                                                {LEAVE_TYPE_LABEL[req.leave_type] ?? req.leave_type}
                                            </span>
                                            {req.half_day && (
                                                <Badge variant="outline" className="text-[10px]">
                                                    {req.half_day === 'morning' ? '½ rano' : '½ popoł.'}
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            {fmt(req.start_date)} – {fmt(req.end_date)}
                                        </p>
                                        {req.note && (
                                            <p className="text-xs mt-1 italic text-muted-foreground line-clamp-2">
                                                „{req.note}"
                                            </p>
                                        )}
                                        {req.decision_note && (
                                            <p className="text-xs mt-1 text-muted-foreground">
                                                Komentarz admina: {req.decision_note}
                                            </p>
                                        )}
                                    </div>
                                    {req.status === 'pending' && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={pending && busyId === req.id}
                                            onClick={() => handleCancel(req)}
                                        >
                                            {busyId === req.id ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                'Anuluj'
                                            )}
                                        </Button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>
            <ConfirmUI />
        </Card>
    )
}
