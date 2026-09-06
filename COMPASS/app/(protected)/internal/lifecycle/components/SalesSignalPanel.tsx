'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Plus, Radio, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/lib/toast'
import { toastSuccess } from '@/lib/toast-success'
import { addSalesSignal, deleteSalesSignal, listSalesSignals, type SalesSignal } from '@/lib/actions/lifecycle'

/**
 * Sygnał sprzedażowy usłyszany od konsultanta.
 *
 * Siostrzany wobec LifecycleNotesPanel, ale świadomie ODDZIELNY: notatka
 * kadrowa zostaje w COMPASSIE, a to trafia do CRM-u. Dlatego formularz mówi
 * wprost, co i o kim wychodzi — etykieta jest tu mechanizmem zgody, nie
 * ozdobą, i nie należy jej skracać przy porządkach w UI.
 */

interface Props {
    /** Konsultant, od którego pochodzi cynk. */
    userId: string
}

export function SalesSignalPanel({ userId }: Props) {
    const router = useRouter()
    const [signals, setSignals] = useState<SalesSignal[]>([])
    const [loading, setLoading] = useState(true)
    const [showAdd, setShowAdd] = useState(false)
    const [companyName, setCompanyName] = useState('')
    const [need, setNeed] = useState('')
    const [contactHint, setContactHint] = useState('')
    const [context, setContext] = useState('')
    const [isPending, startTransition] = useTransition()

    useEffect(() => {
        let cancelled = false
        listSalesSignals(userId)
            .then((data) => { if (!cancelled) setSignals(data) })
            .catch(() => undefined)
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [userId])

    function resetForm() {
        setCompanyName('')
        setNeed('')
        setContactHint('')
        setContext('')
    }

    function handleAdd() {
        if (!companyName.trim()) {
            toast.error('Nazwa firmy jest wymagana.')
            return
        }
        if (!need.trim()) {
            toast.error('Opisz, czego klient potrzebuje.')
            return
        }
        startTransition(async () => {
            try {
                await addSalesSignal({
                    consultantId: userId,
                    companyName: companyName.trim(),
                    need: need.trim(),
                    contactHint: contactHint.trim() || undefined,
                    context: context.trim() || undefined,
                })
                toastSuccess('Sygnał zapisany — trafi do CRM przy najbliższej synchronizacji.')
                resetForm()
                setShowAdd(false)
                const updated = await listSalesSignals(userId)
                setSignals(updated)
                router.refresh()
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Błąd zapisu sygnału.')
            }
        })
    }

    function handleDelete(id: string) {
        if (!confirm('Usunąć sygnał?')) return
        startTransition(async () => {
            try {
                await deleteSalesSignal(id)
                setSignals((prev) => prev.filter((s) => s.id !== id))
                router.refresh()
            } catch (e) {
                toast.error(e instanceof Error ? e.message : 'Błąd usuwania sygnału.')
            }
        })
    }

    return (
        <div className="rounded-lg border bg-card overflow-hidden">
            <div className="bg-muted/50 p-3 border-b flex items-center justify-between">
                <h2 className="font-semibold text-sm flex items-center gap-2">
                    <Radio className="h-4 w-4" />
                    Sygnały sprzedażowe ({signals.length})
                </h2>
                <Button size="sm" onClick={() => setShowAdd((v) => !v)} disabled={isPending}>
                    <Plus className="h-3 w-3 mr-1" />
                    Dodaj
                </Button>
            </div>

            {showAdd && (
                <div className="p-4 border-b bg-muted/20 space-y-3">
                    {/* Nie skracać — to jest informacja o tym, co i o kim wychodzi poza COMPASSA. */}
                    <p className="rounded border border-info/30 bg-info/10 px-3 py-2 text-xs text-info">
                        Ten wpis trafia do CRM (Atlas) razem z <strong>imieniem i e-mailem konsultanta</strong>,
                        żeby handel mógł podziękować i rozliczyć bonus za polecenie. Notatki kadrowe zostają
                        w COMPASSIE — tu wpisuj tylko to, co ma zobaczyć sprzedaż.
                    </p>

                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Firma klienta *</label>
                        <input
                            className="w-full rounded border bg-background px-3 py-2 text-sm"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            placeholder="Nazwa firmy tak, jak padła w rozmowie"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Czego potrzebują? *</label>
                        <textarea
                            className="w-full rounded border bg-background px-3 py-2 text-sm"
                            rows={3}
                            value={need}
                            onChange={(e) => setNeed(e.target.value)}
                            placeholder="Np. szukają trzech seniorów Java do zespołu płatności, start w Q4"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Kontakt / wskazówka</label>
                        <input
                            className="w-full rounded border bg-background px-3 py-2 text-sm"
                            value={contactHint}
                            onChange={(e) => setContactHint(e.target.value)}
                            placeholder="Kto decyduje, do kogo się odezwać"
                        />
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Skąd to wiadomo?</label>
                        <input
                            className="w-full rounded border bg-background px-3 py-2 text-sm"
                            value={context}
                            onChange={(e) => setContext(e.target.value)}
                            placeholder="Np. konsultant pracuje u nich od roku"
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setShowAdd(false); resetForm() }}
                            disabled={isPending}
                        >
                            Anuluj
                        </Button>
                        <Button size="sm" onClick={handleAdd} disabled={isPending}>
                            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Zapisz'}
                        </Button>
                    </div>
                </div>
            )}

            {loading ? (
                <p className="p-6 text-sm text-muted-foreground text-center">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Ładowanie...
                </p>
            ) : signals.length === 0 ? (
                <p className="p-6 text-sm text-muted-foreground text-center">
                    Brak sygnałów. Jeśli konsultant wspomniał o potrzebie u klienta — zapisz ją tutaj.
                </p>
            ) : (
                <ul className="divide-y">
                    {signals.map((s) => (
                        <li key={s.id} className="p-3 flex items-start justify-between gap-3">
                            <div className="min-w-0 space-y-1">
                                <p className="text-sm font-medium">{s.company_name}</p>
                                <p className="text-sm whitespace-pre-wrap text-muted-foreground">{s.need}</p>
                                {s.contact_hint && (
                                    <p className="text-[11px] text-muted-foreground">
                                        Kontakt: {s.contact_hint}
                                    </p>
                                )}
                                <p className="text-[11px] text-muted-foreground">
                                    {new Date(s.created_at).toLocaleString('pl-PL')}
                                </p>
                            </div>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDelete(s.id)}
                                disabled={isPending}
                                aria-label="Usuń sygnał"
                            >
                                <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}
