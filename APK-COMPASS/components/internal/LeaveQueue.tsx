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
import { Checkbox } from '@/components/ui/checkbox'
import { Check, X, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { approveLeaveRequest, rejectLeaveRequest, type PendingLeaveRow } from '@/lib/actions/internal-leave'

interface Props {
    requests: PendingLeaveRow[]
}

const LEAVE_TYPE_LABEL: Record<string, string> = {
    vacation: 'Urlop wypoczynkowy',
    sick_leave: 'L4',
    parental_leave: 'Opieka rodzicielska',
    unpaid_leave: 'Urlop bezpłatny',
    training: 'Szkolenie',
    other: 'Inne',
}

export function LeaveQueue({ requests }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [busyId, setBusyId] = useState<string | null>(null)
    const [rejectTarget, setRejectTarget] = useState<PendingLeaveRow | null>(null)
    const [rejectReason, setRejectReason] = useState('')
    // H2.2: bulk selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [bulkRejectOpen, setBulkRejectOpen] = useState(false)
    const [bulkRejectReason, setBulkRejectReason] = useState('')

    const allSelected = requests.length > 0 && selectedIds.size === requests.length
    const someSelected = selectedIds.size > 0

    const toggleAll = () => {
        if (allSelected) setSelectedIds(new Set())
        else setSelectedIds(new Set(requests.map((r) => r.id)))
    }

    const toggleOne = (id: string) => {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        setSelectedIds(next)
    }

    function handleBulkApprove() {
        if (selectedIds.size === 0) return
        if (!window.confirm(`Zaakceptować ${selectedIds.size} wnioski/-ów?`)) return
        const ids = Array.from(selectedIds)
        startTransition(async () => {
            let ok = 0
            let fail = 0
            for (const id of ids) {
                try {
                    await approveLeaveRequest(id)
                    ok += 1
                } catch (e: unknown) {
                    fail += 1
                    console.error('[bulkApprove] failed for', id, e)
                }
            }
            if (fail === 0) {
                toastSuccess(`Zaakceptowano ${ok} wnioski/-ów`)
            } else {
                toast.error(`Zaakceptowano ${ok}, niepowodzeń: ${fail}`)
            }
            setSelectedIds(new Set())
            router.refresh()
        })
    }

    function handleBulkRejectSubmit() {
        if (selectedIds.size === 0) return
        const reason = bulkRejectReason.trim()
        if (!reason) {
            toast.error('Powód odrzucenia jest wymagany.')
            return
        }
        const ids = Array.from(selectedIds)
        setBulkRejectOpen(false)
        setBulkRejectReason('')
        startTransition(async () => {
            let ok = 0
            let fail = 0
            for (const id of ids) {
                try {
                    await rejectLeaveRequest(id, reason)
                    ok += 1
                } catch (e: unknown) {
                    fail += 1
                    console.error('[bulkReject] failed for', id, e)
                }
            }
            if (fail === 0) {
                toastSuccess(`Odrzucono ${ok} wnioski/-ów`)
            } else {
                toast.error(`Odrzucono ${ok}, niepowodzeń: ${fail}`)
            }
            setSelectedIds(new Set())
            router.refresh()
        })
    }

    function fmt(d: string): string {
        return format(parseISO(d), 'd LLL yyyy', { locale: pl })
    }

    function getInitials(name: string | null, email: string) {
        if (name) return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
        return email.slice(0, 2).toUpperCase()
    }

    function handleApprove(req: PendingLeaveRow) {
        setBusyId(req.id)
        startTransition(async () => {
            try {
                await approveLeaveRequest(req.id)
                toastSuccess(`Zaakceptowano wniosek ${req.user_email}`)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            } finally {
                setBusyId(null)
            }
        })
    }

    function handleRejectSubmit() {
        if (!rejectTarget) return
        if (!rejectReason.trim()) {
            toast.error('Powód odrzucenia jest wymagany.')
            return
        }
        const target = rejectTarget
        const reason = rejectReason.trim()
        setRejectTarget(null)
        setRejectReason('')
        setBusyId(target.id)
        startTransition(async () => {
            try {
                await rejectLeaveRequest(target.id, reason)
                toastSuccess(`Odrzucono wniosek ${target.user_email}`)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            } finally {
                setBusyId(null)
            }
        })
    }

    return (
        <>
            <Card>
                <CardHeader className="flex-row items-center justify-between">
                    <CardTitle className="text-base">
                        Wnioski oczekujące ({requests.length})
                    </CardTitle>
                    {/* H2.2: bulk action toolbar */}
                    {requests.length > 0 && (
                        <div className="flex items-center gap-2">
                            <Checkbox
                                checked={allSelected}
                                onCheckedChange={toggleAll}
                                aria-label="Zaznacz wszystkie"
                            />
                            <span className="text-xs text-muted-foreground">
                                {someSelected ? `${selectedIds.size} zaznaczone` : 'Zaznacz wszystkie'}
                            </span>
                        </div>
                    )}
                </CardHeader>
                {someSelected && (
                    <div className="px-6 pb-3 flex flex-wrap gap-2 items-center bg-amber-500/5 border-y border-amber-500/20">
                        <span className="text-xs font-medium text-amber-300">
                            Akcje masowe ({selectedIds.size}):
                        </span>
                        <Button size="sm" onClick={handleBulkApprove} disabled={pending} className="gap-1">
                            <Check className="h-3.5 w-3.5" />
                            Zatwierdź wszystkie
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setBulkRejectOpen(true)}
                            disabled={pending}
                            className="gap-1 text-destructive hover:text-destructive"
                        >
                            <X className="h-3.5 w-3.5" />
                            Odrzuć z tym samym powodem
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={pending}>
                            Anuluj
                        </Button>
                    </div>
                )}
                <CardContent>
                    {requests.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-8 text-center">
                            Brak wniosków oczekujących.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {requests.map((req) => {
                                const busy = busyId === req.id
                                const checked = selectedIds.has(req.id)
                                return (
                                    <div
                                        key={req.id}
                                        className={`border rounded-lg p-4 flex flex-wrap items-start justify-between gap-3 ${
                                            checked ? 'border-amber-500/40 bg-amber-500/5' : ''
                                        }`}
                                    >
                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                            <Checkbox
                                                checked={checked}
                                                onCheckedChange={() => toggleOne(req.id)}
                                                disabled={pending}
                                                className="mt-1"
                                                aria-label={`Zaznacz wniosek ${req.user_email}`}
                                            />
                                            <Avatar className="h-9 w-9">
                                                <AvatarImage src={req.user_avatar_url || undefined} />
                                                <AvatarFallback className="text-xs">
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
                                                    {req.half_day && (
                                                        <Badge variant="outline" className="text-[10px]">
                                                            {req.half_day === 'morning' ? '½ rano' : '½ popoł.'}
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {fmt(req.start_date)} – {fmt(req.end_date)}
                                                </p>
                                                {req.note && (
                                                    <p className="text-xs italic mt-1 text-muted-foreground">
                                                        „{req.note}"
                                                    </p>
                                                )}
                                                {req.documentation_url && (
                                                    <a
                                                        href={req.documentation_url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-primary underline mt-1 inline-block"
                                                    >
                                                        Załącznik
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                onClick={() => handleApprove(req)}
                                                disabled={pending}
                                            >
                                                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                                                Akceptuj
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setRejectTarget(req)
                                                    setRejectReason('')
                                                }}
                                                disabled={pending}
                                                className="text-destructive hover:text-destructive"
                                            >
                                                <X className="h-3.5 w-3.5 mr-1" />
                                                Odrzuć
                                            </Button>
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
                        <DialogTitle>Odrzucenie wniosku</DialogTitle>
                        <DialogDescription>
                            {rejectTarget?.user_email}
                            {rejectTarget && ` — ${LEAVE_TYPE_LABEL[rejectTarget.leave_type]}`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="reject_reason">Powód (wymagany)</Label>
                        <Textarea
                            id="reject_reason"
                            rows={3}
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="np. konflikt z urlopami zespołu w tym tygodniu"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectTarget(null)}>
                            Anuluj
                        </Button>
                        <Button onClick={handleRejectSubmit} disabled={!rejectReason.trim()}>
                            Odrzuć wniosek
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* H2.2: bulk reject dialog */}
            <Dialog
                open={bulkRejectOpen}
                onOpenChange={(o) => {
                    if (!o) {
                        setBulkRejectOpen(false)
                        setBulkRejectReason('')
                    }
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Odrzucenie {selectedIds.size} wniosków</DialogTitle>
                        <DialogDescription>
                            Powód zostanie zastosowany dla wszystkich zaznaczonych wniosków.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="bulk_reject_reason">Wspólny powód (wymagany)</Label>
                        <Textarea
                            id="bulk_reject_reason"
                            rows={3}
                            value={bulkRejectReason}
                            onChange={(e) => setBulkRejectReason(e.target.value)}
                            placeholder="np. wszystkie naraz nie mogą pójść — proszę przesunąć terminy"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBulkRejectOpen(false)}>
                            Anuluj
                        </Button>
                        <Button onClick={handleBulkRejectSubmit} disabled={!bulkRejectReason.trim()}>
                            Odrzuć {selectedIds.size} wnioski/-ów
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
