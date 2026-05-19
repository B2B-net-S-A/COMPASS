'use client'

// Phase 25c — TCM/admin manually sends the exit-interview invitation email
// to the employee and/or the offboarding checklist email to the manager,
// after the fact. Shown on the exit interview detail page (status=scheduled).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { sendExitInvitationNow, sendOffboardingChecklistNow } from '@/lib/actions/lifecycle'

interface Props {
    interviewId: string
    employeeName: string | null
    employeeEmail: string | null
    invitationSentAt: string | null
    invitationSentByName: string | null
    managerName: string | null
    managerEmail: string | null
    managerChecklistSentAt: string | null
    managerChecklistSentByName: string | null
}

export function ExitEmailsCard({
    interviewId,
    employeeName,
    employeeEmail,
    invitationSentAt,
    invitationSentByName,
    managerName,
    managerEmail,
    managerChecklistSentAt,
    managerChecklistSentByName,
}: Props) {
    const router = useRouter()
    const [pendingKind, setPendingKind] = useState<'invitation' | 'checklist' | null>(null)
    const [confirm, setConfirm] = useState<'invitation' | 'checklist' | null>(null)
    const [, startTransition] = useTransition()

    const invitationSent = invitationSentAt !== null
    const checklistSent = managerChecklistSentAt !== null

    function handleSendInvitation() {
        if (invitationSent && confirm !== 'invitation') {
            setConfirm('invitation')
            return
        }
        setPendingKind('invitation')
        startTransition(async () => {
            try {
                await sendExitInvitationNow(interviewId)
                toastSuccess(`Zaproszenie do exit interview wysłane do ${employeeEmail}.`)
                setConfirm(null)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Nie udało się wysłać zaproszenia.')
            } finally {
                setPendingKind(null)
            }
        })
    }

    function handleSendChecklist() {
        if (checklistSent && confirm !== 'checklist') {
            setConfirm('checklist')
            return
        }
        setPendingKind('checklist')
        startTransition(async () => {
            try {
                await sendOffboardingChecklistNow(interviewId)
                toastSuccess(`Checklist offboardingu wysłany do managera (${managerEmail}).`)
                setConfirm(null)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Nie udało się wysłać checklist&apos;a.')
            } finally {
                setPendingKind(null)
            }
        })
    }

    if (!employeeEmail) return null // anonymized — nothing to send

    return (
        <section className="rounded-lg border bg-card p-4 space-y-4">
            <h2 className="font-semibold text-sm flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Powiadomienia email
            </h2>
            <p className="text-xs text-muted-foreground -mt-2">
                Phase 25c — emaile NIE są wysyłane automatycznie przy planowaniu exit interview. Użyj przycisków poniżej, gdy chcesz powiadomić pracownika/managera.
            </p>

            {/* Invitation to employee */}
            <div className="rounded border bg-background p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <div className="text-sm font-medium">Zaproszenie do ankiety — pracownik</div>
                        <div className="text-xs text-muted-foreground">{employeeName ?? employeeEmail}</div>
                    </div>
                    {invitationSent && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-400/10 px-2 py-0.5 text-[11px] text-green-500">
                            <Check className="h-3 w-3" /> Wysłany
                        </span>
                    )}
                </div>
                {invitationSent && (
                    <p className="text-[11px] text-muted-foreground">
                        Ostatnio: {new Date(invitationSentAt!).toLocaleString('pl-PL')}
                        {invitationSentByName && <> przez {invitationSentByName}</>}.
                    </p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        size="sm"
                        variant={invitationSent ? 'outline' : 'default'}
                        onClick={handleSendInvitation}
                        disabled={pendingKind !== null}
                    >
                        {pendingKind === 'invitation'
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                            : <Mail className="h-3.5 w-3.5 mr-1.5" />}
                        {invitationSent
                            ? (confirm === 'invitation' ? 'Potwierdź ponowne wysłanie' : 'Wyślij ponownie')
                            : 'Wyślij zaproszenie teraz'}
                    </Button>
                    {confirm === 'invitation' && pendingKind === null && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(null)}>Anuluj</Button>
                    )}
                </div>
            </div>

            {/* Checklist to manager */}
            {managerEmail ? (
                <div className="rounded border bg-background p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <div className="text-sm font-medium">Checklist offboardingu — manager</div>
                            <div className="text-xs text-muted-foreground">{managerName ?? managerEmail}</div>
                        </div>
                        {checklistSent && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-green-400/10 px-2 py-0.5 text-[11px] text-green-500">
                                <Check className="h-3 w-3" /> Wysłany
                            </span>
                        )}
                    </div>
                    {checklistSent && (
                        <p className="text-[11px] text-muted-foreground">
                            Ostatnio: {new Date(managerChecklistSentAt!).toLocaleString('pl-PL')}
                            {managerChecklistSentByName && <> przez {managerChecklistSentByName}</>}.
                        </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            size="sm"
                            variant={checklistSent ? 'outline' : 'default'}
                            onClick={handleSendChecklist}
                            disabled={pendingKind !== null}
                        >
                            {pendingKind === 'checklist'
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                : <Mail className="h-3.5 w-3.5 mr-1.5" />}
                            {checklistSent
                                ? (confirm === 'checklist' ? 'Potwierdź ponowne wysłanie' : 'Wyślij ponownie')
                                : 'Wyślij checklist teraz'}
                        </Button>
                        {confirm === 'checklist' && pendingKind === null && (
                            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirm(null)}>Anuluj</Button>
                        )}
                    </div>
                </div>
            ) : (
                <p className="text-xs text-muted-foreground italic">
                    Pracownik nie ma przypisanego managera — nie można wysłać checklist&apos;a.
                </p>
            )}
        </section>
    )
}
