import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createLifecycleClient as createClient } from '@/lib/supabase/lifecycle-client'
import { requireLifecycleHubLayout } from '@/lib/auth/internal-guard'
import { listOffboardingTasks, getLifecycleTimeline } from '@/lib/actions/lifecycle'
import { canManageLifecycle } from '@/lib/types/role'
import { OffboardingChecklist } from '../../components/OffboardingChecklist'
import { LifecycleTimelinePanel } from '../../components/LifecycleTimelinePanel'
import { MarkExitedButton } from '../../components/MarkExitedButton'
import { LogOut } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function OffboardingDetailPage({ params }: { params: { userId: string } }) {
    const ctx = await requireLifecycleHubLayout()

    const supabase = createClient()
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, employment_status, termination_date, manager_id')
        .eq('id', params.userId)
        .single()

    if (error || !profile) notFound()

    const isManagerOfEmployee = profile.manager_id === ctx.userId
    const isAuthorized = canManageLifecycle(ctx.role) || isManagerOfEmployee
    if (!isAuthorized) notFound()

    const [tasks, timeline] = await Promise.all([
        listOffboardingTasks(profile.id),
        getLifecycleTimeline(profile.id),
    ])

    const completed = tasks.filter((t) => t.completed_at).length
    const requiredCompleted = tasks.filter((t) => t.is_required && t.completed_at).length
    const requiredTotal = tasks.filter((t) => t.is_required).length

    return (
        <div className="container mx-auto p-6 space-y-6 max-w-5xl">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <LogOut className="h-7 w-7 text-amber-400" />
                        Offboarding — {profile.full_name ?? profile.email}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Status: <strong>{profile.employment_status}</strong>
                        {profile.termination_date && (
                            <> • Termination date: {new Date(profile.termination_date).toLocaleDateString('pl-PL')}</>
                        )}
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-3xl font-bold">{completed}/{tasks.length}</div>
                    <div className="text-xs text-muted-foreground">tasków zrobionych</div>
                </div>
            </header>

            <section>
                <h2 className="text-lg font-semibold mb-3">Offboarding checklist</h2>
                <OffboardingChecklist
                    tasks={tasks}
                    currentUserId={ctx.userId}
                    currentUserRole={ctx.role}
                    employeeManagerId={profile.manager_id}
                />
            </section>

            {canManageLifecycle(ctx.role)
                && requiredCompleted === requiredTotal
                && profile.employment_status === 'offboarding'
                && (
                    <section className="rounded-lg border-2 border-amber-400/30 bg-amber-400/5 p-4">
                        <p className="text-sm mb-2">
                            Wszystkie {requiredTotal} wymaganych zadań offboardingu ukończonych. Możesz oznaczyć pracownika jako exited.
                        </p>
                        <MarkExitedButton userId={profile.id} />
                    </section>
                )}

            {timeline.length > 0 && (
                <section>
                    <h2 className="text-lg font-semibold mb-3">Timeline</h2>
                    <LifecycleTimelinePanel events={timeline} />
                </section>
            )}

            <div>
                <Link href="/internal/lifecycle" className="text-xs underline text-muted-foreground">
                    ← Powrót do hub
                </Link>
            </div>
        </div>
    )
}
