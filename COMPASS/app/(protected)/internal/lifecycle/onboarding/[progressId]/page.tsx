import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getOnboardingDetail, getLifecycleTimeline } from '@/lib/actions/lifecycle'
import { requireLifecycleHubLayout } from '@/lib/auth/internal-guard'
import { canManageLifecycle, roleLabelPl } from '@/lib/types/role'
import { OnboardingChecklist } from '../../components/OnboardingChecklist'
import { OnboardingCheckinPanel } from '../../components/OnboardingCheckinPanel'
import { LifecycleTimelinePanel } from '../../components/LifecycleTimelinePanel'
import { CompleteOnboardingButton } from '../../components/CompleteOnboardingButton'
import { BuddyCard } from '../../components/BuddyCard'

export const dynamic = 'force-dynamic'

export default async function OnboardingDetailPage({ params }: { params: { progressId: string } }) {
    const ctx = await requireLifecycleHubLayout()

    let detail
    try {
        detail = await getOnboardingDetail(params.progressId)
    } catch {
        notFound()
    }

    const timeline = await getLifecycleTimeline(detail.employee.id)

    const isOwner = detail.employee.id === ctx.userId
    const isLifecycleAdmin = canManageLifecycle(ctx.role)
    const isManagerOfEmployee = detail.employee.manager_id === ctx.userId
    const canEditTasks = isLifecycleAdmin || isManagerOfEmployee || isOwner || detail.employee.buddy_id === ctx.userId
    const canCompleteOnboarding = isLifecycleAdmin

    const completedTasks = detail.tasks.filter((t) => t.completed_at !== null).length
    const requiredTasks = detail.tasks.filter((t) => t.is_required).length
    const requiredCompleted = detail.tasks.filter((t) => t.is_required && t.completed_at !== null).length
    const progressPct = detail.tasks.length === 0 ? 0 : Math.round((completedTasks / detail.tasks.length) * 100)

    return (
        <div className="container mx-auto p-6 space-y-6 max-w-5xl">
            <header className="flex items-center justify-between">
                <div>
                    <Link href="/internal/lifecycle/onboarding" className="text-xs text-muted-foreground underline">
                        ← Wszystkie onboardingi
                    </Link>
                    <h1 className="text-2xl font-bold mt-1">{detail.employee.full_name ?? detail.employee.email}</h1>
                    <p className="text-sm text-muted-foreground">
                        {roleLabelPl(detail.employee.role)} •{' '}
                        Start: {new Date(detail.progress.started_at).toLocaleDateString('pl-PL')}
                        {detail.employee.hired_at && (
                            <> • Hire date: {new Date(detail.employee.hired_at).toLocaleDateString('pl-PL')}</>
                        )}
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-3xl font-bold">{progressPct}%</div>
                    <div className="text-xs text-muted-foreground">
                        {completedTasks}/{detail.tasks.length} zadań
                    </div>
                </div>
            </header>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs uppercase text-muted-foreground">Manager</div>
                    <div className="font-medium">{detail.manager?.full_name ?? '—'}</div>
                </div>
                <BuddyCard
                    employeeId={detail.employee.id}
                    employeeName={detail.employee.full_name ?? detail.employee.email}
                    buddyId={detail.buddy?.id ?? null}
                    buddyName={detail.buddy?.full_name ?? null}
                    canEdit={isLifecycleAdmin || isManagerOfEmployee}
                />
                <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs uppercase text-muted-foreground">Szablon</div>
                    <div className="font-medium">{detail.template.name}</div>
                </div>
            </section>

            <section>
                <h2 className="text-lg font-semibold mb-3">Checklist</h2>
                <OnboardingChecklist
                    tasks={detail.tasks}
                    canEdit={canEditTasks}
                    currentUserId={ctx.userId}
                    currentUserRole={ctx.role}
                    employeeId={detail.employee.id}
                    employeeManagerId={detail.employee.manager_id}
                    employeeBuddyId={detail.employee.buddy_id}
                />
            </section>

            {isOwner && (
                <section>
                    <h2 className="text-lg font-semibold mb-3">Twoje check-iny</h2>
                    <OnboardingCheckinPanel
                        progress={detail.progress}
                        startedAt={detail.progress.started_at}
                    />
                </section>
            )}

            {canCompleteOnboarding && requiredCompleted === requiredTasks && !detail.progress.completed_at && (
                <section className="rounded-lg border-2 border-green-400/30 bg-green-400/5 p-4">
                    <p className="text-sm mb-2">
                        Wszystkie {requiredTasks} wymaganych zadań ukończonych. Możesz zamknąć onboarding pracownika.
                    </p>
                    <CompleteOnboardingButton progressId={detail.progress.id} />
                </section>
            )}

            {timeline.length > 0 && (
                <section>
                    <h2 className="text-lg font-semibold mb-3">Timeline</h2>
                    <LifecycleTimelinePanel events={timeline} />
                </section>
            )}
        </div>
    )
}
