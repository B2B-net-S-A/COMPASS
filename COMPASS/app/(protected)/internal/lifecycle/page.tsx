import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
    getLifecycleAnalytics,
    getLifecycleSidebarCount,
    listOnboardingQueue,
    listExitInterviews,
} from '@/lib/actions/lifecycle'
import { requireLifecycleHubLayout } from '@/lib/auth/internal-guard'
import { createLifecycleClient as createClient } from '@/lib/supabase/lifecycle-client'
import { ClipboardList, LogOut, AlertCircle, TrendingUp, FileText, BarChart3, UserPlus, Users, Archive } from 'lucide-react'
import { canManageLifecycle } from '@/lib/types/role'
import { HubActionButtons } from './components/HubActionButtons'

export const dynamic = 'force-dynamic'

export default async function LifecycleHubPage() {
    const ctx = await requireLifecycleHubLayout()
    const supabase = createClient()

    // Non-manager employees: redirect to their own onboarding or exit form.
    // Phase 45: a per-user has_tcm_access grant also reaches the full dashboard.
    if (!canManageLifecycle(ctx.role) && ctx.role !== 'manager' && !ctx.hasTcmAccess) {
        const { data: ownProgress } = await supabase
            .from('onboarding_progress')
            .select('id')
            .eq('user_id', ctx.userId)
            .is('completed_at', null)
            .maybeSingle()
        if (ownProgress) {
            redirect(`/internal/lifecycle/onboarding/${ownProgress.id}`)
        }
        const { data: profile } = await supabase
            .from('profiles')
            .select('employment_status')
            .eq('id', ctx.userId)
            .single()
        if (profile?.employment_status === 'offboarding') {
            redirect('/internal/lifecycle/exit/wypelnij')
        }
        redirect('/internal')
    }

    // Manager-only view: limited dashboard. Phase 45: a manager with the has_tcm_access
    // grant skips the restricted view and gets the full admin/TCM dashboard below.
    if (ctx.role === 'manager' && !ctx.isAdmin && !ctx.isTalentCommunity && !ctx.hasTcmAccess) {
        return <ManagerLifecycleView />
    }

    // Admin / TCM full dashboard
    const [analytics, recentOnboardings, pendingExits, sidebarCount] = await Promise.all([
        getLifecycleAnalytics(),
        listOnboardingQueue({ status: 'in_progress' }),
        listExitInterviews({ status: 'submitted' }),
        getLifecycleSidebarCount(),
    ])

    return (
        <div className="container mx-auto p-6 space-y-6 max-w-7xl">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <ClipboardList className="h-7 w-7 text-info" />
                        Lifecycle — Onboarding & Exit
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Zarządzanie procesami wejścia i wyjścia pracowników. Ostatnie 90 dni: {analytics.period.from} → {analytics.period.to}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link
                        href="/internal/lifecycle/employees"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md border hover:bg-accent text-sm font-medium"
                    >
                        <Users className="h-4 w-4" /> Pracownicy
                    </Link>
                    <Link
                        href="/internal/lifecycle/archive"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md border hover:bg-accent text-sm font-medium"
                    >
                        <Archive className="h-4 w-4" /> Archiwum
                    </Link>
                    <Link
                        href="/internal/lifecycle/templates"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 text-sm font-medium"
                    >
                        <FileText className="h-4 w-4" /> Szablony
                    </Link>
                </div>
            </header>

            <section className="rounded-lg border-2 border-dashed border-primary/30 bg-card p-4">
                <h2 className="text-sm font-semibold mb-3">Szybkie akcje</h2>
                <HubActionButtons />
                <p className="text-xs text-muted-foreground mt-3">
                    &quot;Nowy onboarding&quot; uruchamia proces dla istniejącego pracownika (wybierasz osobę + szablon + datę).
                    &quot;Zaplanuj exit&quot; ustawia status = offboarding i tworzy ticket offboardingowy w Module Obsługi Zgłoszeń.
                </p>
            </section>

            <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <KpiCard
                    icon={<UserPlus className="h-5 w-5" />}
                    label="Aktywne onboardingi"
                    value={analytics.activeOnboardings}
                    color="text-info"
                />
                <KpiCard
                    icon={<LogOut className="h-5 w-5" />}
                    label="Pending exit interviews"
                    value={analytics.pendingExitInterviews}
                    color="text-warning"
                />
                <KpiCard
                    icon={<AlertCircle className="h-5 w-5" />}
                    label="Overdue zadania"
                    value={analytics.overdueTasks}
                    color="text-destructive"
                />
                <KpiCard
                    icon={<TrendingUp className="h-5 w-5" />}
                    label="Onboarding completion (90d)"
                    value={analytics.completedOnboardings}
                    color="text-success"
                />
            </section>

            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link
                    href="/internal/lifecycle/onboarding"
                    className="rounded-lg border bg-card p-4 hover:bg-accent transition flex items-center justify-between"
                >
                    <div>
                        <div className="text-xs uppercase text-muted-foreground">Kolejka</div>
                        <div className="text-lg font-semibold">Onboarding ({recentOnboardings.length})</div>
                    </div>
                    <UserPlus className="h-6 w-6 text-info" />
                </Link>
                <Link
                    href="/internal/lifecycle/exit"
                    className="rounded-lg border bg-card p-4 hover:bg-accent transition flex items-center justify-between"
                >
                    <div>
                        <div className="text-xs uppercase text-muted-foreground">Kolejka</div>
                        <div className="text-lg font-semibold">Exit interview ({pendingExits.length})</div>
                    </div>
                    <LogOut className="h-6 w-6 text-warning" />
                </Link>
                <Link
                    href="/internal/lifecycle/analytics"
                    className="rounded-lg border bg-card p-4 hover:bg-accent transition flex items-center justify-between"
                >
                    <div>
                        <div className="text-xs uppercase text-muted-foreground">Wykresy</div>
                        <div className="text-lg font-semibold">Analytics</div>
                    </div>
                    <BarChart3 className="h-6 w-6 text-success" />
                </Link>
            </section>

            {recentOnboardings.length > 0 && (
                <section className="rounded-lg border bg-card p-4">
                    <h2 className="font-semibold mb-3">Aktywne onboardingi</h2>
                    <div className="space-y-2">
                        {recentOnboardings.slice(0, 5).map((r) => (
                            <Link
                                key={r.progress_id}
                                href={`/internal/lifecycle/onboarding/${r.progress_id}`}
                                className="flex items-center justify-between p-3 rounded border hover:bg-accent text-sm"
                            >
                                <div>
                                    <div className="font-medium">{r.full_name ?? r.email}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {r.tasks_completed} / {r.tasks_total} zadań
                                        {r.tasks_overdue > 0 && (
                                            <span className="text-destructive ml-2">• {r.tasks_overdue} overdue</span>
                                        )}
                                    </div>
                                </div>
                                <span className="text-xs text-muted-foreground">{new Date(r.started_at).toLocaleDateString('pl-PL')}</span>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {sidebarCount.activeOwnOnboarding && (
                <section className="rounded-lg border-2 border-info/30 bg-info/5 p-4">
                    <p className="text-sm">
                        <strong>Masz aktywny własny onboarding.</strong>{' '}
                        <Link href="/internal/lifecycle/onboarding" className="underline text-info">
                            Otwórz swój checklist →
                        </Link>
                    </p>
                </section>
            )}
        </div>
    )
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
    return (
        <div className="rounded-lg border bg-card p-4">
            <div className={`flex items-center gap-2 ${color}`}>
                {icon}
                <span className="text-xs uppercase tracking-wide">{label}</span>
            </div>
            <div className="text-3xl font-bold mt-2">{value}</div>
        </div>
    )
}

async function ManagerLifecycleView() {
    // For now manager just sees the onboarding queue filtered to their team via RLS.
    const onboardings = await listOnboardingQueue()
    return (
        <div className="container mx-auto p-6 space-y-6 max-w-7xl">
            <header>
                <h1 className="text-2xl font-bold">Lifecycle zespołu</h1>
                <p className="text-sm text-muted-foreground">Onboardingi i offboardingi pracowników, których jesteś managerem.</p>
            </header>
            {onboardings.length === 0 ? (
                <p className="text-sm text-muted-foreground">Brak aktywnych procesów w zespole.</p>
            ) : (
                <div className="space-y-2">
                    {onboardings.map((r) => (
                        <Link
                            key={r.progress_id}
                            href={`/internal/lifecycle/onboarding/${r.progress_id}`}
                            className="flex items-center justify-between p-4 rounded border bg-card hover:bg-accent"
                        >
                            <div>
                                <div className="font-medium">{r.full_name ?? r.email}</div>
                                <div className="text-xs text-muted-foreground">{r.tasks_completed} / {r.tasks_total} zadań</div>
                            </div>
                            {r.tasks_overdue > 0 && (
                                <span className="text-xs px-2 py-1 rounded bg-destructive/20 text-destructive">{r.tasks_overdue} overdue</span>
                            )}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}
