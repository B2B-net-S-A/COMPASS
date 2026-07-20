'use client'

// Phase 25d — admin widzi approved urlopy z graph_sync_error + button "Ponów synchronizację".

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { AlertTriangle, RefreshCcw, Loader2, UserCheck } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    retryLeaveGraphSync,
    type PendingLeaveRow,
} from '@/lib/actions/internal-leave'

interface Props {
    requests: PendingLeaveRow[]
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

export function AdminLeaveSyncIssues({ requests }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [busyId, setBusyId] = useState<string | null>(null)

    if (requests.length === 0) return null

    function getInitials(name: string | null, email: string) {
        if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
        return email.slice(0, 2).toUpperCase()
    }

    function fmt(d: string): string {
        return format(parseISO(d), 'd LLL yyyy', { locale: pl })
    }

    function handleRetry(req: PendingLeaveRow) {
        setBusyId(req.id)
        startTransition(async () => {
            try {
                const res = await retryLeaveGraphSync(req.id)
                if (res.oof && res.calendar && res.forward) {
                    toastSuccess(
                        'Synchronizacja Graph powiodła się (OOF + Calendar + przekierowanie).',
                    )
                } else if (res.oof || res.calendar || res.forward) {
                    toast.warning(
                        `Częściowa synchronizacja: OOF ${res.oof ? '✓' : '✗'}, Calendar ${res.calendar ? '✓' : '✗'}, Przekierowanie ${res.forward ? '✓' : '✗'}. ${res.error ?? ''}`,
                    )
                } else {
                    toast.error(`Synchronizacja nie powiodła się: ${res.error ?? 'nieznany błąd'}`)
                }
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            } finally {
                setBusyId(null)
            }
        })
    }

    return (
        <Card className="border-warning/30 bg-warning/5">
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-warning">
                    <AlertTriangle className="h-4 w-4" />
                    Synchronizacja Outlook nie powiodła się ({requests.length})
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                    Zaakceptowane urlopy, dla których Graph API zwrócił błąd przy ustawianiu Out of
                    Office lub tworzeniu eventu w kalendarzu. Kliknij „Ponów”, aby spróbować ponownie.
                </p>
            </CardHeader>
            <CardContent>
                <div className="space-y-3">
                    {requests.map((req) => {
                        const busy = busyId === req.id
                        return (
                            <div
                                key={req.id}
                                className="border rounded-lg p-3 flex flex-wrap items-start justify-between gap-3"
                            >
                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={req.user_avatar_url || undefined} />
                                        <AvatarFallback className="text-[10px]">
                                            {getInitials(req.user_full_name, req.user_email)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-medium text-sm">
                                                {req.user_full_name ?? req.user_email}
                                            </span>
                                            <Badge variant="outline" className="text-[10px]">
                                                {LEAVE_TYPE_LABEL[req.leave_type]}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {fmt(req.start_date)} – {fmt(req.end_date)}
                                        </p>
                                        {req.substitute_full_name && (
                                            <p className="text-xs mt-1 inline-flex items-center gap-1 text-muted-foreground">
                                                <UserCheck className="h-3 w-3" />
                                                Zastępca: {req.substitute_full_name}
                                            </p>
                                        )}
                                        {req.graph_sync_error && (
                                            <p className="text-[11px] mt-1 text-destructive font-mono break-words">
                                                {req.graph_sync_error.slice(0, 200)}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => handleRetry(req)}
                                    disabled={pending}
                                >
                                    {busy ? (
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                        <RefreshCcw className="h-3 w-3 mr-1" />
                                    )}
                                    Ponów
                                </Button>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}
