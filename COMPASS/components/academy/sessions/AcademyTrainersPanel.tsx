'use client'

import { useState } from 'react'
import { useAcademyAction } from '@/components/academy/useAcademyAction'
import { useRouter } from 'next/navigation'
import { Loader2, Search, ShieldCheck, UserRoundCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/shared/ConfirmDialog'
import { setAcademyTrainer } from '@/lib/actions/academy-access'
import { AcademyEmptyState } from '../AcademyEmptyState'

export interface AcademyTrainerRow {
    id: string
    full_name: string | null
    email: string
    role: string
    canTeach: boolean
    grantedAt: string | null
}

export function AcademyTrainersPanel({ trainers, search }: { trainers: AcademyTrainerRow[]; search: string }) {
    const router = useRouter()
    const [error, setError] = useState<string | null>(null)
    const [message, setMessage] = useState<string | null>(null)
    const [busyId, setBusyId] = useState<string | null>(null)
    const [isPending, startTransition] = useAcademyAction()
    const [confirm, ConfirmUI] = useConfirm()
    async function toggle(person: AcademyTrainerRow) {
        const enabled = !person.canTeach
        if (!await confirm({ title: enabled ? 'Nadać uprawnienie trenera?' : 'Odebrać uprawnienie trenera?', description: enabled ? `${person.full_name || person.email} będzie móc tworzyć i prowadzić szkolenia. Publikacja nadal wymaga akceptacji administratora.` : `${person.full_name || person.email} utraci możliwość tworzenia i edycji szkoleń. Materiały i historia pozostaną zachowane; zaplanowane spotkania trzeba przekazać innemu prowadzącemu.`, confirmLabel: enabled ? 'Nadaj uprawnienie' : 'Odbierz uprawnienie', variant: enabled ? 'default' : 'destructive' })) return
        setError(null)
        setMessage(null)
        setBusyId(person.id)
        startTransition(async () => { try {
            const result = await setAcademyTrainer(person.id, enabled)
            if (!result.success) { setError(result.error); return }
            setMessage(enabled ? `Nadano uprawnienie trenera: ${person.full_name || person.email}.` : `Odebrano uprawnienie trenera: ${person.full_name || person.email}.`)
            router.refresh()
        } catch { setError('Nie udało się zmienić uprawnienia. Spróbuj ponownie.') } finally { setBusyId(null) } })
    }
    return <div className="space-y-5">
        <form key={search} action="/admin/learning/trainers" method="get" className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end"><div className="flex-1 space-y-2"><label htmlFor="academy-trainer-search" className="text-sm font-medium">Znajdź konsultanta</label><Input id="academy-trainer-search" name="q" type="search" defaultValue={search} maxLength={100} placeholder="Imię, nazwisko lub adres e-mail" /></div><Button type="submit" variant="outline"><Search aria-hidden="true" />Szukaj</Button></form>
        {error && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
        {message && <p role="status" className="rounded-xl border border-success/20 bg-success/5 p-4 text-sm text-success">{message}</p>}
        {trainers.length === 0 ? <AcademyEmptyState title="Nie znaleziono pasujących kont" description="Sprawdź imię lub e-mail. Uprawnienie prowadzenia możesz nadać konsultantowi z aktywnym kontem Compass." variant="filtered" /> : <section aria-label="Uprawnienia prowadzących" className="overflow-hidden rounded-2xl border border-border bg-card"><div className="border-b border-border px-5 py-4 text-sm text-muted-foreground">Wyświetlono {trainers.length} kont. Wyszukaj konkretną osobę, jeśli nie ma jej na liście.</div><div className="divide-y divide-border">{trainers.map((person) => <div key={person.id} className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"><div className="flex min-w-0 items-start gap-3"><span className="rounded-xl bg-muted p-2.5 text-muted-foreground">{person.role === 'admin' ? <ShieldCheck aria-hidden="true" className="size-5" /> : <UserRoundCheck aria-hidden="true" className="size-5" />}</span><div className="min-w-0 space-y-1"><p className="break-words text-sm font-semibold">{person.full_name || person.email}</p><p className="break-all text-xs text-muted-foreground">{person.email}</p><p className="text-xs text-muted-foreground">{person.role === 'admin' ? 'Administrator · uprawnienia wynikają z roli' : person.canTeach ? 'Trener · tworzenie i prowadzenie własnych szkoleń' : 'Uczestnik · dostęp do nauki'}</p></div></div>{person.role !== 'admin' && <Button variant={person.canTeach ? 'outline' : 'default'} disabled={isPending || busyId !== null} onClick={() => toggle(person)} className="shrink-0">{busyId === person.id && <Loader2 className="animate-spin" aria-hidden="true" />}{person.canTeach ? 'Odbierz uprawnienie' : 'Nadaj uprawnienie trenera'}</Button>}</div>)}</div></section>}
        <ConfirmUI />
    </div>
}
