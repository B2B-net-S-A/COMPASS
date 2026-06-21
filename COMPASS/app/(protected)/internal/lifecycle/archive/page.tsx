import Link from 'next/link'
import { listCompletedOnboardings, listExitedEmployees } from '@/lib/actions/lifecycle'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { roleLabelPl } from '@/lib/types/role'
import { Archive, CheckCircle2, XCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ArchivePage() {
    await requireLifecycleManagerAction()

    const [completed, exited] = await Promise.all([
        listCompletedOnboardings(100),
        listExitedEmployees(100),
    ])

    return (
        <div className="container mx-auto p-6 space-y-6 max-w-7xl">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Archive className="h-7 w-7 text-muted-foreground" />
                        Archiwum
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        {completed.length} zakończonych onboardingów • {exited.length} pracowników którzy odeszli
                    </p>
                </div>
                <Link href="/internal/lifecycle" className="text-sm underline text-muted-foreground">
                    ← Powrót do hub
                </Link>
            </header>

            <section>
                <h2 className="text-lg font-semibold mb-3">Zakończone / anulowane onboardingi</h2>
                {completed.length === 0 ? (
                    <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
                        Brak zakończonych onboardingów.
                    </div>
                ) : (
                    <div className="rounded-lg border bg-card overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-xs uppercase">
                                <tr>
                                    <th className="text-left p-3">Pracownik</th>
                                    <th className="text-left p-3">Rola</th>
                                    <th className="text-left p-3">Start</th>
                                    <th className="text-left p-3">Zakończenie</th>
                                    <th className="text-left p-3">Czas</th>
                                    <th className="text-left p-3">Wynik</th>
                                </tr>
                            </thead>
                            <tbody>
                                {completed.map((c) => (
                                    <tr key={c.progress_id} className="border-t hover:bg-accent/40">
                                        <td className="p-3">
                                            <div className="font-medium">{c.full_name ?? c.email}</div>
                                            <div className="text-xs text-muted-foreground">{c.email}</div>
                                        </td>
                                        <td className="p-3 text-muted-foreground">{roleLabelPl(c.role)}</td>
                                        <td className="p-3 text-xs text-muted-foreground">
                                            {new Date(c.started_at).toLocaleDateString('pl-PL')}
                                        </td>
                                        <td className="p-3 text-xs text-muted-foreground">
                                            {c.completed_at ? new Date(c.completed_at).toLocaleDateString('pl-PL')
                                                : c.cancelled_at ? new Date(c.cancelled_at).toLocaleDateString('pl-PL') : '—'}
                                        </td>
                                        <td className="p-3 text-xs text-muted-foreground">
                                            {c.duration_days !== null ? `${c.duration_days} dni` : '—'}
                                        </td>
                                        <td className="p-3 text-xs">
                                            {c.completed_at ? (
                                                <span className="inline-flex items-center gap-1 text-success">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    Ukończony
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-destructive">
                                                    <XCircle className="h-3 w-3" />
                                                    Anulowany
                                                    {c.cancellation_reason && (
                                                        <span className="text-muted-foreground ml-1">({c.cancellation_reason})</span>
                                                    )}
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section>
                <h2 className="text-lg font-semibold mb-3">Byli pracownicy (exited)</h2>
                {exited.length === 0 ? (
                    <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
                        Brak byłych pracowników w archiwum.
                    </div>
                ) : (
                    <div className="rounded-lg border bg-card overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-xs uppercase">
                                <tr>
                                    <th className="text-left p-3">Pracownik</th>
                                    <th className="text-left p-3">Rola</th>
                                    <th className="text-left p-3">Zatrudniony</th>
                                    <th className="text-left p-3">Odszedł</th>
                                    <th className="text-left p-3">Staż</th>
                                </tr>
                            </thead>
                            <tbody>
                                {exited.map((e) => (
                                    <tr key={e.id} className="border-t hover:bg-accent/40">
                                        <td className="p-3">
                                            <div className="font-medium">{e.full_name ?? e.email}</div>
                                            <div className="text-xs text-muted-foreground">{e.email}</div>
                                        </td>
                                        <td className="p-3 text-muted-foreground">{roleLabelPl(e.role)}</td>
                                        <td className="p-3 text-xs text-muted-foreground">
                                            {e.hired_at ? new Date(e.hired_at).toLocaleDateString('pl-PL') : '—'}
                                        </td>
                                        <td className="p-3 text-xs text-muted-foreground">
                                            {e.termination_date ? new Date(e.termination_date).toLocaleDateString('pl-PL') : '—'}
                                        </td>
                                        <td className="p-3 text-xs text-muted-foreground">
                                            {e.tenure_months !== null ? `${e.tenure_months} mies.` : '—'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    )
}
