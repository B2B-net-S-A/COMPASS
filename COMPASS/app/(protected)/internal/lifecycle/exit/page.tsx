import Link from 'next/link'
import { redirect } from 'next/navigation'
import { listExitInterviews } from '@/lib/actions/lifecycle'
import { requireLifecycleHubLayout } from '@/lib/auth/internal-guard'
import { canManageLifecycle } from '@/lib/types/role'
import { LogOut } from 'lucide-react'
import { ExportExitInterviewsButton } from '../components/ExportExitInterviewsButton'

export const dynamic = 'force-dynamic'

export default async function ExitInterviewQueuePage() {
    const ctx = await requireLifecycleHubLayout()

    if (!canManageLifecycle(ctx.role) && !ctx.hasTcmAccess) {
        // Non-TCM/admin → redirect to own form or hub
        redirect('/internal/lifecycle/exit/wypelnij')
    }

    const interviews = await listExitInterviews({ status: 'submitted' })

    return (
        <div className="container mx-auto p-6 space-y-6 max-w-7xl">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <LogOut className="h-7 w-7 text-warning" />
                        Exit interview — do review
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">{interviews.length} wypełnionych ankiet</p>
                </div>
                <div className="flex items-center gap-3">
                    <ExportExitInterviewsButton />
                    <Link href="/internal/lifecycle" className="text-sm underline text-muted-foreground">
                        ← Powrót do hub
                    </Link>
                </div>
            </header>

            {interviews.length === 0 ? (
                <div className="rounded-lg border bg-card p-12 text-center">
                    <p className="text-muted-foreground">Brak wypełnionych ankiet do review.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {interviews.map((i) => (
                        <Link
                            key={i.id}
                            href={`/internal/lifecycle/exit/${i.id}`}
                            className="block rounded-lg border bg-card p-4 hover:bg-accent"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium">
                                        {i.is_anonymous ? <em>Anonimowo</em> : i.user_full_name ?? i.user_email ?? '—'}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Rola: {i.role_snapshot} • Staż: {i.tenure_months ?? '?'} mies. •{' '}
                                        Wysłano: {i.submitted_at ? new Date(i.submitted_at).toLocaleDateString('pl-PL') : '—'}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs text-muted-foreground">NPS</div>
                                    <div className="text-xl font-bold">{i.nps_score ?? '—'}/10</div>
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
