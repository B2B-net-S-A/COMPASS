'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, UserCheck, MailCheck, AlertTriangle } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { ForwardToggle } from '@/components/internal/ForwardToggle'
import { cancelMyLeaveRequest, type MyLeaveRow } from '@/lib/actions/internal-leave'

interface Props {
    requests: MyLeaveRow[]
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
    vacation: 'Urlop wypoczynkowy',
    sick_leave: 'L4',
    parental_leave: 'Opieka rodzicielska',
    unpaid_leave: 'Urlop bezpłatny',
    training: 'Szkolenie',
    on_demand: 'Urlop na żądanie',
    occasional: 'Urlop okolicznościowy',
    childcare: 'Opieka nad dzieckiem (art. 188)',
    care_leave: 'Urlop opiekuńczy',
    force_majeure: 'Siła wyższa',
    maternity: 'Urlop macierzyński',
    paternity: 'Urlop ojcowski',
    childrearing: 'Urlop wychowawczy',
    blood_donation: 'Krwiodawstwo',
    holiday_in_lieu: 'Odbiór dnia za święto',
    other: 'Inne',
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    pending: { label: 'Oczekuje', className: 'bg-warning/15 text-warning border-warning/30' },
    approved: { label: 'Zaakceptowany', className: 'bg-success/15 text-success border-success/30' },
    rejected: { label: 'Odrzucony', className: 'bg-destructive/15 text-destructive border-destructive/30' },
    cancelled: { label: 'Anulowany', className: 'bg-muted text-muted-foreground border-border' },
}

export function MyLeaveList({ requests }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [busyId, setBusyId] = useState<string | null>(null)
    const [confirm, ConfirmUI] = useConfirm()

    function fmt(d: string): string {
        return format(parseISO(d), 'd LLL yyyy', { locale: pl })
    }

    async function handleCancel(req: MyLeaveRow) {
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
                                        {/* Phase 30 — breakdown płatny/bezpłatny (vacation pool). */}
                                        {((req.paid_days ?? 0) > 0 || (req.unpaid_days ?? 0) > 0) && (
                                            <p className="text-xs mt-1 inline-flex items-center gap-2">
                                                {(req.paid_days ?? 0) > 0 && (
                                                    <span className="text-success">
                                                        {req.paid_days} dni płatnych <span className="text-muted-foreground">(z puli)</span>
                                                    </span>
                                                )}
                                                {(req.unpaid_days ?? 0) > 0 && (
                                                    <span className="text-muted-foreground">
                                                        {req.unpaid_days} dni bezpłatnych
                                                    </span>
                                                )}
                                            </p>
                                        )}
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
                                        {/* Phase 25d — substitute info */}
                                        {req.substitute_full_name && (
                                            <p className="text-xs mt-1 text-muted-foreground inline-flex items-center gap-1">
                                                <UserCheck className="h-3 w-3" />
                                                Zastępca:{' '}
                                                <span className="font-medium text-foreground">
                                                    {req.substitute_full_name}
                                                </span>
                                                {req.substitute_email && (
                                                    <span className="text-muted-foreground">
                                                        ({req.substitute_email})
                                                    </span>
                                                )}
                                            </p>
                                        )}
                                        {/* Phase 25d — Graph OOF status */}
                                        {req.status === 'approved' && (
                                            <p className="text-xs mt-1 inline-flex items-center gap-1">
                                                {req.graph_oof_set ? (
                                                    <>
                                                        <MailCheck className="h-3 w-3 text-success" />
                                                        <span className="text-success">
                                                            Out of Office ustawione w Outlook
                                                        </span>
                                                    </>
                                                ) : req.graph_sync_error ? (
                                                    <>
                                                        <AlertTriangle className="h-3 w-3 text-warning" />
                                                        <span className="text-warning">
                                                            Synchronizacja Outlook nie powiodła się — admin może ponowić
                                                        </span>
                                                    </>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        Out of Office: nie ustawione
                                                    </span>
                                                )}
                                            </p>
                                        )}
                                        {/* Phase 41c — stan przekierowania + własny wyłącznik.
                                            Wcześniej była tu sama informacja; skoro reguła Outlooka
                                            nie wygasa sama, a uzgodnienie potrafi nie przyjść,
                                            pracownik musi móc ją zdjąć bez proszenia kogokolwiek. */}
                                        {req.status !== 'cancelled' &&
                                            req.status !== 'rejected' &&
                                            req.substitute_id && (
                                                <ForwardToggle
                                                    leaveId={req.id}
                                                    enabled={Boolean(req.forward_mail_enabled)}
                                                    ruleActive={Boolean(req.outlook_forward_rule_id)}
                                                    substituteName={req.substitute_full_name ?? null}
                                                />
                                            )}
                                    </div>
                                    {(() => {
                                        // H2.3: cancel button
                                        // - pending: zawsze
                                        // - approved: tylko gdy start_date > today (future)
                                        const today = new Date().toISOString().slice(0, 10)
                                        const canCancel =
                                            req.status === 'pending' ||
                                            (req.status === 'approved' && req.start_date > today)
                                        if (!canCancel) return null
                                        return (
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
                                        )
                                    })()}
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
