import { redirect } from 'next/navigation'
import Link from 'next/link'
import { listOnboardingQueue } from '@/lib/actions/lifecycle'
import { requireLifecycleHubLayout } from '@/lib/auth/internal-guard'
import { createLifecycleClient as createClient } from '@/lib/supabase/lifecycle-client'
import { canManageLifecycle, roleLabelPl } from '@/lib/types/role'
import { UserPlus, AlertCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function OnboardingQueuePage() {
    const ctx = await requireLifecycleHubLayout()

    // Employee → redirect to their own onboarding (if any)
    if (!canManageLifecycle(ctx.role) && ctx.role !== 'manager') {
        const supabase = createClient()
        const { data: own } = await supabase
            .from('onboarding_progress')
            .select('id')
            .eq('user_id', ctx.userId)
            .is('completed_at', null)
            .maybeSingle()
        if (own) redirect(`/internal/lifecycle/onboarding/${own.id}`)
        redirect('/internal/lifecycle')
    }

    const queue = await listOnboardingQueue()

    return (
        <div className="container mx-auto p-6 space-y-6 max-w-7xl">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <UserPlus className="h-7 w-7 text-info" />
                        Kolejka onboardingu
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">{queue.length} aktywnych procesów</p>
                </div>
                <Link href="/internal/lifecycle" className="text-sm underline text-muted-foreground">
                    ← Powrót do hub
                </Link>
            </header>

            {queue.length === 0 ? (
                <div className="rounded-lg border bg-card p-12 text-center">
                    <p className="text-muted-foreground">Brak aktywnych onboardingów.</p>
                </div>
            ) : (
                <div className="rounded-lg border bg-card overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left p-3">Pracownik</th>
                                <th className="text-left p-3">Rola</th>
                                <th className="text-left p-3">Start</th>
                                <th className="text-left p-3">Postęp</th>
                                <th className="text-left p-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {queue.map((r) => {
                                const pct = r.tasks_total === 0 ? 0 : Math.round((r.tasks_completed / r.tasks_total) * 100)
                                return (
                                    <tr key={r.progress_id} className="border-t hover:bg-accent/40">
                                        <td className="p-3">
                                            <Link href={`/internal/lifecycle/onboarding/${r.progress_id}`} className="hover:underline">
                                                <div className="font-medium">{r.full_name ?? r.email}</div>
                                                <div className="text-xs text-muted-foreground">{r.email}</div>
                                            </Link>
                                        </td>
                                        <td className="p-3 text-muted-foreground">{roleLabelPl(r.role)}</td>
                                        <td className="p-3 text-muted-foreground">
                                            {new Date(r.started_at).toLocaleDateString('pl-PL')}
                                        </td>
                                        <td className="p-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-24 h-2 bg-muted rounded overflow-hidden">
                                                    <div className="h-full bg-info" style={{ width: `${pct}%` }} />
                                                </div>
                                                <span className="text-xs text-muted-foreground">
                                                    {r.tasks_completed}/{r.tasks_total}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            {r.tasks_overdue > 0 ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-destructive">
                                                    <AlertCircle className="h-3 w-3" />
                                                    {r.tasks_overdue} overdue
                                                </span>
                                            ) : (
                                                <span className="text-xs text-success">OK</span>
                                            )}
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
