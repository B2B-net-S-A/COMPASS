'use client'

import { useEffect, useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { History, RefreshCw, Loader2 } from 'lucide-react'
import { getRateChangeLog, type RateChangeLogEntry } from '@/lib/actions/rates'

interface RateChangeLogListProps {
    initialEntries?: RateChangeLogEntry[]
    rateId?: string
    title?: string
    limit?: number
}

const ACTION_LABEL: Record<RateChangeLogEntry['action'], { label: string; tone: string }> = {
    INSERT: { label: 'Dodano', tone: 'bg-green-500/10 text-green-300 border-green-500/30' },
    UPDATE: { label: 'Zaktualizowano', tone: 'bg-blue-500/10 text-blue-300 border-blue-500/30' },
    DELETE: { label: 'Usunięto', tone: 'bg-red-500/10 text-red-300 border-red-500/30' },
}

function formatDelta(oldVal: number | null, newVal: number | null): string {
    if (oldVal === null && newVal === null) return '—'
    if (oldVal === null) return `→ ${newVal}`
    if (newVal === null) return `${oldVal} →`
    if (oldVal === newVal) return `${oldVal}`
    const arrow = newVal > oldVal ? '↑' : '↓'
    return `${oldVal} → ${newVal} ${arrow}`
}

export function RateChangeLogList({ initialEntries, rateId, title = 'Historia zmian stawek', limit = 100 }: RateChangeLogListProps) {
    const [entries, setEntries] = useState<RateChangeLogEntry[]>(initialEntries || [])
    const [loaded, setLoaded] = useState(!!initialEntries)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const reload = () => {
        startTransition(async () => {
            setError(null)
            try {
                const fresh = await getRateChangeLog(rateId, limit)
                setEntries(fresh)
                setLoaded(true)
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : 'Nie udało się załadować historii')
            }
        })
    }

    useEffect(() => {
        if (!loaded) reload()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return (
        <Card className="bg-white/5 border-white/10">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                    <History className="w-5 h-5 text-primary" />
                    {title}
                </CardTitle>
                <Button
                    onClick={reload}
                    disabled={isPending}
                    variant="outline"
                    size="sm"
                    className="border-white/20"
                    data-testid="rate-log-refresh-btn"
                >
                    {isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Ładuję...</> : <><RefreshCw className="w-4 h-4 mr-2" /> Odśwież</>}
                </Button>
            </CardHeader>
            <CardContent>
                {error && (
                    <div className="p-3 rounded-lg border bg-red-500/10 border-red-500/30 text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {!error && entries.length === 0 && loaded && (
                    <div className="p-4 rounded-lg bg-white/5 border border-white/10 text-sm text-muted-foreground">
                        Brak zmian w historii (lub trigger jeszcze nie został zainstalowany — uruchom migrację{' '}
                        <code className="text-xs">20260428_rate_change_log.sql</code>).
                    </div>
                )}

                {entries.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm" data-testid="rate-log-table">
                            <thead>
                                <tr className="border-b border-white/10 text-xs text-muted-foreground uppercase tracking-wider">
                                    <th className="text-left py-2 px-2">Kiedy</th>
                                    <th className="text-left py-2 px-2">Akcja</th>
                                    <th className="text-left py-2 px-2">Stanowisko</th>
                                    <th className="text-left py-2 px-2">Min</th>
                                    <th className="text-left py-2 px-2">Mediana</th>
                                    <th className="text-left py-2 px-2">Max</th>
                                    <th className="text-left py-2 px-2">Kto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {entries.map((e) => (
                                    <tr key={e.id} className="border-b border-white/5 hover:bg-white/5">
                                        <td className="py-2 px-2 text-muted-foreground text-xs whitespace-nowrap">
                                            {new Date(e.changed_at).toLocaleString('pl-PL')}
                                        </td>
                                        <td className="py-2 px-2">
                                            <Badge variant="outline" className={ACTION_LABEL[e.action].tone}>
                                                {ACTION_LABEL[e.action].label}
                                            </Badge>
                                        </td>
                                        <td className="py-2 px-2 text-white font-medium">
                                            {e.position_title || '—'}
                                        </td>
                                        <td className="py-2 px-2 text-gray-300 font-mono text-xs">
                                            {formatDelta(e.old_rate_min, e.new_rate_min)}
                                        </td>
                                        <td className="py-2 px-2 text-gray-300 font-mono text-xs">
                                            {formatDelta(e.old_rate_median, e.new_rate_median)}
                                        </td>
                                        <td className="py-2 px-2 text-gray-300 font-mono text-xs">
                                            {formatDelta(e.old_rate_max, e.new_rate_max)}
                                        </td>
                                        <td className="py-2 px-2 text-gray-300 text-xs">
                                            {e.actor_name || e.actor_email || (e.changed_by ? e.changed_by.slice(0, 8) : 'system')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
