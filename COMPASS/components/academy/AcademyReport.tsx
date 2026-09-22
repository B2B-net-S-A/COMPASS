import Link from 'next/link'
import { AcademyEmptyState } from './AcademyEmptyState'

interface Row { id: string; title: string; enrollments: number; completions: number; rate: number; rating: number }
interface Props {
    metrics: Array<{ label: string; value: string | number; href?: string }>
    rows: Row[]
    months?: Array<{ month: string; count: number }>
    admin?: boolean
}

export function AcademyReport({ metrics, rows, months, admin = false }: Props) {
    return <div className="space-y-6">
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(metric => <div key={metric.label} className="rounded-2xl border border-border bg-card p-5"><dt className="text-sm text-muted-foreground">{metric.label}</dt><dd className="mt-2 text-3xl font-semibold tabular-nums">{metric.href ? <Link className="underline-offset-4 hover:underline" href={metric.href}>{metric.value}</Link> : metric.value}</dd></div>)}</dl>
        <p className="text-sm leading-relaxed text-muted-foreground">Zestawienie obejmuje aktywne zapisy oraz zachowane ukończenia, także kursów archiwalnych. Pomija rezerwę i anulowane udziały bez ukończenia. Ukończenia pochodzą z potwierdzonych zaliczeń; unieważnione nie są zaliczane. Ocena dotyczy całego kursu; brak ocen oznaczamy kreską.</p>
        {months && <section className="rounded-2xl border border-border bg-card p-5"><h2 className="mb-4 text-lg font-semibold">Zapisy w ostatnich 12 miesiącach</h2><p className="mb-4 text-xs text-muted-foreground">Miesiące według daty zapisu w UTC; te same zasady zakresu co w podsumowaniu.</p><ol className="space-y-3">{months.map(month => <li key={month.month} className="flex items-center gap-3 text-sm"><span className="w-20 shrink-0">{new Intl.DateTimeFormat('pl-PL', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${month.month}-01T00:00:00Z`))}</span><span className="h-3 flex-1 overflow-hidden rounded bg-muted" aria-hidden="true"><span className="block h-full bg-primary" style={{ width: `${month.count / Math.max(1, ...months.map(item => item.count)) * 100}%` }} /></span><span className="w-12 shrink-0 text-right tabular-nums">{month.count}</span></li>)}</ol></section>}
        {rows.length === 0 ? <AcademyEmptyState title="Brak szkoleń w tym raporcie" description={admin ? 'Po dodaniu szkoleń pojawią się tu dane o zapisach i ukończeniach.' : 'Dane pojawią się po przypisaniu Ci kursu lub edycji do prowadzenia. Sam dostęp do redakcji nie daje wglądu w uczestników.'} /> : <section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="p-5"><h2 className="text-lg font-semibold">{admin ? 'Najczęściej wybierane szkolenia' : 'Prowadzone szkolenia'}</h2>{!admin && <p className="mt-1 text-sm text-muted-foreground">Przy przypisaniu do konkretnej edycji widzisz tylko jej uczestników.</p>}</div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Zapisy i potwierdzone ukończenia według szkolenia</caption><thead className="border-y border-border bg-muted/50"><tr>{['Szkolenie', 'Zapisy', 'Ukończenia', 'Ukończono', 'Ocena / 5'].map(label => <th key={label} scope="col" className="px-5 py-3 font-medium whitespace-nowrap">{label}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-border last:border-0"><th scope="row" className="min-w-48 px-5 py-4 font-medium">{row.title}</th><td className="px-5 py-4 tabular-nums">{row.enrollments}</td><td className="px-5 py-4 tabular-nums">{row.completions}</td><td className="px-5 py-4 tabular-nums">{row.rate}%</td><td className="px-5 py-4 tabular-nums">{row.rating ? row.rating.toFixed(1) : '—'}</td></tr>)}</tbody></table></div></section>}
    </div>
}
