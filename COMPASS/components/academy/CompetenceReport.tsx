'use client'

import { useMemo, useState, useTransition } from 'react'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { daysToExpiry, filterCompetenceRows, reportDate, ROUTE_LABELS, summarizeCompetence, type CompetenceRow } from '@/lib/academy/competence-report'
import { exportCompetenceReportCsv } from '@/lib/actions/academy-reports'

export function CompetenceReport({ rows, active, lastExport, generatedAt }: { rows: CompetenceRow[]; active: number; lastExport: string | null; generatedAt: string }) {
    const now = Date.parse(generatedAt)
    const [programmeKey, setProgrammeKey] = useState('')
    const [expiringOnly, setExpiringOnly] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [pending, start] = useTransition()
    const programmes = useMemo(() => Array.from(new Map(rows.map(row => [row.programme_key, row.programme_title]))).sort((a, b) => a[1].localeCompare(b[1], 'pl')), [rows])
    const summary = summarizeCompetence(rows, active, now)
    const filters = { programmeKey: programmeKey || undefined, expiringOnly: expiringOnly || undefined }
    const visible = filterCompetenceRows(rows, filters, now)
    const download = () => start(async () => {
        setError(null)
        const result = await exportCompetenceReportCsv(filters).catch(() => null)
        if (!result?.success) { setError(result?.error ?? 'Nie udało się przygotować eksportu. Odśwież stronę i spróbuj ponownie.'); return }
        const url = URL.createObjectURL(new Blob([result.data.csv], { type: 'text/csv;charset=utf-8' }))
        const link = document.createElement('a')
        link.href = url
        link.download = result.data.filename
        link.click()
        URL.revokeObjectURL(url)
    })
    const kpis: Array<[string, string | number, string]> = [
        ['Aktywni', summary.active, `${summary.withCertificate} z poświadczeniem, ${summary.inProgress} w trakcie`],
        ['Z poświadczeniem', summary.withCertificate, `osób, programów łącznie: ${summary.programmes}`],
        ['Droga', `${summary.live} / ${summary.modules}`, 'live / moduły'],
        ['Wygasa w 60 dni', summary.expiring, summary.lastExpiring ? `do ${reportDate(summary.lastExpiring)}` : 'nic w tym oknie'],
    ]
    return <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-wrap gap-3">
                <label className="text-sm"><span className="mb-1 block text-muted-foreground">Program</span>
                    <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={programmeKey} onChange={event => setProgrammeKey(event.target.value)}>
                        <option value="">Wszystkie programy</option>{programmes.map(([key, title]) => <option key={key} value={key}>{title}</option>)}
                    </select></label>
                <label className="text-sm"><span className="mb-1 block text-muted-foreground">Klient</span>
                    <select disabled className="h-10 rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"><option>Po opinii prawnika</option></select></label>
                <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={expiringOnly} onChange={event => setExpiringOnly(event.target.checked)} />Wygasa w 60 dni</label>
            </div>
            <div className="flex flex-col items-start gap-1 sm:items-end">
                <Button type="button" disabled={pending || visible.length === 0} onClick={download}><Download aria-hidden="true" />{pending ? 'Przygotowuję…' : 'Eksportuj CSV'}</Button>
                <span className="text-xs text-muted-foreground">Wiersze: {visible.length}, wpis w dzienniku audytu</span>
            </div>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map(([label, value, hint]) => <div key={label} className="rounded-xl border border-border bg-card p-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{value}<span className="mt-1 block text-xs font-normal text-muted-foreground">{hint}</span></dd></div>)}
        </dl>
        <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between gap-3 p-3 text-sm text-muted-foreground"><span>Jeden wiersz to jeden program jednej osoby. Droga live i moduły liczą się razem raz.</span>
                {(programmeKey || expiringOnly) && <button type="button" className="font-medium text-primary" onClick={() => { setProgrammeKey(''); setExpiringOnly(false) }}>Wyczyść filtry</button>}</div>
            {visible.length === 0 ? <p className="border-t border-border p-4 text-sm text-muted-foreground">Brak dokumentów spełniających te warunki.</p> : <div className="overflow-x-auto border-t border-border">
                <table className="w-full text-left text-sm">
                    <thead><tr className="text-muted-foreground"><th className="p-2 font-medium">Osoba</th><th className="p-2 font-medium">Program</th><th className="p-2 font-medium">Wersja</th><th className="p-2 font-medium">Droga</th><th className="p-2 font-medium">Data</th><th className="p-2 font-medium">Ważne do</th></tr></thead>
                    <tbody>{visible.map(row => {
                        const left = daysToExpiry(row.valid_until, now)
                        return <tr key={`${row.user_id}:${row.programme_key}`} className="border-t border-border">
                            <th scope="row" className="whitespace-nowrap p-2 font-medium">{row.full_name}</th><td className="p-2">{row.programme_title}</td><td className="p-2 text-muted-foreground">v{row.version_number}</td><td className="p-2">{ROUTE_LABELS[row.route]}</td><td className="p-2 tabular-nums">{reportDate(row.completed_at)}</td>
                            <td className="whitespace-nowrap p-2 tabular-nums">{row.valid_until ? <>{reportDate(row.valid_until)}{left !== null && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">za {left} dni</span>}</> : <span className="text-muted-foreground">bez terminu</span>}</td>
                        </tr>
                    })}</tbody>
                </table></div>}
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
            <p className="text-sm font-semibold">Wspiera realizację obowiązku szkoleniowego. Nie jest certyfikatem zgodności.</p>
            {lastExport && <p className="text-sm text-muted-foreground">Ostatni eksport: {new Date(lastExport).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Warsaw' })}</p>}
        </div>
    </div>
}
