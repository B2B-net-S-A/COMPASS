'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Check, X, FileDown, Loader2, Unlock } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    approveTimesheet,
    rejectTimesheet,
    unlockTimesheet,
    type TimesheetWithEntriesAndUser,
} from '@/lib/actions/internal-timesheet'

interface Props {
    year: number
    month: number
    timesheets: TimesheetWithEntriesAndUser[]
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    draft: { label: 'Szkic', className: 'bg-gray-500/15 text-gray-300 border-gray-500/30' },
    submitted: { label: 'Oczekuje', className: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
    approved: { label: 'Zaakceptowany', className: 'bg-green-500/15 text-green-300 border-green-500/30' },
    rejected: { label: 'Odrzucony', className: 'bg-red-500/15 text-red-300 border-red-500/30' },
}

export function TimesheetAdminList({ year, month, timesheets }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [busyId, setBusyId] = useState<string | null>(null)
    const [rejectTarget, setRejectTarget] = useState<TimesheetWithEntriesAndUser | null>(null)
    const [rejectReason, setRejectReason] = useState('')

    function getInitials(name: string | null, email: string) {
        if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
        return email.slice(0, 2).toUpperCase()
    }

    function totalHours(t: TimesheetWithEntriesAndUser): number {
        return t.entries.reduce((sum, e) => sum + Number(e.hours), 0)
    }

    function handleApprove(t: TimesheetWithEntriesAndUser) {
        setBusyId(t.id)
        startTransition(async () => {
            try {
                await approveTimesheet(t.id)
                toastSuccess(`Zaakceptowano ${t.user_email}`)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            } finally {
                setBusyId(null)
            }
        })
    }

    function handleRejectSubmit() {
        if (!rejectTarget || !rejectReason.trim()) return
        const target = rejectTarget
        const reason = rejectReason.trim()
        setRejectTarget(null)
        setRejectReason('')
        setBusyId(target.id)
        startTransition(async () => {
            try {
                await rejectTimesheet(target.id, reason)
                toastSuccess(`Odrzucono ${target.user_email}`)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            } finally {
                setBusyId(null)
            }
        })
    }

    function handleUnlock(t: TimesheetWithEntriesAndUser) {
        setBusyId(t.id)
        startTransition(async () => {
            try {
                await unlockTimesheet(t.id)
                toastSuccess('Odblokowano — pracownik może edytować')
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            } finally {
                setBusyId(null)
            }
        })
    }

    function navigateMonth(delta: number) {
        let newY = year
        let newM = month + delta
        if (newM < 1) {
            newM = 12
            newY -= 1
        }
        if (newM > 12) {
            newM = 1
            newY += 1
        }
        router.push(`/internal/admin/timesheets?year=${newY}&month=${newM}`)
    }

    return (
        <>
            <Card>
                <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <CardTitle className="text-base">
                        Timesheety za {year}-{String(month).padStart(2, '0')}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => navigateMonth(-1)} disabled={pending}>
                            ← Poprzedni
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => navigateMonth(1)} disabled={pending}>
                            Następny →
                        </Button>
                        <a
                            href={`/internal/admin/timesheets/${year}/${month}/export`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Button variant="outline" size="sm">
                                <FileDown className="h-4 w-4 mr-2" />
                                Pobierz ZIP
                            </Button>
                        </a>
                    </div>
                </CardHeader>
                <CardContent>
                    {timesheets.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            Brak timesheetów dla tego miesiąca.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {timesheets.map((t) => {
                                const status = STATUS_BADGE[t.status]
                                const busy = busyId === t.id
                                return (
                                    <div key={t.id} className="border rounded-lg p-4 flex flex-wrap items-start gap-3 justify-between">
                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                            <Avatar className="h-9 w-9">
                                                <AvatarFallback className="text-xs">
                                                    {getInitials(t.user_full_name, t.user_email)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-medium text-sm">
                                                        {t.user_full_name ?? t.user_email}
                                                    </span>
                                                    <Badge variant="outline" className={status?.className}>
                                                        {status?.label ?? t.status}
                                                    </Badge>
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {t.entries.length} wpisów, suma:{' '}
                                                    <strong>{totalHours(t).toFixed(2)} h</strong>
                                                </p>
                                                {t.rejection_note && (
                                                    <p className="text-xs italic mt-1 text-muted-foreground">
                                                        Powód odrzucenia: {t.rejection_note}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {t.status === 'submitted' && (
                                                <>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleApprove(t)}
                                                        disabled={pending}
                                                    >
                                                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                                                        Akceptuj
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => {
                                                            setRejectTarget(t)
                                                            setRejectReason('')
                                                        }}
                                                        disabled={pending}
                                                        className="text-destructive hover:text-destructive"
                                                    >
                                                        <X className="h-3.5 w-3.5 mr-1" />
                                                        Odrzuć
                                                    </Button>
                                                </>
                                            )}
                                            {t.status === 'approved' && (
                                                <>
                                                    <a
                                                        href={`/internal/timesheet/${t.year}/${t.month}/pdf?user=${t.user_id}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                    >
                                                        <Button size="sm" variant="outline">
                                                            <FileDown className="h-3.5 w-3.5 mr-1" />
                                                            PDF
                                                        </Button>
                                                    </a>
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => handleUnlock(t)}
                                                        disabled={pending}
                                                        title="Cofnij do szkicu — pracownik będzie mógł edytować"
                                                    >
                                                        <Unlock className="h-3.5 w-3.5 mr-1" />
                                                        Odblokuj
                                                    </Button>
                                                </>
                                            )}
                                            {t.status === 'rejected' && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleUnlock(t)}
                                                    disabled={pending}
                                                >
                                                    <Unlock className="h-3.5 w-3.5 mr-1" />
                                                    Odblokuj do edycji
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog
                open={!!rejectTarget}
                onOpenChange={(o) => {
                    if (!o) {
                        setRejectTarget(null)
                        setRejectReason('')
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Odrzucenie timesheetu</DialogTitle>
                        <DialogDescription>
                            {rejectTarget?.user_email} — {year}-{String(month).padStart(2, '0')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="ts_reject_reason">Powód (wymagany)</Label>
                        <Textarea
                            id="ts_reject_reason"
                            rows={3}
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="np. brakujące godziny, niezgodności z attendance"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectTarget(null)}>
                            Anuluj
                        </Button>
                        <Button onClick={handleRejectSubmit} disabled={!rejectReason.trim()}>
                            Odrzuć timesheet
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
