'use client'

// Phase 25c — TCM/admin manually triggers the welcome onboarding email after the fact.
// Shown on the onboarding detail page below the checklist. Default state: never sent;
// once sent, the card shows the sent timestamp and offers a "send again" button (still
// audited, so multiple sends are visible in the audit trail).

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Loader2, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { sendOnboardingWelcomeEmailNow } from '@/lib/actions/lifecycle'

interface Props {
    progressId: string
    employeeName: string
    employeeEmail: string
    sentAt: string | null
    sentByName: string | null
}

export function WelcomeEmailCard({ progressId, employeeName, employeeEmail, sentAt, sentByName }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [confirmResend, setConfirmResend] = useState(false)

    const wasSent = sentAt !== null

    function handleSend() {
        if (wasSent && !confirmResend) {
            setConfirmResend(true)
            return
        }
        startTransition(async () => {
            try {
                await sendOnboardingWelcomeEmailNow(progressId)
                toastSuccess(`Email powitalny wysłany do ${employeeEmail}.`)
                setConfirmResend(false)
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Nie udało się wysłać emaila.')
            }
        })
    }

    return (
        <section className="rounded-lg border bg-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                    <Mail className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div>
                        <h3 className="font-semibold text-sm">Email powitalny</h3>
                        <p className="text-xs text-muted-foreground">
                            Powiadomienie do {employeeName} ({employeeEmail}) z linkiem do checklist&apos;a.
                        </p>
                    </div>
                </div>
                {wasSent && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-400/10 px-2 py-0.5 text-[11px] text-green-500">
                        <Check className="h-3 w-3" /> Wysłany
                    </span>
                )}
            </div>

            {wasSent ? (
                <p className="text-xs text-muted-foreground">
                    Ostatnio wysłany: <strong>{new Date(sentAt!).toLocaleString('pl-PL')}</strong>
                    {sentByName && <> przez <strong>{sentByName}</strong></>}.
                </p>
            ) : (
                <p className="text-xs text-muted-foreground">
                    Email <strong>nie został jeszcze wysłany</strong> — phase 25c domyślnie nie wysyła emaili automatycznie przy starcie onboardingu, by uniknąć spamowania external mailboxów.
                </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
                <Button
                    type="button"
                    size="sm"
                    variant={wasSent ? 'outline' : 'default'}
                    onClick={handleSend}
                    disabled={isPending}
                >
                    {isPending
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                        : <Mail className="h-3.5 w-3.5 mr-1.5" />}
                    {wasSent
                        ? (confirmResend ? 'Potwierdź ponowne wysłanie' : 'Wyślij ponownie')
                        : 'Wyślij email powitalny teraz'}
                </Button>
                {confirmResend && !isPending && (
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmResend(false)}
                    >
                        Anuluj
                    </Button>
                )}
            </div>
        </section>
    )
}
