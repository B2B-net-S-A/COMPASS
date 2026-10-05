'use client'

// Phase 41c — panel aktywnych przekierowań poczty.
//
// Reguła przekierowania nie wygasa sama, a do tej pory nikt jej nie widział: stan
// żył wyłącznie w skrzynkach Outlooka i w jednej kolumnie, na którą nikt nie patrzył.
// O dwóch regułach, które przeżyły swoje urlopy, dowiedzieliśmy się dopiero wtedy,
// gdy zastępcy zgłosili, że dostają cudzą pocztę. Ten panel robi ten stan widocznym.
//
// Widok wchodzi z danymi z bazy (tanie, natychmiastowe). Pełny skan skrzynek jest
// pod przyciskiem, bo trwa kilkanaście sekund — i tylko on pokazuje reguły, o których
// baza zapomniała.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Loader2, MailWarning, RefreshCcw, ScanSearch, Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { pl } from 'date-fns/locale'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import {
    listActiveForwardRules,
    removeForwardRule,
    runForwardReconcileNow,
    type ForwardRuleView,
} from '@/lib/actions/leave-forward-admin'

interface Props {
    /** Stan wg bazy — renderowany od razu, bez odpytywania Outlooka. */
    initial: ForwardRuleView[]
}

function fmt(d: string | null): string {
    if (!d) return '—'
    try {
        return format(parseISO(d), 'd LLL yyyy', { locale: pl })
    } catch {
        return d
    }
}

export function AdminForwardRules({ initial }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    const [rows, setRows] = useState<ForwardRuleView[]>(initial)
    const [scanned, setScanned] = useState(false)
    const [busyRule, setBusyRule] = useState<string | null>(null)
    const [note, setNote] = useState<string | null>(null)

    const orphans = rows.filter((r) => r.health === 'orphan')
    const missing = rows.filter((r) => r.health === 'missing')
    const healthy = rows.filter((r) => r.health === 'ok')

    function handleScan() {
        startTransition(async () => {
            try {
                const res = await listActiveForwardRules()
                setRows(res.rules)
                setScanned(true)
                if (res.graphUnavailable) {
                    setNote('Brak połączenia z Outlookiem — pokazany stan pochodzi wyłącznie z bazy.')
                } else {
                    const skipped =
                        res.unreadableMailboxes.length > 0
                            ? ` Nie odczytano ${res.unreadableMailboxes.length} skrzynek — ich stan pozostaje nieznany.`
                            : ''
                    setNote(`Sprawdzono ${res.scannedMailboxes} skrzynek.${skipped}`)
                }
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Nie udało się sprawdzić skrzynek.')
            }
        })
    }

    function handleReconcile() {
        startTransition(async () => {
            try {
                const res = await runForwardReconcileNow()
                toastSuccess(
                    `Uzgodniono: założono ${res.opened}, zamknięto ${res.closed}, usunięto osieroconych ${res.orphansRemoved}, zaktualizowano filtry ${res.filtersUpdated}.`,
                )
                if (res.errors.length > 0) {
                    toast.warning(`Zgłoszone problemy: ${res.errors.slice(0, 3).join('; ')}`)
                }
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Uzgodnienie nie powiodło się.')
            }
        })
    }

    function handleRemove(row: ForwardRuleView) {
        if (!row.ruleId) return
        setBusyRule(row.ruleId)
        startTransition(async () => {
            try {
                const res = await removeForwardRule({
                    mailbox: row.mailbox,
                    ruleId: row.ruleId as string,
                    leaveId: row.leaveId,
                })
                if (res.removed) {
                    toastSuccess(`Przekierowanie ze skrzynki ${row.mailbox} usunięte.`)
                    setRows((prev) => prev.filter((r) => r.ruleId !== row.ruleId))
                    router.refresh()
                } else {
                    toast.error(res.error ?? 'Nie udało się usunąć reguły.')
                }
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd')
            } finally {
                setBusyRule(null)
            }
        })
    }

    const problem = orphans.length > 0 || missing.length > 0

    return (
        <Card className={problem ? 'border-warning/30 bg-warning/5' : undefined}>
            <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                    <MailWarning className={`h-4 w-4 ${problem ? 'text-warning' : ''}`} />
                    Aktywne przekierowania poczty
                    {orphans.length > 0 && (
                        <Badge variant="destructive" className="text-[10px]">
                            {orphans.length} do zamknięcia
                        </Badge>
                    )}
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                    Reguła Outlooka nie wygasa sama — dopóki ktoś jej nie zamknie, poczta pracownika
                    idzie do zastępcy także po urlopie. Widok pokazuje stan zapisany w COMPASS;
                    „Sprawdź skrzynki” odpytuje Outlooka i wychwyci też reguły, o których baza nie wie.
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                    <Button size="sm" variant="outline" onClick={handleScan} disabled={pending}>
                        {pending ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : (
                            <ScanSearch className="h-3 w-3 mr-1" />
                        )}
                        Sprawdź skrzynki
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleReconcile} disabled={pending}>
                        <RefreshCcw className="h-3 w-3 mr-1" />
                        Uzgodnij teraz
                    </Button>
                </div>
                {note && <p className="text-[11px] text-muted-foreground pt-1">{note}</p>}
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {scanned
                            ? 'Żadna skrzynka nie ma aktywnego przekierowania.'
                            : 'COMPASS nie ma zapisanego żadnego aktywnego przekierowania. Aby mieć pewność, że nie została gdzieś stara reguła, użyj „Sprawdź skrzynki”.'}
                    </p>
                ) : (
                    <div className="space-y-2">
                        {[...orphans, ...missing, ...healthy].map((row) => (
                            <div
                                key={`${row.mailbox}-${row.ruleId ?? row.leaveId ?? 'x'}`}
                                className="border rounded-lg p-3 flex flex-wrap items-start justify-between gap-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-sm">
                                            {row.employeeName ?? row.mailbox}
                                        </span>
                                        {row.health === 'orphan' && (
                                            <Badge variant="destructive" className="text-[10px]">
                                                do zamknięcia
                                            </Badge>
                                        )}
                                        {row.health === 'missing' && (
                                            <Badge variant="outline" className="text-[10px]">
                                                brak reguły
                                            </Badge>
                                        )}
                                        {row.health === 'ok' && (
                                            <Badge variant="secondary" className="text-[10px]">
                                                aktywne
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Poczta idzie do:{' '}
                                        <span className="font-medium">
                                            {row.substituteName ?? 'nieznany zastępca'}
                                        </span>
                                        {' · '}
                                        {fmt(row.startDate)} – {fmt(row.endDate)}
                                    </p>
                                    {row.reason && (
                                        <p className="text-[11px] mt-1 inline-flex items-start gap-1 text-warning">
                                            <AlertTriangle className="h-3 w-3 mt-[1px] shrink-0" />
                                            {row.reason}
                                        </p>
                                    )}
                                </div>
                                {row.ruleId && row.health !== 'ok' && (
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => handleRemove(row)}
                                        disabled={pending}
                                    >
                                        {busyRule === row.ruleId ? (
                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-3 w-3 mr-1" />
                                        )}
                                        Usuń regułę
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
