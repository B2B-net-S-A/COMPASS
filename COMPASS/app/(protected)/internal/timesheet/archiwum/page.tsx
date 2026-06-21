import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileDown, ChevronLeft, FileSpreadsheet } from 'lucide-react'
import { format } from 'date-fns'
import { pl } from 'date-fns/locale'
import { listMyTimesheetHistory } from '@/lib/actions/internal-timesheet'
import { MyTimesheetCSVButton } from '@/components/internal/MyTimesheetCSVButton'

export const dynamic = 'force-dynamic'

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    draft: { label: 'Szkic', className: 'bg-muted/15 text-muted-foreground border-border/30' },
    submitted: {
        label: 'Oczekuje',
        className: 'bg-warning/15 text-warning border-warning/30',
    },
    approved: {
        label: 'Zaakceptowany',
        className: 'bg-success/15 text-success border-success/30',
    },
    rejected: { label: 'Odrzucony', className: 'bg-destructive/15 text-destructive border-destructive/30' },
}

export default async function TimesheetArchivePage() {
    const history = await listMyTimesheetHistory(12)

    const totalApprovedHours = history
        .filter((r) => r.status === 'approved')
        .reduce((sum, r) => sum + r.total_hours, 0)

    return (
        <div className="space-y-6">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold">Archiwum timesheetów</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Twoja historia 12 ostatnich miesięcy — kliknij wiersz, aby otworzyć
                        edytor/PDF dla wybranego miesiąca.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/internal?tab=timesheet">
                        <Button variant="ghost" size="sm">
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Wróć
                        </Button>
                    </Link>
                    <MyTimesheetCSVButton defaultYear={history[0]?.year} defaultMonth={history[0]?.month} />
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Ostatnie 12 miesięcy</CardTitle>
                    <p className="text-xs text-muted-foreground">
                        Zaakceptowanych godzin łącznie:{' '}
                        <strong>{totalApprovedHours.toFixed(2)} h</strong>
                    </p>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b text-xs text-muted-foreground">
                                    <th className="text-left py-2 pr-2 font-medium">Okres</th>
                                    <th className="text-left py-2 pr-2 font-medium">Status</th>
                                    <th className="text-right py-2 pr-2 font-medium">Wpisów</th>
                                    <th className="text-right py-2 pr-2 font-medium">Suma h</th>
                                    <th className="text-left py-2 pr-2 font-medium">Akceptacja</th>
                                    <th className="text-right py-2 pr-2 font-medium">Akcje</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((row) => {
                                    const status = STATUS_BADGE[row.status]
                                    const periodDate = new Date(row.year, row.month - 1, 1)
                                    const isEmpty = row.entry_count === 0
                                    return (
                                        <tr
                                            key={`${row.year}-${row.month}`}
                                            className="border-b border-border/40 hover:bg-muted/20"
                                        >
                                            <td className="py-2 pr-2 whitespace-nowrap">
                                                <Link
                                                    href={`/internal/timesheet/${row.year}/${row.month}`}
                                                    className="hover:underline"
                                                >
                                                    {format(periodDate, 'LLLL yyyy', {
                                                        locale: pl,
                                                    })}
                                                </Link>
                                            </td>
                                            <td className="py-2 pr-2">
                                                {isEmpty ? (
                                                    <span className="text-xs text-muted-foreground">
                                                        brak
                                                    </span>
                                                ) : (
                                                    <Badge
                                                        variant="outline"
                                                        className={status?.className}
                                                    >
                                                        {status?.label ?? row.status}
                                                    </Badge>
                                                )}
                                                {row.rejection_note && (
                                                    <p className="text-[10px] text-destructive/80 italic mt-0.5">
                                                        {row.rejection_note.slice(0, 60)}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="py-2 pr-2 text-right text-xs tabular-nums">
                                                {row.entry_count}
                                            </td>
                                            <td className="py-2 pr-2 text-right font-mono text-xs tabular-nums">
                                                {row.total_hours.toFixed(2)}
                                            </td>
                                            <td className="py-2 pr-2 text-xs">
                                                {row.approved_at
                                                    ? format(
                                                          new Date(row.approved_at),
                                                          'd LLL yyyy',
                                                          { locale: pl },
                                                      )
                                                    : '—'}
                                            </td>
                                            <td className="py-2 pr-2 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Link
                                                        href={`/internal/timesheet/${row.year}/${row.month}`}
                                                    >
                                                        <Button size="sm" variant="ghost">
                                                            Otwórz
                                                        </Button>
                                                    </Link>
                                                    {row.status === 'approved' && (
                                                        <Link
                                                            href={`/internal/timesheet/${row.year}/${row.month}/pdf`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                        >
                                                            <Button size="sm" variant="ghost">
                                                                <FileDown className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </Link>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
