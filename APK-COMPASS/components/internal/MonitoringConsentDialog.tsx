'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, ExternalLink } from 'lucide-react'
import { acceptMonitoringConsent } from '@/lib/actions/internal-clock'
import { WORK_MONITORING_TERMS_VERSION } from '@/lib/clock/constants'
import { toast } from '@/lib/toast'

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    onAccepted: () => void
}

export function MonitoringConsentDialog({ open, onOpenChange, onAccepted }: Props) {
    const [accepted, setAccepted] = useState(false)
    const [pending, startTransition] = useTransition()

    function handleAccept() {
        if (!accepted) return
        startTransition(async () => {
            try {
                await acceptMonitoringConsent(WORK_MONITORING_TERMS_VERSION)
                toast.success('Zgoda zarejestrowana — możesz włączyć zegar pracy')
                onAccepted()
                onOpenChange(false)
            } catch (e: unknown) {
                toast.error(e instanceof Error ? e.message : 'Błąd zapisu zgody')
            }
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Zgoda na monitoring czasu pracy</DialogTitle>
                    <DialogDescription>
                        Zanim włączysz zegar pracy, potrzebujemy Twojej świadomej zgody na pomiar
                        aktywności (KP art. 22³ §2, RODO).
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 text-sm text-muted-foreground">
                    <p>
                        <strong className="text-foreground">Co mierzymy:</strong> w czasie aktywnej
                        sesji co 30s wysyłamy do serwera informację, czy w ostatnim oknie była
                        aktywność klawiatury/myszki w przeglądarce. Zapisujemy moment startu i
                        zakończenia sesji oraz informację o urządzeniu (np. &bdquo;Chrome on macOS&rdquo;).
                    </p>
                    <p>
                        <strong className="text-foreground">Czego NIE mierzymy:</strong> nie
                        zapisujemy treści tego, co piszesz, nie robimy zrzutów ekranu, nie czytamy
                        adresów stron ani treści dokumentów. NIE słuchamy mikrofonu ani nie
                        oglądamy kamery — sprawdzamy jedynie <em>czy</em> masz aktywny call
                        (status sesji medialnej w przeglądarce), żeby nie liczyć Cię jako idle podczas
                        spotkania (Phase 17b R7).
                    </p>
                    <p>
                        <strong className="text-foreground">Idle detection:</strong> jeśli przez
                        20+ minut nie wykryjemy aktywności, czas przerwy nie zostanie zaliczony do
                        godzin pracy. Po 50 min pojawi się ostrzeżenie &bdquo;Czy wciąż pracujesz?&rdquo;,
                        po 60 min sesja zostanie automatycznie zamknięta. Podczas wykrytego callu
                        próg wydłużamy do 60 min (Phase 17b R7).
                    </p>
                    <p>
                        <strong className="text-foreground">Pauza:</strong> w każdej chwili możesz
                        kliknąć &bdquo;Pauza&rdquo; (30/60/120 min) — w tym czasie zegar nie liczy
                        aktywności. Każda pauza jest zapisywana w historii sesji.
                    </p>
                    <p>
                        <strong className="text-foreground">Retencja:</strong> sesje przechowujemy
                        przez 5 lat (Kodeks Pracy art. 94⁴), heartbeats (audit trail) — 90 dni.
                    </p>
                    <p>
                        <strong className="text-foreground">Cofnięcie zgody:</strong> w każdej chwili
                        możesz cofnąć zgodę w ustawieniach — dotychczasowe sesje pozostaną w
                        ewidencji, ale zegar przestanie działać.
                    </p>
                    <p>
                        <Link
                            href="/privacy/work-monitoring"
                            target="_blank"
                            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300 underline"
                        >
                            Pełna polityka monitoringu czasu pracy
                            <ExternalLink className="h-3 w-3" />
                        </Link>
                    </p>
                </div>

                <div className="flex items-start gap-2 pt-2">
                    <Checkbox
                        id="consent-checkbox"
                        checked={accepted}
                        onCheckedChange={(v) => setAccepted(v === true)}
                    />
                    <label htmlFor="consent-checkbox" className="text-sm leading-tight cursor-pointer">
                        Zapoznałem się z polityką monitoringu czasu pracy i wyrażam zgodę na pomiar
                        moich godzin pracy w sposób opisany powyżej.
                    </label>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                        Anuluj
                    </Button>
                    <Button onClick={handleAccept} disabled={!accepted || pending}>
                        {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Akceptuję
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
