import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createLifecycleClient as createClient, createLifecycleAdminClient } from '@/lib/supabase/lifecycle-client'
import { requireLifecycleManagerAction } from '@/lib/auth/internal-guard'
import { ExitInterviewReviewPanel } from '../../components/ExitInterviewReviewPanel'
import { CancelExitButton } from '../../components/CancelExitButton'
import { LifecycleNotesPanel } from '../../components/LifecycleNotesPanel'
import { AuditHistoryPanel } from '../../components/AuditHistoryPanel'
import { ExitEmailsCard } from '../../components/ExitEmailsCard'
import type { ExitInterview } from '@/lib/types/lifecycle'

export const dynamic = 'force-dynamic'

export default async function ExitInterviewReviewPage({ params }: { params: { interviewId: string } }) {
    await requireLifecycleManagerAction() // TCM/admin only

    const supabase = createClient()
    const { data: interview, error } = await supabase
        .from('exit_interviews')
        .select('*, user:profiles!user_id(full_name, email)')
        .eq('id', params.interviewId)
        .single()

    if (error || !interview) notFound()

    const i = interview as ExitInterview & { user: { full_name: string | null; email: string | null } | null }

    // Phase 25c: prefetch manager + actor names for ExitEmailsCard
    const adminClient = createLifecycleAdminClient()
    let managerInfo: { full_name: string | null; email: string | null; manager_id: string | null } | null = null
    let managerProfile: { full_name: string | null; email: string | null } | null = null
    if (i.user_id) {
        const { data } = await adminClient
            .from('profiles')
            .select('manager_id')
            .eq('id', i.user_id)
            .maybeSingle()
        if (data?.manager_id) {
            const { data: mgr } = await adminClient
                .from('profiles')
                .select('full_name, email')
                .eq('id', data.manager_id)
                .maybeSingle()
            if (mgr) managerProfile = mgr
        }
        managerInfo = { full_name: managerProfile?.full_name ?? null, email: managerProfile?.email ?? null, manager_id: data?.manager_id ?? null }
    }

    async function lookupActor(uuid: string | null): Promise<string | null> {
        if (!uuid) return null
        const { data } = await adminClient
            .from('profiles')
            .select('full_name, email')
            .eq('id', uuid)
            .maybeSingle()
        return data?.full_name ?? data?.email ?? null
    }
    const invitationSentByName = await lookupActor(i.invitation_sent_by)
    const managerChecklistSentByName = await lookupActor(i.manager_checklist_sent_by)

    return (
        <div className="container mx-auto p-6 max-w-3xl space-y-6">
            <header>
                <Link href="/internal/lifecycle/exit" className="text-xs text-muted-foreground underline">
                    ← Powrót do kolejki
                </Link>
                <h1 className="text-2xl font-bold mt-1">
                    Exit interview — {i.is_anonymous ? <em>anonimowo</em> : i.user?.full_name ?? i.user?.email}
                </h1>
                <p className="text-sm text-muted-foreground">
                    Status: <strong>{i.status}</strong> • Rola: {i.role_snapshot} • Staż: {i.tenure_months ?? '?'} mies.
                </p>
            </header>

            <ExitInterviewReviewPanel interview={i} />

            {i.status === 'scheduled' && i.user_id && (
                <ExitEmailsCard
                    interviewId={i.id}
                    employeeName={i.user?.full_name ?? null}
                    employeeEmail={i.user?.email ?? null}
                    invitationSentAt={i.invitation_sent_at}
                    invitationSentByName={invitationSentByName}
                    managerName={managerInfo?.full_name ?? null}
                    managerEmail={managerInfo?.email ?? null}
                    managerChecklistSentAt={i.manager_checklist_sent_at}
                    managerChecklistSentByName={managerChecklistSentByName}
                />
            )}

            {i.status === 'scheduled' && (
                <section className="rounded-lg border border-dashed border-destructive/30 p-4">
                    <h3 className="font-semibold text-sm mb-2 text-destructive">Strefa niebezpieczna</h3>
                    <p className="text-xs text-muted-foreground mb-3">
                        Anuluj jeśli pracownik jednak zostaje — przywróci status active i usunie offboarding tasks.
                    </p>
                    <CancelExitButton interviewId={i.id} />
                </section>
            )}

            {i.user_id && (
                <section>
                    <LifecycleNotesPanel userId={i.user_id} defaultCategory="exit" />
                </section>
            )}

            {i.user_id && (
                <section>
                    <AuditHistoryPanel userId={i.user_id} />
                </section>
            )}
        </div>
    )
}
