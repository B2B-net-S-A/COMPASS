'use client'

// Phase 41c — włącznik przekierowania poczty przy pojedynczym urlopie.
//
// Reguła Outlooka nie ma warunków czasowych: raz założona, kopiuje pocztę do
// zastępcy dopóki ktoś jej nie skasuje. Do tej pory tym „kimś" był wyłącznie cron —
// a gdy cron milczał (weryfikacja 2026-07-27: nie wykonuje się wcale), pracownik
// nie miał żadnej drogi, żeby zatrzymać przekierowanie. Ten przycisk jest tą drogą:
// idzie prosto do Graph, natychmiast.
//
// Pokazujemy dwie rzeczy naraz, bo potrafią się rozjechać:
//   • zgoda      — czego chce pracownik (kolumna forward_mail_enabled),
//   • stan reguły — co faktycznie dzieje się w skrzynce (outlook_forward_rule_id).
// Zgoda przed urlopem bez reguły to normalne. Reguła bez zgody to problem — i wtedy
// właśnie trzeba to widzieć.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Forward, Loader2, MailX } from 'lucide-react'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { setLeaveMailForward } from '@/lib/actions/internal-leave'

interface Props {
    leaveId: string
    /** Zgoda zapisana na wniosku. */
    enabled: boolean
    /** Czy reguła istnieje teraz w skrzynce. */
    ruleActive: boolean
    substituteName: string | null
}

export function ForwardToggle({ leaveId, enabled, ruleActive, substituteName }: Props) {
    const router = useRouter()
    const [pending, startTransition] = useTransition()
    // Optymistycznie, żeby przycisk reagował od razu — serwer i tak jest źródłem prawdy
    // przy najbliższym odświeżeniu.
    const [on, setOn] = useState(enabled)
    const [active, setActive] = useState(ruleActive)

    function handleToggle() {
        const next = !on
        startTransition(async () => {
            try {
                const res = await setLeaveMailForward(leaveId, next)
                setOn(res.enabled)
                setActive(res.ruleActive)
                if (res.warning) {
                    toast.warning(res.warning)
                } else if (res.enabled) {
                    toastSuccess(
                        res.ruleActive
                            ? `Poczta jest już przekazywana do: ${substituteName ?? 'zastępcy'}.`
                            : 'Zapisano. Przekazywanie ruszy pierwszego dnia urlopu.',
                    )
                } else {
                    toastSuccess('Przekazywanie poczty wyłączone.')
                }
                router.refresh()
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Nie udało się zmienić ustawienia.')
            }
        })
    }

    return (
        <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-xs inline-flex items-center gap-1">
                {active ? (
                    <>
                        <Forward className="h-3 w-3 text-success" />
                        <span className="text-success">
                            Poczta przekazywana do: {substituteName ?? 'zastępcy'}
                        </span>
                    </>
                ) : on ? (
                    <>
                        <Forward className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                            Przekazywanie włączone — ruszy pierwszego dnia urlopu
                        </span>
                    </>
                ) : (
                    <>
                        <MailX className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">Poczta nie jest przekazywana</span>
                    </>
                )}
            </span>
            <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[11px]"
                disabled={pending}
                onClick={handleToggle}
            >
                {pending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                ) : on ? (
                    'Wyłącz'
                ) : (
                    'Włącz'
                )}
            </Button>
        </div>
    )
}
